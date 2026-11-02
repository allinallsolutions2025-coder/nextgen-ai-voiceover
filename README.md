# NextGen AI Voiceover

Browser-first Kokoro text-to-speech prototype. This repository is the source of truth for the product's code, tests and documentation.

## Current milestone

The first browser-runtime test harness preserves the approach used in the original Hugging Face Static Space:
- Kokoro.js 1.2.1.
- ONNX model: `onnx-community/Kokoro-82M-v1.0-ONNX`.
- Quantization: q8.
- Device: WASM.
- Runtime voice list retrieved from Kokoro.js when available.
- WAV generation in the browser and ZIP packaging with JSZip.

The application does not upload the user's script to a NextGen AI Voiceover backend. Model and library assets are downloaded from their configured public CDN/model repositories. Browser cache behaviour depends on the browser and device.

## Run locally

Use Node.js 22 or later.

```bash
npm ci
npm run check
npm test
npm run build
```

Serve the repository root over localhost (the browser app uses ES modules):

```bash
python -m http.server 4173
```

Open http://localhost:4173 in Chrome or Edge. Alternatively, use any static HTTP server.

1. Select **Load voice model**.
2. Wait for the model to finish loading.
3. Paste a short test sentence.
4. Select a voice and speed.
5. Select **Generate WAV files**.
6. Preview or download an individual WAV, or download the ZIP.

The first model load may take several minutes. Keep the tab open during generation.

## Automated checks

GitHub Actions runs on pushes to `main`, pull requests and manual dispatch. It performs:
- JavaScript syntax checks.
- Node.js unit tests for text parsing and input validation.
- Static application validation.

The routine CI job intentionally does not download the ONNX model or synthesize speech. That keeps pull-request checks fast, deterministic and independent of large model downloads.

## Manual model test

The real Kokoro integration must be tested in a browser because the Node.js CI suite does not download model weights. Follow [the browser runtime test plan](docs/BROWSER-RUNTIME-TEST-PLAN.md).

## Important technical distinction

The founder's native Python files (`.pth` model and `.pt` voice embeddings) are not interchangeable with the browser ONNX model and its ONNX-compatible voice assets. The browser prototype uses the upstream ONNX repository.

## Project documentation

- [Phase 1 — Research and Planning](docs/PHASE-1-RESEARCH-AND-PLANNING.md)
- [Browser Runtime Test Plan](docs/BROWSER-RUNTIME-TEST-PLAN.md)

## Current limitations

This is a technical prototype, not a production SaaS:
- No accounts, billing, saved history or server-side usage enforcement.
- No guarantee that the browser retains downloaded model assets.
- No verified cross-device performance results yet.
- No promise of unlimited generation.
- Exact model/voice asset licensing and redistribution are still being documented.

Do not add secrets, model weight binaries or private user audio to this repository.