import { mkdir, rm, copyFile, cp, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep } from "node:path";
import "./check-build.js";
import "./check-platform-build.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const vendor = resolve(output, "vendor");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(resolve(root, "index.html"), resolve(output, "index.html"));
await cp(resolve(root, "src"), resolve(output, "src"), { recursive: true });
await cp(resolve(root, "public"), output, { recursive: true });
await mkdir(vendor, { recursive: true });

// Bundle the exact audited browser runtime and its supporting libraries locally.
// The model weights themselves are added only by build:release for native installers.
await copyFile(
  resolve(root, "node_modules/kokoro-js/dist/kokoro.web.js"),
  resolve(vendor, "kokoro.web.js")
);
await cp(
  resolve(root, "node_modules/@huggingface/transformers/dist"),
  resolve(vendor, "transformers"),
  { recursive: true }
);
await copyFile(
  resolve(root, "node_modules/jszip/dist/jszip.min.js"),
  resolve(vendor, "jszip.min.js")
);
await copyFile(
  resolve(root, "node_modules/lamejs/lame.min.js"),
  resolve(vendor, "lame.min.js")
);

// The PWA service worker precaches every local JS/WASM runtime asset without
// hard-coding version-specific ONNX Runtime filenames.
async function collectAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) assets.push(...await collectAssets(absolute));
    else if (/\.(?:js|mjs|wasm)$/.test(entry.name)) {
      assets.push("./" + relative(output, absolute).split(sep).join("/"));
    }
  }
  return assets;
}
const runtimeAssets = await collectAssets(vendor);
await writeFile(
  resolve(output, "precache-manifest.json"),
  JSON.stringify({ assets: runtimeAssets }, null, 2) + "\n",
  "utf8"
);
await writeFile(resolve(output, ".nojekyll"), "", "utf8");

console.log("Cross-platform web assets built at dist/ with local Kokoro, ONNX Runtime WASM, JSZip and MP3 encoder.");
console.log("The same dist/ directory is used by GitHub Pages, Electron and Capacitor Android.");
