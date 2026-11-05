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

The current app runtime continues to fetch the pinned Kokoro.js 1.2.1 runtime and the English Kokoro-82M model from their configured distribution sources on first use. It stores model/runtime files in the browser engine's cache for reuse. Therefore, an initial internet connection is required after installing a desktop or Android wrapper, and the first model setup is not yet a fully self-contained/offline installer. After a successful download, repeat launches can use the persisted cache while it remains available to the app.

This release scaffold does not claim the roughly 92 MB quantized ONNX model and all 28 voice packs are embedded inside the desktop installers or APK. Bundling those weights offline is a separate packaging task that must also redirect Kokoro/Transformers.js model and WASM resolution to local app assets and be tested on each target.

## CI artifacts

The `Build desktop installers` workflow creates Windows, macOS, and Linux artifacts. The `Build Android APK` workflow creates a debug APK. These builds are unsigned by default; macOS Gatekeeper and Windows SmartScreen may display publisher warnings until the releases are signed with certificates owned by the publisher.
