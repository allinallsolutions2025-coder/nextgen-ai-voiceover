# NextGen AI Voiceover

Browser-first Kokoro text-to-speech prototype. This repository is the source of truth for the product's code, tests and documentation.

## Current browser runtime

- Kokoro.js 1.2.1.
- ONNX model: `onnx-community/Kokoro-82M-v1.0-ONNX`.
- Quantization: q8.
- Device: WASM.
- Voice catalogue: read from the runtime's `tts.voices` getter.
- Speech generation runs in the browser.
- WAV preview/download and ZIP export are performed locally.

**Voice compatibility note:** Kokoro.js 1.2.1 actively registers 28 English voices (American and British). The ONNX repository contains additional multilingual voice assets, but this runtime version leaves those voice registrations commented out. NextGen AI Voiceover must not present all 54 upstream voice assets as supported until a compatible multilingual runtime is implemented and tested.

The method `tts.list_voices()` prints the catalogue to the console and returns no list. Use `tts.voices` to access voice metadata.

Voice files are fetched individually when first used and can be cached by the library/browser. Do not assume the browser will retain every cached file forever.

## Run locally

Use Node.js 24 or later.

```bash
npm ci
npm run check
npm test
npm run build
```

Serve the project root over localhost:

```bash
python -m http.server 4173
```

Open http://localhost:4173 in Chrome or Edge.

## GitHub Actions

- **CI** runs syntax checks, unit tests and a static-site build on pushes and pull requests.
- **Deploy preview to GitHub Pages** deploys the static site after successful build on pushes to `main`.
- **Test live GitHub Pages app** runs a Playwright Chromium smoke test after successful Pages deployment and uploads a JSON report.

The Pages build publishes only `dist/`, not repository documentation, tests or workflow files. Browser JavaScript and assets are public by nature.

## Project documentation

- [Phase 1 — Research and Planning](docs/PHASE-1-RESEARCH-AND-PLANNING.md)
- [Browser Runtime Test Plan](docs/BROWSER-RUNTIME-TEST-PLAN.md)
- [GitHub Pages Testing](docs/GITHUB-PAGES-TESTING.md)
- [Latest live Pages browser report](docs/reports/2026-11-02-pages-browser-smoke-test.md)

## Current limitations

This is a technical prototype, not a production SaaS:
- No accounts, billing, saved cloud history or server-side usage enforcement.
- No guarantee that browser model/voice assets remain cached.
- Performance and compatibility results are not complete across devices.
- No promise of unlimited generation.
- Only the 28 English voices registered by Kokoro.js 1.2.1 are currently supported in this web app.
- Full multilingual voice support requires a compatible runtime and phonemization path.

Do not commit secrets, model weight binaries or private user audio.
