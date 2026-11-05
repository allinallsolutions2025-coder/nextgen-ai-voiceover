import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = resolve(root, "dist");
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const modelRevision = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const modelSha256 = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";
const voices = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica",
  "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah",
  "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir",
  "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
];
const modelDir = resolve(dist, "models", modelId);
const ortDir = resolve(dist, "ort");

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function requireFile(path, minBytes = 1) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size < minBytes) {
    throw new Error(`Required offline asset is missing or too small: ${path}`);
  }
  return info.size;
}

const manifestPath = resolve(modelDir, "nextgen-model-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.model !== modelId || manifest.revision !== modelRevision ||
    manifest.dtype !== "q8" || manifest.onnxSha256 !== modelSha256) {
  throw new Error("The model manifest does not match the approved pinned Kokoro q8 model.");
}

const coreFiles = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx"
];
let modelBytes = 0;
for (const file of coreFiles) {
  const minimum = file === "onnx/model_quantized.onnx" ? 80 * 1024 * 1024 : 1;
  modelBytes += await requireFile(resolve(modelDir, file), minimum);
}
const onnxPath = resolve(modelDir, "onnx/model_quantized.onnx");
const actualHash = await sha256File(onnxPath);
if (actualHash !== modelSha256) {
  throw new Error(`Packaged ONNX SHA-256 mismatch: ${actualHash}`);
}

const manifestVoices = [...(manifest.voices || [])].sort();
const expectedVoices = [...voices].sort();
if (JSON.stringify(manifestVoices) !== JSON.stringify(expectedVoices)) {
  throw new Error("Model manifest must contain exactly the 28 supported English voices.");
}
for (const voice of voices) {
  modelBytes += await requireFile(resolve(modelDir, "voices", voice + ".bin"), 1000);
}

const ortFiles = await readdir(ortDir);
const wasmFiles = ortFiles.filter(name => /^ort-wasm.*\.wasm$/.test(name));
if (!wasmFiles.length) throw new Error("No local ONNX Runtime WASM binary was packaged.");
const ortBytes = await Promise.all(wasmFiles.map(name => requireFile(resolve(ortDir, name))));

const builtFiles = await readdir(resolve(dist, "assets"));
if (!builtFiles.some(name => name.endsWith(".js"))) {
  throw new Error("The built application JavaScript bundle is missing.");
}

const report = {
  model: modelId,
  revision: modelRevision,
  dtype: "q8",
  onnxSha256: actualHash,
  englishVoiceCount: voices.length,
  modelFileCount: coreFiles.length + voices.length,
  modelBytes,
  wasmFiles,
  wasmBytes: ortBytes.reduce((sum, value) => sum + value, 0),
  checkedAt: new Date().toISOString()
};
await writeFile(resolve(dist, "offline-bundle-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log("OFFLINE_BUNDLE_VALIDATION_PASSED");
console.log(JSON.stringify(report, null, 2));
