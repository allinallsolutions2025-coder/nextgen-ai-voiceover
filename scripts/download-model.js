import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const modelRoot = resolve(root, "public/models", modelId);
const apiUrl = `https://huggingface.co/api/models/${modelId}`;

const englishVoices = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica",
  "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah",
  "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir",
  "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
];

const files = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
  ...englishVoices.map(voice => `voices/${voice}.bin`)
];

async function downloadFile(revision, relativePath) {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  const url = `https://huggingface.co/${modelId}/resolve/${revision}/${encodedPath}`;
  const destination = resolve(modelRoot, relativePath);
  const temporary = destination + ".part";
  await mkdir(dirname(destination), { recursive: true });

  if (process.env.FORCE_MODEL_DOWNLOAD !== "1") {
    try {
      const existing = await stat(destination);
      if (existing.size > 0) {
        console.log(`Already bundled: ${relativePath} (${existing.size.toLocaleString()} bytes)`);
        return existing.size;
      }
    } catch { /* Download the missing file. */ }
  }

  console.log(`Downloading ${relativePath}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${relativePath}: HTTP ${response.status}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const downloaded = await stat(temporary);
    if (downloaded.size === 0) throw new Error(`Downloaded file is empty: ${relativePath}`);
    if (relativePath === "onnx/model_quantized.onnx" && downloaded.size < 50 * 1024 * 1024) {
      throw new Error("The quantized ONNX model is unexpectedly small; refusing to package an incomplete model.");
    }
    if (relativePath.startsWith("voices/") && downloaded.size < 1000) {
      throw new Error(`Voice pack is unexpectedly small: ${relativePath}`);
    }
    await rename(temporary, destination);
    return downloaded.size;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

const metadataResponse = await fetch(apiUrl, { redirect: "follow" });
if (!metadataResponse.ok) throw new Error(`Could not read Hugging Face model metadata: HTTP ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const revision = process.env.KOKORO_MODEL_REVISION || metadata.sha || "main";
const markerPath = resolve(modelRoot, ".revision");

let previousRevision = "";
try { previousRevision = (await readFile(markerPath, "utf8")).trim(); } catch { /* First install. */ }
if (previousRevision && previousRevision !== revision) {
  await rm(modelRoot, { recursive: true, force: true });
}
await mkdir(modelRoot, { recursive: true });

let totalBytes = 0;
for (const file of files) totalBytes += await downloadFile(revision, file);

const manifest = {
  model: modelId,
  revision,
  dtype: "q8",
  onnxFile: "onnx/model_quantized.onnx",
  voices: englishVoices,
  files,
  totalBytes,
  preparedAt: new Date().toISOString()
};
await writeFile(resolve(modelRoot, "nextgen-model-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(markerPath, revision + "\n", "utf8");

console.log(`Bundled Kokoro English q8 model revision ${revision}: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB across ${files.length} files.`);
