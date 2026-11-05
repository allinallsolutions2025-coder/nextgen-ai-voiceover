# NextGen AI Voiceover

An English-first, local text-to-speech studio powered by Kokoro. The same application codebase supports the browser/PWA, Windows, macOS, Linux and Android. iPhone/iPad distribution is intentionally not included. It focuses on natural American and British English narration rather than a multilingual voice catalogue.

## English voice engine

**Kokoro.js 1.2.1** runs the Kokoro-82M q8 ONNX model locally in the browser through WebAssembly. The product exposes 28 English voices: American English and British English, with female and male voices in both accent groups. Non-English Kokoro IDs are excluded from the public voice selector.

The browser app loads the model from Hugging Face on first use and caches it through the browser model cache and the service worker runtime cache. The installable PWA shell and ONNX Runtime WebAssembly files are bundled with the site. Windows/macOS/Linux desktop installers and the Android build download and package the English q8 model, all 28 English voice packs, the Kokoro.js runtime, ZIP/MP3 libraries and ONNX Runtime WebAssembly assets. Native builds are configured to use those local files without falling back to remote model downloads. No speech API key or speech server is needed for generation.

## Studio interface

The desktop workspace is optimized for common Windows browser sizes, including 1366 × 768 and 1920 × 1080. A compact header replaces the older left sidebar, with the script editor and voice setup arranged side by side. On smaller screens the workspace stacks into one column. Less-used speech and export controls are grouped under **Speech & export options** so the main voice controls stay visible.

The interface uses a light slate-and-blue professional theme with larger, readable control labels and a simplified navigation area.

## Voiceover controls

- **Voice discovery:** filter the 28 voices by American English, British English, female, male or saved favorites. Favorite voices and the five most recently selected voices are remembered locally.
- **Pronunciation guide:** add one replacement per line, such as `OpenAI = Open A I` or `SQL = sequel`. Matching is case-insensitive and respects word/phrase boundaries. Replacements apply to the audio input only; the original script is preserved. Rules are saved locally in the current browser.
- **Speaking pace:** use Relaxed (0.90×), Natural (1.00×), Brisk (1.15×), or set a custom speed from 0.50× to 2.00×.
- **Smart spoken-text cleanup:** optionally read common dates, years, numbers, numeric ranges, percentages, currencies, measurements, times and common initialisms aloud. Review the prepared spoken text before generating; this changes only the speech input, while the original draft remains intact. Custom pronunciation rules are applied first.
- **Always-ready voice previews:** a GitHub Actions build pre-generates a short WAV sample for each of the 28 English voices and commits the files plus manifest under `public/voice-previews/`. On page load the browser fetches and caches this library (service-worker runtime cache plus IndexedDB) and shows playable cards before the larger speech model finishes loading. Normal voiceover generation still uses local Kokoro synthesis.
- **Narration pacing:** speech is streamed paragraph by paragraph, with a longer pause between paragraphs and a shorter pause between streamed chunks.
- **Paragraph editor:** edit each section independently, reorder sections, split at the text cursor, merge with the next section, and set an optional English voice and speaking pace override.
- **Section regeneration:** regenerate one paragraph without rerendering the other section files. Its audio file and ZIP bundle are refreshed. Per-paragraph overrides apply to section files; the continuous full-script file uses the studio-wide voice and pace.
- **Script workflow:** up to 20,000 characters and 100 paragraphs, with each paragraph rendered separately plus one continuous full-script voiceover.
- **Creator export presets:** Shorts / Reels (9:16), long-form video (16:9), podcast and narration profiles configure caption line lengths and project metadata; they do not render video.
- **Subtitles:** download SRT and VTT files for the continuous full-script audio. Cue timing is estimated from the measured audio duration and phrase length, so review it before publishing.
- **Audio finishing:** optionally level-match toward −18 dBFS RMS with a −1 dBFS peak ceiling and trim quiet leading/trailing silence with a short buffer. This is not certified LUFS mastering.
- **Project ZIP:** paragraph and full-script WAV or MP3 audio, SRT/VTT captions, original script, prepared spoken script and a project.json manifest.
- **Draft recovery:** the script and pronunciation rules are saved locally in the current browser profile.

The engine exposes voice selection and speaking speed; it does not currently provide voice cloning, SSML markup, separate pitch controls or emotion sliders. Punctuation and the custom pronunciation guide are the available ways to tune spoken text.

## Development roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan covering stability, English narration quality, voice discovery, paragraph editing, creator exports, local projects and release readiness.

## Privacy and storage

Speech synthesis runs locally in the browser. Your script and pronunciation replacements are not sent to a speech server. Model/runtime assets are downloaded from their distribution sources and cached by the browser. Local drafts are not synced between browsers or devices.

## Run locally

Use Node.js 24 or later. Use `npm install` because this cross-platform build adds native and bundling dependencies:

```bash
npm install
npm run check
npm test
npm run build
```

Serve the project root over localhost:

```bash
python -m http.server 4173
```

Open http://localhost:4173 in Chrome or Edge. The installable PWA shell and ONNX Runtime WASM files are local; the browser downloads and caches the English Kokoro model on first use.


## Installable and native builds

The same Vite application is used by all supported targets. The repository intentionally has **no iOS/iPadOS target or Capacitor iOS dependency**.

| Target | Output | Build path |
| --- | --- | --- |
| Browser | Existing hosted site | GitHub Pages |
| PWA | Installable browser app; offline shell and cached model/runtime after first load | `npm run build` |
| Windows | NSIS `.exe` installer | `npm run build:offline` then `npm run desktop:package` on Windows |
| macOS | `.dmg` installer | `npm run build:offline` then `npm run desktop:package` on macOS |
| Linux | AppImage and `.deb` | `npm run build:offline` then `npm run desktop:package` on Linux |
| Android | APK (debug by default in CI) | `npm run build:offline`, `npx cap add android`, `npx cap sync android`, then build with Gradle |

### Model packaging

`npm run build:offline` downloads the immutable Hugging Face revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` of `onnx-community/Kokoro-82M-v1.0-ONNX`, selects the q8 quantized ONNX graph and includes only the 28 American/British English voice packs used by the app. The 88.1 MB ONNX graph is SHA-256 checked against `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` before packaging. It also copies the ONNX Runtime WebAssembly files from the installed Transformers.js dependency. The build writes a model manifest with the source revision, checksum and asset list, then `validate:offline` verifies that the complete model and WASM runtime are in the final `dist/` directory.

The PWA does not include the large model in the GitHub Pages artifact. It downloads the model on first use and relies on the Transformers.js browser cache plus service-worker runtime caching for later offline sessions. Native desktop and Android packages bundle the pinned model and runtime so speech generation can run without a model download after installation. The separate **Verify offline Kokoro voice generation** workflow opens the built app with all external network requests blocked, waits for the local model to load, then generates and inspects a WAV file.

For an Android APK, use Android Studio/Gradle with JDK 21. The included GitHub Actions workflow creates a debug APK artifact; public Play Store distribution needs a separately signed release build and signing credentials. Desktop installers are currently unsigned unless you provide the relevant Windows/macOS signing certificates.

### CI packaging workflows

- **Build desktop installers** — manual workflow dispatch or a `v*` tag; creates Windows, macOS and Linux artifacts on native runners.
- **Build Android APK** — manual workflow dispatch or a `v*` tag; creates an offline-capable debug APK.
- The browser/PWA remains deployed through the existing GitHub Pages workflow.
## Legacy backend source

The repository retains an earlier multilingual Kokoro FastAPI backend under `backend/` and its deployment workflow for reference. It is not connected to or shipped with the public GitHub Pages client. The current product UI and browser runtime are English-only.

## GitHub Actions

- **CI** checks JavaScript syntax, runs unit tests, validates legacy backend source, and builds the static site.
- **Deploy preview to GitHub Pages** publishes the browser client.
- **Test live GitHub Pages app** uses Playwright to verify the published site, local Kokoro model, English voices, draft recovery, pronunciation controls, audio exports and downloads.

GitHub Pages publishes only `dist/`; backend files, tests and workflow files remain in the repository.

## Current limitations

- No accounts, billing, cloud-synced history or server-side usage enforcement.
- Browser cache may be cleared or evicted by the browser, requiring model files to be downloaded again.
- Speed and custom text pronunciation are supported; pitch, emotion and voice-cloning controls are not.
- The 28-voice product catalogue is English-only (American and British English).
- This is an early-access prototype, not a production SaaS. Do not commit API keys, private scripts or generated user audio.
