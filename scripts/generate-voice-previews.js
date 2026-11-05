import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT, "public/voice-previews");
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const PREVIEW_VERSION = 2;
const PREVIEW_TEXT = "Hello! This is a short preview of the selected voice.";
const VOICES = [
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
];

async function sha256(path) {
  const hash = createHash("sha256");
  const bytes = await readFile(path);
  hash.update(bytes);
  return hash.digest("hex");
}

async function hasCompleteLibrary() {
  try {
    const manifest = JSON.parse(await readFile(resolve(OUTPUT_DIR, "manifest.json"), "utf8"));
    if (manifest.modelId !== MODEL_ID || manifest.modelRevision !== MODEL_REVISION ||
        manifest.previewVersion !== PREVIEW_VERSION || manifest.previewText !== PREVIEW_TEXT ||
        !Array.isArray(manifest.previews) || manifest.previews.length !== VOICES.length) return false;
    for (const voice of VOICES) {
      const entry = manifest.previews.find(item => item.id === voice);
      if (!entry) return false;
      const path = resolve(OUTPUT_DIR, entry.file);
      const info = await stat(path);
      if (info.size < 44 || info.size !== entry.bytes || await sha256(path) !== entry.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
if (process.env.FORCE_VOICE_PREVIEW_REBUILD !== "1" && await hasCompleteLibrary()) {
  console.log("All 28 pre-generated English voice previews are present and checksum-verified.");
  process.exit(0);
}

console.log("Loading the pinned Kokoro q8 model to pre-generate all 28 English voice previews...");
const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
  dtype: "q8",
  device: "cpu",
  revision: MODEL_REVISION
});

const previews = [];
for (let index = 0; index < VOICES.length; index += 1) {
  const id = VOICES[index];
  const file = id + ".wav";
  const destination = resolve(OUTPUT_DIR, file);
  const temporary = destination + ".tmp";
  console.log("Generating voice preview " + (index + 1) + "/" + VOICES.length + ": " + id);
  const audio = await tts.generate(PREVIEW_TEXT, { voice: id, speed: 1 });
  if (!audio || typeof audio.save !== "function") {
    throw new Error("Kokoro did not return a saveable audio object for " + id + ".");
  }
  await audio.save(temporary);
  const info = await stat(temporary);
  if (info.size < 44) throw new Error("Generated WAV file is incomplete for " + id + ".");
  await rename(temporary, destination);
  previews.push({ id, file, bytes: info.size, sha256: await sha256(destination) });
}

const manifest = {
  previewVersion: PREVIEW_VERSION,
  modelId: MODEL_ID,
  modelRevision: MODEL_REVISION,
  previewText: PREVIEW_TEXT,
  sampleRate: 24000,
  generatedAt: new Date().toISOString(),
  previews
};
await writeFile(resolve(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("Generated and checksum-verified all " + previews.length + " English voice preview WAV files.");