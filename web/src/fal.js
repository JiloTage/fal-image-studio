import { fal } from "@fal-ai/client";

const GH_TOKEN_KEY = "gh_pat";
const GH_REPO_KEY = "gh_repo";
const ENV_KEY = import.meta.env.VITE_FAL_KEY || "";

// ─── API Key ───

export function getApiKey() {
  return ENV_KEY || "";
}

export function hasApiKey() {
  return !!getApiKey();
}

// ─── GitHub Settings ───

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

// ─── fal.ai direct API ───

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

// ─── GitHub Actions dispatch ───

export async function dispatchGenerate({ model, prompt, imageUrl, cardState }) {
  const token = getGhToken();
  const repo = getGhRepo();
  if (!token || !repo) throw new Error("GitHub PAT and repo not configured");

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/generate.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          model,
          prompt,
          image_url: imageUrl || "",
          card_state_b64: encodeBase64JSON(cardState),
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
}

// ─── Manifest polling ───

export async function fetchManifest(baseUrl) {
  const res = await fetch(`${baseUrl}outputs.json`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

// ─── JSON download ───

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
