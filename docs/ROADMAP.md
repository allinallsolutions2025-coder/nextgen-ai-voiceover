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
**Status: In progress**

- [x] Regenerate one paragraph without rerendering the other section files.
- [x] Allow per-paragraph English voice and speaking-pace overrides.
- [x] Reorder, split at the text cursor, and merge sections.
- [x] Refresh the affected section audio and ZIP bundle after regeneration.
- [ ] Add adjustable pauses, trimming and silence controls.
- [ ] Add a synchronized paragraph and audio timeline.

**Current export behavior:** individual paragraph files use their own overrides. The continuous full-script file uses the studio-wide voice and pace, as explained in the editor.

## Phase 4 — Creator export suite
**Status: In progress**

- [x] Export SRT and VTT caption files with cue durations estimated against the measured full-script audio runtime.
- [x] Add caption-layout and project metadata presets for Shorts / Reels, long-form videos, podcasts and narration.
- [x] Add optional RMS-based level matching with a peak ceiling, plus leading/trailing silence trimming.
- [x] Package paragraph and full-script audio, captions, original script, prepared spoken script and project metadata into one ZIP.

**Export notes:** subtitle timestamps are phrase-weighted estimates based on the actual audio duration, not word-level forced alignment; review them in a video editor before publishing. Audio level matching targets approximately −18 dBFS RMS with a −1 dBFS peak ceiling; it is not certified EBU R128 / LUFS mastering. Creator presets configure caption layout and package metadata; they do not render video.

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
