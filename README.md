# NextGen AI Voiceover

Browser-first Kokoro text-to-speech prototype. This repository is the private source of truth for the product's code, tests and documentation.

## Current milestone

The browser test application uses:
- Kokoro.js 1.2.1.
- ONNX model: `onnx-community/Kokoro-82M-v1.0-ONNX`.
- Quantization: q8.
- Device: WASM.
- Runtime voice discovery where supported.
- Browser-side WAV generation and ZIP packaging.

The app does not upload the user's script to a NextGen AI Voiceover backend. Runtime/model assets are fetched from the configured public CDN/model repositories. Browser cache behaviour depends on browser, device and storage policy.

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
- **Deploy preview to GitHub Pages** is initially manual. Enable Pages with **Settings → Pages → Source → GitHub Actions**, review the Pages visibility requirements, then run it from the Actions tab.

The Pages build publishes only `dist/`, not this repository's documentation, tests or workflow files. Note that the published browser JavaScript is public by nature.

See [GitHub Pages testing instructions](docs/GITHUB-PAGES-TESTING.md).

## Manual browser/model test

Follow [the Browser Runtime Test Plan](docs/BROWSER-RUNTIME-TEST-PLAN.md). Routine CI deliberately does not download model weights or perform inference.

## Project documentation

- [Phase 1 — Research and Planning](docs/PHASE-1-RESEARCH-AND-PLANNING.md)
- [Browser Runtime Test Plan](docs/BROWSER-RUNTIME-TEST-PLAN.md)
- [GitHub Pages Testing](docs/GITHUB-PAGES-TESTING.md)

## Current limitations

This remains a technical prototype, not a production SaaS:
- No accounts, billing, cloud history or server-side usage enforcement.
- No guarantee that browser model assets remain cached.
- Performance and compatibility results are not yet complete.
- No promise of unlimited generation.
- Model, voice and dependency licensing review remains in progress.

Never commit secrets, model weight binaries or private user audio.
