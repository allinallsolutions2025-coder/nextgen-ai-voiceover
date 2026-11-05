import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const capacitor = JSON.parse(await readFile(new URL("../capacitor.config.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

test("desktop packaging targets Windows, macOS and Linux", async () => {
  const config = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
  assert.match(config, /nsis/);
  assert.match(config, /dmg/);
  assert.match(config, /AppImage/);
  assert.equal(pkg.main, "electron/main.cjs");
});

test("Android uses the shared dist build without an iOS target", () => {
  assert.equal(capacitor.webDir, "dist");
  assert.equal(pkg.dependencies["@capacitor/android"], "8.6.0");
  assert.equal(pkg.dependencies["@capacitor/core"], "8.6.0");
  assert.equal(pkg.devDependencies["@capacitor/cli"], "8.6.0");
  assert.ok(!pkg.dependencies["@capacitor/ios"]);
  assert.ok(!pkg.devDependencies["@capacitor/ios"]);
});

test("release build bundles the model and local runtime assets", async () => {
  const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
  const downloader = await readFile(new URL("../scripts/download-model-assets.js", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build-site.js", import.meta.url), "utf8");
  assert.match(main, /KOKORO_LOCAL/);
  assert.match(main, /localModelPath/);
  assert.match(downloader, /onnx\/model_quantized\.onnx/);
  assert.match(downloader, /ENGLISH_VOICES/);
  assert.match(build, /node_modules\/kokoro-js\/dist\/kokoro\.web\.js/);
  assert.match(build, /node_modules\/@huggingface\/transformers\/dist/);
});

test("PWA manifest uses the same app identity", () => {
  assert.equal(manifest.name, "NextGen AI Voiceover");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
});
