import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const apkPath = resolve(process.argv[2] || "android/app/build/outputs/apk/debug/app-debug.apk");
const entries = execFileSync("unzip", ["-Z1", apkPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const model = entries.find(name => name.endsWith("/model_quantized.onnx"));
const runtime = entries.filter(name => /\/ort\/ort-wasm.*\.wasm$/.test(name));
const voiceFiles = entries.filter(name =>
  /\/models\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/voices\/(?:af|am|bf|bm)_[a-z]+\.bin$/.test(name)
);
if (!model) throw new Error("APK does not contain the quantized Kokoro ONNX model.");
if (!runtime.length) throw new Error("APK does not contain an ONNX Runtime WASM binary.");
if (voiceFiles.length !== 28) {
  throw new Error(`APK should contain exactly 28 English voice assets; found ${voiceFiles.length}.`);
}
if (entries.some(name => /\/voices\/(?:ef|em|ff|hf|hm|if|im|jf|jm|pf|pm|zf|zm)_/.test(name))) {
  throw new Error("APK contains non-English Kokoro voice assets.");
}

const report = {
  apk: apkPath,
  modelAsset: model,
  wasmAssets: runtime,
  englishVoiceAssetCount: voiceFiles.length,
  apkEntryCount: entries.length
};
await writeFile(resolve("android-apk-bundle-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log("ANDROID_APK_BUNDLE_VALIDATION_PASSED");
console.log(JSON.stringify(report, null, 2));
