import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const capacitor = JSON.parse(await readFile(new URL("../capacitor.config.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const electronBuilder = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const pwaEntry = await readFile(new URL("../src/pwa.js", import.meta.url), "utf8");

if (pkg.main !== "electron/main.cjs") throw new Error("Electron main entry is not configured.");
for (const dependency of ["electron", "electron-builder", "@capacitor/core", "@capacitor/cli", "@capacitor/android"]) {
  if (!pkg.dependencies?.[dependency] && !pkg.devDependencies?.[dependency]) {
    throw new Error("Missing cross-platform package dependency: " + dependency);
  }
}
if (!capacitor.webDir || capacitor.webDir !== "dist") throw new Error("Capacitor must package the shared dist/ web build.");
if (!capacitor.appId || !capacitor.appName) throw new Error("Capacitor app identity is incomplete.");
if (manifest.name !== "NextGen AI Voiceover" || manifest.display !== "standalone") {
  throw new Error("The PWA manifest must identify the installable app.");
}
for (const marker of ["nsis", "dmg", "AppImage"]) {
  if (!electronBuilder.includes(marker)) throw new Error("Missing desktop installer target: " + marker);
}
for (const marker of ["contextIsolation: true", "nodeIntegration: false", "sandbox: true", "127.0.0.1"]) {
  if (!electronMain.includes(marker)) throw new Error("Desktop renderer security requirement missing: " + marker);
}
if (!worker.includes("event.respondWith") || !worker.includes("APP_FILES")) {
  throw new Error("The PWA service worker does not cache the app shell.");
}
if (!pwaEntry.includes('navigator.serviceWorker.register("./sw.js"')) {
  throw new Error("Service worker registration is not configured.");
}
for (const forbidden of ["@capacitor/ios", "cap add ios", "ipa", "App Store", "ios/"]) {
  if (JSON.stringify(pkg).includes(forbidden) || electronBuilder.includes(forbidden)) {
    throw new Error("An iPhone/iPad distribution target must not be configured.");
  }
}
try {
  await access(new URL("../ios/", import.meta.url));
  throw new Error("An iOS project folder must not be included.");
} catch (error) {
  if (error.message === "An iOS project folder must not be included.") throw error;
}

console.log("Cross-platform packaging checks passed: Windows, macOS, Linux, Android and PWA; no iOS distribution.");
