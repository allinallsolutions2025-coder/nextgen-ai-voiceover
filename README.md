# NextGen AI Voiceover

An English-first, browser-based text-to-speech studio powered by Kokoro. It focuses on natural American and British English narration rather than a multilingual voice catalogue.

## English voice engine

**Kokoro.js 1.2.1** runs the Kokoro-82M q8 ONNX model locally in the browser through WebAssembly. The product exposes 28 English voices: American English and British English, with female and male voices in both accent groups. Non-English Kokoro IDs are excluded from the public voice selector.

The app restores the model automatically and enables browser caching. The first visit downloads the voice model and runtime assets; later visits can reuse the browser cache. No speech API key or remote speech server is needed for generation.

## Voiceover controls

- **Voice discovery:** filter the 28 voices by American English, British English, female, male or saved favorites. Favorite voices and the five most recently selected voices are remembered locally.
- **Pronunciation guide:** add one replacement per line, such as `OpenAI = Open A I` or `SQL = sequel`. Matching is case-insensitive and respects word/phrase boundaries. Replacements apply to the audio input only; the original script is preserved. Rules are saved locally in the current browser.
- **Speaking pace:** use Relaxed (0.90×), Natural (1.00×), Brisk (1.15×), or set a custom speed from 0.50× to 2.00×.
- **Smart spoken-text cleanup:** optionally read common dates, years, numbers, numeric ranges, percentages, currencies, measurements, times and common initialisms aloud. Review the prepared spoken text before generating; this changes only the speech input, while the original draft remains intact. Custom pronunciation rules are applied first.
- **Voice comparison bench:** generate the same short script as a WAV with each of the 28 American and British voices, audition the results, and download individual samples. Includes balanced, creator-style and technical benchmark scripts.
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

Open http://localhost:4173 in Chrome or Edge. The site automatically loads the English Kokoro model when the page starts.

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
