import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const modelRevision = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const modelSha256 = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";
const modelRoot = resolve(root, "public/models", modelId);
const apiUrl = `https://huggingface.co/${modelId}`;

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

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

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
        const digest = relativePath === "onnx/model_quantized.onnx" ? await sha256File(destination) : null;
        if (relativePath !== "onnx/model_quantized.onnx" || digest === modelSha256) {
          console.log(`Already bundled: ${relativePath} (${existing.size.toLocaleString()} bytes)`);
          return existing.size;
        }
        console.warn("Existing ONNX model failed SHA-256 validation; downloading the pinned file again.");
        await rm(destination, { force: true });
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
    if (relativePath === "onnx/model_quantized.onnx") {
      const digest = await sha256File(temporary);
      if (digest !== modelSha256) {
        throw new Error(`Pinned ONNX SHA-256 mismatch. Expected ${modelSha256}, received ${digest}.`);
      }
    }
    await rename(temporary, destination);
    return downloaded.size;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

const revision = modelRevision;
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
  onnxSha256: modelSha256,
  voices: englishVoices,
  files,
  totalBytes,
  preparedAt: new Date().toISOString()
};
await writeFile(resolve(modelRoot, "nextgen-model-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(markerPath, revision + "\n", "utf8");

console.log(`Bundled Kokoro English q8 model revision ${revision}: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB across ${files.length} files.`);
