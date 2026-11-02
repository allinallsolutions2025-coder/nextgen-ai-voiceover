# Multi-voice live GitHub Pages browser test

**Date:** 2026-11-02  
**Result:** PASSED  
**Published app:** [NextGen AI Voiceover](https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/)  
**GitHub Actions:** [Live Pages Chromium run #5](https://github.com/allinallsolutions2025-coder/nextgen-ai-voiceover/actions/runs/41447625197)  
**Browser:** Headless Chrome 156.0.8078.4 via Playwright  
**Runner:** GitHub-hosted Linux

## Summary

The browser opened the published Pages website, loaded Kokoro.js 1.2.1 and the quantized ONNX model, read the actual `tts.voices` catalogue, and found 28 selectable voices. It generated valid WAV audio using three different voice IDs:
- `am_adam` — Adam, American English, male.
- `af_heart` — Heart, American English, female.
- `bf_emma` — Emma, British English, female.

It also validated the WAV and ZIP data, downloaded a ZIP and an individual WAV, and confirmed all three voice files were fetched through Hugging Face redirects and delivered from the CDN.

## Results

| Check | Result |
|---|---|
| Published Pages HTTP 200 | PASS |
| Application shell loaded | PASS |
| HTTPS secure context | PASS |
| Kokoro model loaded | PASS |
| Voice catalogue discovered | PASS — 28 voices |
| Adam synthesis | PASS — 2 sentences |
| Heart synthesis | PASS — 1 sentence |
| Emma synthesis | PASS — 1 sentence |
| WAV RIFF/WAVE validation | PASS — all three voice tests |
| ZIP signature and readability | PASS |
| Actual ZIP download | PASS — downloaded size matched |
| Actual individual WAV download | PASS — downloaded size matched |
| Hugging Face voice requests | PASS — all three requested |
| CDN voice responses | PASS — 3 HTTP 200 responses |
| Performance diagnostics populated | PASS |
| Browser page errors / failed requests | 0 |

## Environment

| Property | Value |
|---|---|
| Browser | Headless Chrome 156.0.8078.4 |
| Operating system | GitHub-hosted Linux runner |
| Logical processors | 4 |
| Browser-reported device memory | 16 GB |
| HTTPS secure context | Yes |

These are GitHub-hosted Linux measurements, not benchmarks of the founder's CPU-only Windows PC.

## Timings

| Metric | Value |
|---|---:|
| Model initialization wall-clock | 3.29 seconds |
| App model-load diagnostic | 3.2 seconds |
| Last one-sentence synthesis diagnostic | 5.8 seconds |
| Last generation + ZIP diagnostic | 5.8 seconds |
| Complete browser test elapsed time | Approximately 29.7 seconds |

The synthesis and total-job diagnostics show the most recently completed one-sentence generation job (Emma), not the cumulative time across all three voice tests.

## Voice catalogue

The application discovered 28 voices from the Kokoro.js 1.2.1 `tts.voices` getter:
- 20 American English voices (11 female, 9 male).
- 8 British English voices (4 female, 4 male).

The selector displays the voice's name, gender and ID, grouped by English locale.

**API correction:** In Kokoro.js 1.2.1, `list_voices()` calls `console.table(VOICES)` but does not return the catalogue. The actual catalogue is exposed by the `voices` getter. Reading the return value of `list_voices()` caused the previous app to fall back to Adam.

The active 1.2.1 registry contains English voices only. The source has definitions for additional languages commented out under a TODO. The ONNX repository's extra multilingual voice files do not automatically make those languages usable in this runtime.

## Generated output details

| Voice | Test sentences | First WAV size | Valid header |
|---|---:|---:|---|
| Adam (`am_adam`) | 2 | 424,844 bytes | RIFF/WAVE |
| Heart (`af_heart`) | 1 | 331,244 bytes | RIFF/WAVE |
| Emma (`bf_emma`) | 1 | 367,244 bytes | RIFF/WAVE |

The Adam two-sentence ZIP:
- Generated ZIP size: 843,805 bytes.
- ZIP signature: `504b0304`.
- Downloaded ZIP size: 843,805 bytes.
- Individual WAV download: 424,844 bytes.

## Model and voice asset delivery

The browser fetched:
- Quantized ONNX model: 92,361,116 bytes (CDN response content length).
- Transformers.js WASM binary: 4,110,288 bytes.
- Each of the three tested ONNX voice files: 522,240 bytes.

Hugging Face returned HTTP 302 redirects for the three voice files; the redirected Xet CDN responses returned HTTP 200. The app/library may cache voice data, but this run does not prove cache persistence across sessions.

## Conclusion and remaining work

**Multi-voice browser support is verified for all 28 English voices registered by Kokoro.js 1.2.1 at catalogue level, and three representative voices have passed actual synthesis.** The live app can switch among those tested voices and generate valid WAV audio, with ZIP and individual WAV downloads working.

Still pending:
- Generate test audio with the rest of the 28-voice catalogue.
- Add multilingual support using a compatible runtime and phonemization path.
- Compare cold and warm cache loads across reloads and browser sessions.
- Measure performance and memory on the founder's Windows/Chrome PC.
- Test long scripts, mobile browsers and lower-memory devices.
- Test interrupted generation and recovery behaviour.
