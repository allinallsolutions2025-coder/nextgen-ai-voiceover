import { mkdir, rm, copyFile, cp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "./check-build.js";
import "./check-platform-build.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(resolve(root, "index.html"), resolve(output, "index.html"));
await cp(resolve(root, "src"), resolve(output, "src"), { recursive: true });
await cp(resolve(root, "public"), output, { recursive: true });
await writeFile(resolve(output, ".nojekyll"), "", "utf8");

console.log("Cross-platform web assets built at dist/.");
console.log("The same dist/ directory is used by GitHub Pages, Electron and Capacitor Android.");
