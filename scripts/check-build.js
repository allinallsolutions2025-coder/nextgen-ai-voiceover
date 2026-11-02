import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/lib/text.js",
  "src/lib/voice-catalog.js",
  "package.json"
];

for (const file of requiredFiles) {
  await access(new URL("../" + file, import.meta.url));
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

const requiredHtmlMarkers = [
  'id="scriptInput"',
  'id="loadButton"',
  'id="generateButton"',
  'id="modelLoadMetric"',
  'id="synthesisMetric"',
  'id="totalMetric"',
  'src="./src/main.js"',
  'href="./src/styles.css"'
];

for (const marker of requiredHtmlMarkers) {
  if (!html.includes(marker)) {
    throw new Error("Missing required HTML marker: " + marker);
  }
}

if (!main.includes("Kokoro-82M-v1.0-ONNX")) {
  throw new Error("The browser runtime model ID is missing.");
}
if (!main.includes("kokoro-js@1.2.1")) {
  throw new Error("The Kokoro.js runtime is not pinned to the audited version.");
}
if (!main.includes('device: "wasm"')) {
  throw new Error("The baseline browser test must explicitly use WASM.");
}
if (!main.includes("normalizeVoiceCatalog(tts.voices)")) {
  throw new Error("The app must read the Kokoro tts.voices catalogue.");
}
if (main.includes("tts.list_voices()")) {
  throw new Error("Do not use list_voices() as a catalogue return value; it only logs a table.");
}

console.log("Static application validation passed.");
console.log("Required files, UI anchors, pinned Kokoro.js runtime, WASM mode and voice catalogue getter are present.");
