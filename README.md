# NextGen AI Voiceover

Browser-first Kokoro text-to-speech studio with an optional multilingual Kokoro server.

## Voice engines

- **Browser engine:** Kokoro.js 1.2.1 with the ONNX q8 model and WASM. It generates the 28 English voices registered by the browser package locally.
- **Multilingual engine:** an optional FastAPI backend using the Kokoro Python pipeline across nine language codes. It checks each language by generating a sample before publishing any server voices to the studio.
- Voice choices are enabled only when a connected engine reports them. A voice is not made available just because its ID exists in a static catalogue.

The broader Kokoro v1.0 ecosystem documents nine language groups and 54 voice assets. The JavaScript browser package used here registers 28 English voice IDs, so other languages use the Python pipeline and its language-specific text processing. See the [official Kokoro voice catalogue](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) and [Kokoro Python pipeline](https://github.com/hexgrad/kokoro).

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

Open http://localhost:4173 in Chrome or Edge. Browser synthesis runs on the client; remote voices require the optional backend below.

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

- No accounts, billing, saved cloud history or server-side usage enforcement.
- Browser model/voice assets remain subject to browser cache eviction.
- The multilingual backend is not live until you create a Space, add `HF_TOKEN` to GitHub Actions secrets, and run the deployment workflow.
- CPU-only hosting can have cold starts and slower synthesis. The app enables only languages and voices that pass the server's runtime checks.
- When a server voice is selected, the script text is sent to the configured API endpoint. Browser voices remain local to your device.
- This is a prototype, not a production SaaS. Do not commit API keys, Hugging Face tokens, private scripts or generated user audio.
