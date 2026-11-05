# Cross-platform releases

NextGen AI Voiceover uses one web application build for the installable web app, desktop app, and Android app. The voice catalogue remains limited to the existing 28 American and British English voices.

## Supported distribution targets

| Target | Delivery | Build environment |
| --- | --- | --- |
| Windows | NSIS `.exe` installer (x64 and ARM64) | Windows or GitHub Actions |
| macOS | `.dmg` installer (Intel and Apple silicon) | macOS or GitHub Actions |
| Linux | AppImage (x64) | Linux or GitHub Actions |
| Android | Debug APK from the Android project; release APK/AAB after signing setup | Android Studio / GitHub Actions |
| Web | Installable PWA in supported desktop browsers and Android browsers | GitHub Pages |

**There is no iPhone/iPad distribution target.** The repository intentionally does not create an iOS project, IPA, App Store build, Apple signing configuration, or iOS-specific release workflow.

## Desktop builds

Install Node.js 24 or later, then run:

```bash
npm install
npm run check
npm test
npm run dist:desktop
```

The desktop build uses Electron and electron-builder. It serves the built app from a loopback-only HTTP server rather than opening the HTML with a `file://` URL. That gives the browser runtime a normal local origin and keeps Node integration disabled in the renderer.

## Android build

Install Android Studio, Android SDK Platform Tools, and a JDK supported by the Capacitor Android version (JDK 21 is used in CI). Then run:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows, use `gradlew.bat assembleDebug`. The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. A signed release APK/AAB requires your own Android signing key and Gradle signing configuration; do not commit signing keys or passwords.

The Android platform project is generated from `capacitor.config.json` and is not checked into this repository. Only `@capacitor/android` is installed; no Capacitor iOS platform package is configured.

## Installable web app

GitHub Pages publishes the PWA manifest, app icon, and service worker. In a supported browser, use its Install app option (or Add to Home Screen on supported Android browsers). The service worker caches the same-origin app shell. The Kokoro model and runtime are fetched by the existing Transformers.js/Kokoro runtime and use its browser cache; model downloads are cross-origin and are not copied into the service worker's app-shell cache.

## Model and first launch

The native release command is `npm run build:release`. It builds the shared app, copies the pinned Kokoro.js 1.2.1 browser runtime, Transformers.js ONNX Runtime WASM files, JSZip and LAMEJS into `dist/vendor/`, then downloads the q8 `model_quantized.onnx` file, tokenizer/configuration files, and all 28 American/British English voice packs into `dist/models/onnx-community/Kokoro-82M-v1.0-ONNX/`. The desktop installer and Android APK workflows use this release build, so the model and voice packs are included in those native packages rather than fetched at first launch. Local model paths are preferred by the app; remote Hugging Face loading remains enabled as a fallback.

The regular GitHub Pages build bundles the JavaScript/WASM runtime but does not copy the roughly 92 MB model into the Pages artifact. The browser PWA downloads that model from Hugging Face on first use and uses Transformers.js browser caching for later visits. The service worker precaches the same-origin app shell and local runtime/WASM files. For completely offline PWA use, open the app once while online and let model setup finish before disconnecting.

The model download script currently resolves the upstream model repository's `main` revision when a release is built. The model license is Apache-2.0; preserve the upstream model attribution/license when redistributing the weights.

## CI artifacts

The `Build desktop installers` workflow creates Windows, macOS, and Linux artifacts. The `Build Android APK` workflow creates a debug APK. These builds are unsigned by default; macOS Gatekeeper and Windows SmartScreen may display publisher warnings until the releases are signed with certificates owned by the publisher.
