import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const REVISION = "main";
const OUTPUT = resolve("dist", "models", MODEL_ID);
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`;

const ENGLISH_VOICES = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore",
  "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
];

const FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
  ...ENGLISH_VOICES.map((voice) => `voices/${voice}.bin`)
];

async function existsAndComplete(path, file) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size >= (file === "onnx/model_quantized.onnx" ? 50 * 1024 * 1024 : 1024);
  } catch {
    return false;
  }
}

async function download(file) {
  const destination = resolve(OUTPUT, file);
  const relativePath = relative(OUTPUT, destination);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error("Invalid model asset path: " + file);
  if (await existsAndComplete(destination, file)) {
    process.stdout.write(`Cached ${file}\n`);
    return;
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporary = destination + ".part";
  await rm(temporary, { force: true });

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(BASE_URL + file, {
        redirect: "follow",
        headers: { "user-agent": "NextGen-AI-Voiceover-release-builder" }
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} while downloading ${file}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      const info = await stat(temporary);
      const minimumSize = file === "onnx/model_quantized.onnx" ? 50 * 1024 * 1024 : 1024;
      if (info.size < minimumSize) throw new Error(`Downloaded ${file} is unexpectedly small (${info.size} bytes)`);
      await rename(temporary, destination);
      process.stdout.write(`Downloaded ${file} (${(info.size / 1024 / 1024).toFixed(1)} MB)\n`);
      return;
    } catch (error) {
      lastError = error;
      await rm(temporary, { force: true });
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
  throw new Error(`Failed to download ${file}: ${lastError?.message || String(lastError)}`);
}

await mkdir(OUTPUT, { recursive: true });
let nextIndex = 0;
const workerCount = 3;
async function worker() {
  while (nextIndex < FILES.length) {
    const file = FILES[nextIndex++];
    await download(file);
  }
}
await Promise.all(Array.from({ length: workerCount }, () => worker()));

const modelFile = resolve(OUTPUT, "onnx/model_quantized.onnx");
if (!(await existsAndComplete(modelFile, "onnx/model_quantized.onnx"))) {
  throw new Error("The quantized ONNX model asset is missing or incomplete.");
}
for (const voice of ENGLISH_VOICES) {
  const voiceFile = resolve(OUTPUT, "voices", voice + ".bin");
  if (!(await existsAndComplete(voiceFile, voice + ".bin"))) {
    throw new Error("Missing English voice asset: " + voice);
  }
}
console.log(`Packaged the ${MODEL_ID} q8 model and all ${ENGLISH_VOICES.length} English voice packs into dist/models/.`);
