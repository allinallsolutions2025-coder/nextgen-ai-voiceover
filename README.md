# NextGen AI Voiceover

Browser-first Kokoro text-to-speech studio with an optional multilingual Kokoro server.

## Voice engines

**Kokoro (English):** Kokoro.js 1.2.1 with the ONNX q8 model and WASM runs locally in the browser. The product now lists only 28 American and British English voices. The 26 non-English Kokoro entries have been removed from the product catalogue and selector.

**Supertonic 3 (multilingual):** A separate ONNX Runtime Web engine runs locally on the device. It supports 31 languages plus a language-agnostic mode, and ten preset styles (M1–M5 and F1–F5). It does not add Kokoro IDs, use Kokoro voices, or offer voice cloning.

The Supertonic 3 ONNX weights total approximately 398 MB. They are fetched from the pinned [Supertonic 3 model revision](https://huggingface.co/supertone-oss-archive/supertonic-3/tree/aafc6e32416a594460b32413efc49d7fe4ce6d46) the first time the user loads that engine. Speech inference runs in the browser through ONNX Runtime Web WASM; there is no speech server or API key.

Supertonic supports Hindi, but not Tamil, Telugu, Kannada or Malayalam. Its preset voice styles are not custom voice cloning.

**Licensing:** the adapted Supertonic browser helper is MIT-licensed ([notice](./LICENSES/SUPERTONIC-WEB-CODE-MIT.txt)). The model weights use OpenRAIL-M ([license copy](./LICENSES/SUPERTONIC-3-OPENRAIL-M.txt)); the app asks the user to acknowledge those restrictions before downloading the model. Review the model license before using or distributing generated audio. The upstream open-source repository is archived, so future upstream maintenance is not expected.

The two engines remain separate in the UI: Kokoro's menu never displays the removed non-English Kokoro entries as Supertonic voices.

## Run locally

Use Node.js 24 or later:

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

Open http://localhost:4173 in Chrome or Edge. Kokoro loads its 28 English voices. Select **Supertonic 3 · 31 languages**, acknowledge the model license, and load its ONNX weights for separate multilingual speech on this device.

## Legacy server source

The former Kokoro multilingual FastAPI backend is retained under `backend/` as legacy source code, but it is no longer connected to the website. The published app has no server URL field, server-side voice selector, or remote Kokoro generation path. The local Supertonic engine is the multilingual path in this build.

## GitHub Actions

- **CI** runs frontend checks, unit tests, backend Python syntax/catalogue tests and a static-site build.
- **Deploy preview to GitHub Pages** publishes the static web client.
- **Test live GitHub Pages app** runs a Playwright smoke test, including real local Supertonic Hindi and Spanish synthesis.
- A legacy backend deploy workflow and source remain in the repository, but are not used by the published client.

GitHub Pages publishes only `dist/`; backend files, docs and workflow files remain in the repository.

## Current limitations

- No accounts, billing, cloud-synced history or server-side usage enforcement. Script draft autosave is local to the current browser profile.
- Supertonic's ONNX weights require a first-time download of about 398 MB and enough device memory for browser-based inference.
- Browser model/voice assets remain subject to browser cache eviction.
- Supertonic runs with ONNX Runtime Web WASM in this build; large models may be slow or fail on devices with limited available memory.
- The 26 non-English Kokoro voice IDs are intentionally absent from the published voice catalogue and cannot be selected from the product UI.
- Supertonic 3 does not support Tamil, Telugu, Kannada or Malayalam.
- This is a prototype, not a production SaaS. Do not commit API keys, Hugging Face tokens, private scripts or generated user audio.


## Local multilingual model attribution

The optional browser-local 54-voice pack uses the [LiteRT Community Kokoro-82M model](https://huggingface.co/litert-community/Kokoro-82M), published under Apache 2.0. The web runtime is [MediaPipe Tasks Audio](https://www.npmjs.com/package/@mediapipe/tasks-audio), also Apache 2.0. The model bundle is downloaded from Hugging Face on first use; synthesis itself runs on the user's device.
