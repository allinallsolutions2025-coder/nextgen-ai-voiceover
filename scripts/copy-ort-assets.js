import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRuntime = resolve(root, "public/ort");
await rm(publicRuntime, { recursive: true, force: true });
await mkdir(publicRuntime, { recursive: true });

const candidateRoots = [
  resolve(root, "node_modules/@huggingface/transformers/dist"),
  resolve(root, "node_modules/kokoro-js/node_modules/@huggingface/transformers/dist"),
  resolve(root, "node_modules/onnxruntime-web/dist"),
  resolve(root, "node_modules/kokoro-js/node_modules/onnxruntime-web/dist")
];

const copied = new Set();
for (const candidate of candidateRoots) {
  let entries;
  try { entries = await readdir(candidate, { withFileTypes: true }); } catch { continue; }
  for (const entry of entries) {
    if (!entry.isFile() || !/^ort-wasm.*\.(?:wasm|mjs)$/.test(entry.name)) continue;
    if (copied.has(entry.name)) continue;
    await copyFile(resolve(candidate, entry.name), resolve(publicRuntime, entry.name));
    copied.add(entry.name);
  }
}

if (![...copied].some(name => name.endsWith(".wasm"))) {
  throw new Error("Could not find the ONNX Runtime WASM binaries in the installed Transformers.js dependencies.");
}

console.log(`Prepared ${copied.size} local ONNX Runtime files in public/ort/.`);
