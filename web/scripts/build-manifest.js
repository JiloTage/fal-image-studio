import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputsDir = path.resolve(__dirname, "..", "..", "outputs");
const publicDir = path.resolve(__dirname, "..", "public");
const manifestPath = path.resolve(publicDir, "outputs.json");

function parseFilenameMetadata(filename) {
  const match = filename.match(/^(.*)_(\d{8})_(\d{6})\.json$/);
  if (!match) {
    return { model: filename.replace(/\.json$/i, ""), timestamp: "" };
  }

  const [, model, datePart, timePart] = match;
  const isoTimestamp = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}.000Z`;
  return { model, timestamp: isoTimestamp };
}

function extractImages(payload) {
  const rawResult = payload?.result && typeof payload.result === "object" ? payload.result : payload;
  const urls = [];

  if (Array.isArray(payload?.imageUrls)) {
    urls.push(...payload.imageUrls);
  }
  if (Array.isArray(rawResult?.images)) {
    for (const image of rawResult.images) {
      if (image?.url) urls.push(image.url);
    }
  }
  if (rawResult?.image?.url) {
    urls.push(rawResult.image.url);
  }

  return [...new Set(urls.filter(Boolean))];
}

async function buildManifest() {
  await mkdir(publicDir, { recursive: true });

  let files = [];
  try {
    files = await readdir(outputsDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(manifestPath, "[]\n", "utf8");
      console.log("No outputs directory found. Wrote empty manifest.");
      return;
    }
    throw error;
  }

  const manifestEntries = [];

  for (const filename of files.filter((file) => file.endsWith(".json"))) {
    const filePath = path.join(outputsDir, filename);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const fallback = parseFilenameMetadata(filename);

    manifestEntries.push({
      model: parsed?.model || fallback.model,
      prompt: parsed?.prompt || "",
      timestamp: parsed?.timestamp || fallback.timestamp,
      filename,
      inputImages: Array.isArray(parsed?.input_images)
        ? parsed.input_images
        : Array.isArray(parsed?.inputImages)
          ? parsed.inputImages
          : [],
      imageUrls: extractImages(parsed),
    });
  }

  manifestEntries.sort((a, b) => (Date.parse(b.timestamp || "") || 0) - (Date.parse(a.timestamp || "") || 0));

  await writeFile(manifestPath, `${JSON.stringify(manifestEntries, null, 2)}\n`, "utf8");
  console.log(`Wrote ${manifestEntries.length} output entries to ${manifestPath}`);
}

buildManifest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
