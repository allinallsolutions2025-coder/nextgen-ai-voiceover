# NextGen AI Voiceover

Browser-first Kokoro text-to-speech studio with an optional multilingual Kokoro server.

## Voice engines

- **English browser engine:** Kokoro.js 1.2.1 with the ONNX q8 model and WASM. It generates 28 English voices locally.
- **Full local multilingual engine:** MediaPipe Tasks Audio 1.2.0 with the LiteRT Kokoro-82M bundle. It loads all 54 voices and nine locales directly in the browser, using WebGPU where available and a CPU-compatible model otherwise. No speech server or API key is required.
- **Optional remote engine:** a FastAPI backend using the Kokoro Python pipeline remains available for advanced deployments, but it is not required for any of the built-in Kokoro voices.
- Voice choices are enabled only when a connected engine reports them. A voice is not made available just because its ID exists in a static catalogue.
- The selected voice can be auditioned with a short sample before generating the full script.
- Script drafts are automatically saved in local browser storage and restored on return. Drafts are not uploaded to GitHub Pages or sent to the speech model unless the user chooses a remote voice.
- Long generation jobs can be stopped; completed paragraph audio remains available.

The MediaPipe LiteRT Kokoro bundle contains all 54 Kokoro v1.0 voice embeddings and language-specific text front ends for American/British English, Spanish, French, Hindi, Italian, Japanese, Brazilian Portuguese and Mandarin Chinese. The first multilingual load downloads approximately 295 MB; synthesis runs locally. See the [MediaPipe Text-to-Speech guide](https://ai.google.dev/edge/mediapipe/solutions/audio/text_to_speech) and [Kokoro LiteRT model card](https://huggingface.co/litert-community/Kokoro-82M).

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

Open http://localhost:4173 in Chrome or Edge. The 28 English voices run through Kokoro.js. Select **Load 26 additional voices locally** in the voice settings to download the multilingual model and unlock all 54 voices without a server.

## Deploy the multilingual server

The backend source is in `backend/` and is packaged as a Docker Hugging Face Space.

1. Create a **public Docker Space** in your Hugging Face account.
2. In this GitHub repository, add an Actions secret named `HF_TOKEN` with write access to that Space.
3. Run **Actions → Deploy multilingual Kokoro backend** and enter the Space repository as `username/space-name`.
4. Wait for the image build, model download and per-language startup synthesis checks to complete.
5. Paste its public `https://username-space-name.hf.space` URL into the studio's **Multilingual engine** field and select **Connect / refresh**.
6. Optionally set the Space secret `NEXTGEN_API_KEY`; enter that same key in the studio.

The deploy workflow does not create a Hugging Face Space or issue an access token. A private Space is not directly callable by this public browser app without an authenticated proxy. Never paste your Hugging Face account token into the website.

See [multilingual backend deployment notes](docs/MULTILINGUAL-BACKEND.md) and the [backend README](backend/README.md).

## GitHub Actions

- **CI** runs frontend checks, unit tests, backend Python syntax/catalogue tests and a static-site build.
- **Deploy preview to GitHub Pages** publishes the static web client.
- **Test live GitHub Pages app** runs a Playwright smoke test, including local speech generation and a mocked multilingual API connection/synthesis path.
- **Deploy multilingual Kokoro backend** copies `backend/` into an existing Hugging Face Space after manual workflow dispatch.

GitHub Pages publishes only `dist/`; backend files, docs and workflow files remain in the repository.

## Current limitations

- No accounts, billing, cloud-synced history or server-side usage enforcement. Script draft autosave is local to the current browser profile.
- The multilingual LiteRT model needs a first-time download of approximately 295 MB and enough device memory for local inference. WebGPU is preferred where available; CPU fallback may be slower.
- Browser model/voice assets remain subject to browser cache eviction.
- The multilingual backend is not live until you create a Space, add `HF_TOKEN` to GitHub Actions secrets, and run the deployment workflow.
- CPU-only hosting can have cold starts and slower synthesis. The app enables only languages and voices that pass the server's runtime checks.
- When a server voice is selected, the script text is sent to the configured API endpoint. Browser voices remain local to your device.
- This is a prototype, not a production SaaS. Do not commit API keys, Hugging Face tokens, private scripts or generated user audio.


## Local multilingual model attribution

The optional browser-local 54-voice pack uses the [LiteRT Community Kokoro-82M model](https://huggingface.co/litert-community/Kokoro-82M), published under Apache 2.0. The web runtime is [MediaPipe Tasks Audio](https://www.npmjs.com/package/@mediapipe/tasks-audio), also Apache 2.0. The model bundle is downloaded from Hugging Face on first use; synthesis itself runs on the user's device.
