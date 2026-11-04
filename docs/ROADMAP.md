# NextGen AI Voiceover Development Roadmap

This roadmap keeps NextGen AI Voiceover English-first and browser-local. The current product uses Kokoro 82M (ONNX q8) with 28 American and British English voices. No mandatory generation server or paid TTS API is planned.

## Phase 0 — Stability and quality assurance
**Status: In progress**

- [x] Fix the browser smoke test so WAV assertions run in WAV mode after the MP3 export test.
- [x] Record the failing representative-voice output before asserting, so future reports retain diagnostics.
- [x] Extend live browser checks for voice preferences and prepared speech preview.
- [ ] Confirm the live Chromium run passes on the published Pages build.
- [ ] Add cancellation, retry and long-script regression coverage.
- [ ] Validate browser memory and storage behavior on a low-memory device.

## Phase 1 — Advanced English narration
**Status: In progress**

- [x] Expand common numbers, dates, times, currencies, measurements and acronyms.
- [x] Add spoken numeric range cleanup while preserving phone-like identifiers and version strings.
- [x] Show the prepared spoken text before generation.
- [ ] Expand tested pronunciation rules for fractions, ranges with units, names and technical vocabulary.
- [ ] Add import/export for a reusable custom pronunciation dictionary.
- [ ] Add broader benchmark scripts for creator, documentary and technical narration.

## Phase 2 — Voice discovery and comparison
**Status: In progress**

- [x] Keep the 28-voice comparison bench.
- [x] Save favorite voices locally.
- [x] Filter the voice catalogue to saved favorites.
- [x] Track and display the five most recently selected voices.
- [ ] Add named voice collections and saved comparison sessions.
- [ ] Add user-rated voice notes and per-use recommendations.

## Phase 3 — Paragraph-level voiceover editor
**Status: Planned**

- [ ] Regenerate one paragraph without rerendering the full script.
- [ ] Allow per-paragraph voice and speed overrides.
- [ ] Reorder, split, merge and remove sections.
- [ ] Add adjustable pauses, trimming and silence controls.
- [ ] Add a synchronized paragraph and audio timeline.

## Phase 4 — Creator export suite
**Status: Planned**

- [ ] Export SRT and VTT subtitle files with timing derived from generated audio.
- [ ] Add creator presets for Shorts, long-form videos, podcasts and narration.
- [ ] Add optional loudness normalization and silence trimming.
- [ ] Package audio, captions, original script and spoken script into a project ZIP.

## Phase 5 — Projects and offline workflow
**Status: Planned**

- [ ] Add local projects with rename, duplicate, archive and delete.
- [ ] Move larger project data and audio blobs to IndexedDB.
- [ ] Add project backup and import.
- [ ] Improve offline model availability after the initial model download.
- [ ] Restore interrupted project work and generation status safely.

## Phase 6 — Release readiness
**Status: Planned**

- [ ] Improve mobile and tablet layouts and keyboard accessibility.
- [ ] Add first-run guidance and clearer progress/error states.
- [ ] Verify model, voice and dependency licensing for intended commercial use.
- [ ] Test supported browsers and add a structured feedback flow.
- [ ] Document browser-local privacy, storage limits and supported devices.

## Product guardrails

- English is the primary and actively maintained language.
- Keep the existing 28 English Kokoro voices as the initial library.
- Generate speech in the browser using Kokoro and ONNX/WebAssembly.
- Do not add a required backend or paid external TTS dependency.
- Keep model downloads and browser cache behavior explicit to users.
- Prioritize audio correctness and recovery before expanding the editor.
