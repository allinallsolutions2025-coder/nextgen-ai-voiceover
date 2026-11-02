import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/lib/text.js",
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

console.log("Static application validation passed.");
console.log("Required files, UI anchors, pinned Kokoro.js runtime and WASM configuration are present.");