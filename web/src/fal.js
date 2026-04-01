import { fal } from "@fal-ai/client";

const GH_TOKEN_KEY = "gh_pat";
const GH_REPO_KEY = "gh_repo";
const ENV_KEY = import.meta.env.VITE_FAL_KEY || "";

export function getApiKey() {
  return ENV_KEY || "";
}

export function hasApiKey() {
  return !!getApiKey();
}

export function getGhToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || "";
}

export function setGhToken(token) {
  localStorage.setItem(GH_TOKEN_KEY, token);
}

function inferGhRepoFromLocation() {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname || "";
  if (!host.endsWith("github.io")) return "";

  const owner = host.replace(/\.github\.io$/i, "");
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length > 0) return `${owner}/${segments[0]}`;
  if (owner) return `${owner}/${owner}.github.io`;
  return "";
}

export function getGhRepo() {
  return localStorage.getItem(GH_REPO_KEY) || inferGhRepoFromLocation();
}

export function setGhRepo(repo) {
  localStorage.setItem(GH_REPO_KEY, repo);
}

export function hasGhConfig() {
  return !!getGhToken() && !!getGhRepo();
}

function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function encodeBase64JSON(value) {
  if (!value) return "";
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binary);
}

function ensureConfig() {
  const key = getApiKey();
  if (!key) throw new Error("FAL_KEY not set");
  fal.config({ credentials: key });
}

export async function uploadImage(file) {
  ensureConfig();
  const url = await fal.storage.upload(file);
  return url;
}

export async function runModel(endpoint, input, onProgress) {
  ensureConfig();
  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (onProgress) onProgress(update);
    },
  });
  return result.data;
}

async function githubFetch(path, init = {}) {
  const token = getGhToken();
  const repo = getGhRepo();
  if (!token || !repo) throw new Error("GitHub PAT and repo not configured");

  return fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
}

export async function dispatchGenerate({ model, prompt, imageUrl, cardState }) {
  const requestId = createRequestId();

  const res = await githubFetch("/actions/workflows/generate.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
      inputs: {
        model,
        prompt,
        image_url: imageUrl || "",
        card_state_b64: encodeBase64JSON(cardState),
        request_id: requestId,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  return { requestId };
}

export async function fetchManifest(baseUrl) {
  const res = await fetch(`${baseUrl}outputs.json`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

async function inflateZipEntry(compressionMethod, compressed) {
  if (compressionMethod === 0) return compressed;
  if (compressionMethod === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`Unsupported zip compression method: ${compressionMethod}`);
}

function findEndOfCentralDirectory(bytes, view) {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Invalid ZIP: missing end of central directory");
}

function listZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(bytes, view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP: bad central directory entry");
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const entryName = new TextDecoder().decode(bytes.slice(nameStart, nameEnd));

    entries.push({
      entryName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryData(bytes, view, entry) {
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error("Invalid ZIP: bad local file header");
  }

  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  return bytes.slice(dataStart, dataEnd);
}

async function extractJsonFromZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const entries = listZipEntries(arrayBuffer);
  const jsonEntry = entries.find((entry) => !entry.entryName.endsWith("/") && entry.entryName.toLowerCase().endsWith(".json"));

  if (!jsonEntry) {
    throw new Error("No JSON result found in artifact");
  }

  const inflated = await inflateZipEntry(
    jsonEntry.compressionMethod,
    readZipEntryData(bytes, view, jsonEntry),
  );
  return JSON.parse(new TextDecoder().decode(inflated));
}

export async function fetchActionResult(requestId) {
  if (!requestId) return null;

  const artifactName = `fal-result-${requestId}`;
  const artifactsRes = await githubFetch(`/actions/artifacts?per_page=100&name=${encodeURIComponent(artifactName)}`);
  if (!artifactsRes.ok) {
    const body = await artifactsRes.text();
    throw new Error(`GitHub artifacts API ${artifactsRes.status}: ${body}`);
  }

  const payload = await artifactsRes.json();
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const artifact = artifacts.find((item) => item?.name === artifactName && !item?.expired);
  if (!artifact?.id) return null;

  const downloadRes = await githubFetch(`/actions/artifacts/${artifact.id}/zip`, { redirect: "follow" });
  if (!downloadRes.ok) {
    const body = await downloadRes.text();
    throw new Error(`GitHub artifact download ${downloadRes.status}: ${body}`);
  }

  return extractJsonFromZip(await downloadRes.arrayBuffer());
}

function formatFileTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp || "result").replace(/[^\w.-]+/g, "_");
  }
  const pad = (v) => String(v).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("") + `_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

export function downloadResultJSON(record) {
  const model = record?.model || "result";
  const timestamp = formatFileTimestamp(record?.timestamp);
  const filename = `${model}_${timestamp}.json`;
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
