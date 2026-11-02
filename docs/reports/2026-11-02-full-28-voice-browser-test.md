# Full 28-voice live GitHub Pages browser test

**Date:** 2026-11-02  
**Result:** PASSED  
**Published app:** [NextGen AI Voiceover](https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/)  
**GitHub Actions:** [Full 28-voice Chromium run #9](https://github.com/allinallsolutions2025-coder/nextgen-ai-voiceover/actions/runs/41448895781)  
**Artifact:** `pages-browser-smoke-report` (run artifact ID: `13144426698`)  
**Browser:** Headless Chrome 156.0.8078.4 via Playwright  
**Runner:** GitHub-hosted Linux

## Summary

The published GitHub Pages app loaded successfully, initialized Kokoro.js 1.2.1 and the q8 ONNX model, discovered all 28 voices registered by the runtime, and generated a WAV with **every one of the 28 voices**. All 28 outputs returned HTTP 200 and passed RIFF/WAVE header validation.

The test also confirmed that all 28 voice assets were requested from Hugging Face and all 28 redirected CDN assets returned HTTP 200. Adam was used for a two-sentence generation to exercise the multi-file ZIP path; the ZIP and an individual WAV were downloaded and their actual sizes matched the generated blobs.

## Results

| Check | Result |
|---|---|
| Published Pages HTTP 200 | PASS |
| Application shell loaded over HTTPS | PASS |
| Kokoro model loaded | PASS |
| Runtime voice catalogue discovered | PASS — 28 voices |
| Actual WAV synthesis | PASS — all 28 voices |
| WAV HTTP response | PASS — 28/28 returned HTTP 200 |
| WAV RIFF/WAVE validation | PASS — 28/28 valid |
| Adam multi-sentence generation | PASS — 2 sentences |
| ZIP signature and readability | PASS |
| Actual ZIP download | PASS — downloaded size matched generated ZIP |
| Actual individual WAV download | PASS — downloaded size matched generated WAV |
| Voice asset requests | PASS — all 28 observed |
| Voice asset CDN responses | PASS — 28 HTTP 200 responses |
| Performance diagnostics | PASS — populated |
| Page errors | 0 |
| Failed network requests | 0 |

## Complete voice generation results

| # | Voice ID | WAV size | Result |
|---:|---|---:|---|
| 1 | `am_adam` | 424,844 bytes | PASS — valid RIFF/WAVE |
| 2 | `af_alloy` | 381,644 bytes | PASS — valid RIFF/WAVE |
| 3 | `af_aoede` | 350,444 bytes | PASS — valid RIFF/WAVE |
| 4 | `af_bella` | 360,044 bytes | PASS — valid RIFF/WAVE |
| 5 | `af_heart` | 331,244 bytes | PASS — valid RIFF/WAVE |
| 6 | `af_jessica` | 345,644 bytes | PASS — valid RIFF/WAVE |
| 7 | `af_kore` | 343,244 bytes | PASS — valid RIFF/WAVE |
| 8 | `af_nicole` | 511,244 bytes | PASS — valid RIFF/WAVE |
| 9 | `af_nova` | 379,244 bytes | PASS — valid RIFF/WAVE |
| 10 | `af_river` | 343,244 bytes | PASS — valid RIFF/WAVE |
| 11 | `af_sarah` | 376,844 bytes | PASS — valid RIFF/WAVE |
| 12 | `af_sky` | 364,844 bytes | PASS — valid RIFF/WAVE |
| 13 | `am_echo` | 374,444 bytes | PASS — valid RIFF/WAVE |
| 14 | `am_eric` | 316,844 bytes | PASS — valid RIFF/WAVE |
| 15 | `am_fenrir` | 328,844 bytes | PASS — valid RIFF/WAVE |
| 16 | `am_liam` | 326,444 bytes | PASS — valid RIFF/WAVE |
| 17 | `am_michael` | 376,844 bytes | PASS — valid RIFF/WAVE |
| 18 | `am_onyx` | 374,444 bytes | PASS — valid RIFF/WAVE |
| 19 | `am_puck` | 302,444 bytes | PASS — valid RIFF/WAVE |
| 20 | `am_santa` | 381,644 bytes | PASS — valid RIFF/WAVE |
| 21 | `bf_alice` | 367,244 bytes | PASS — valid RIFF/WAVE |
| 22 | `bf_emma` | 367,244 bytes | PASS — valid RIFF/WAVE |
| 23 | `bf_isabella` | 412,844 bytes | PASS — valid RIFF/WAVE |
| 24 | `bf_lily` | 357,644 bytes | PASS — valid RIFF/WAVE |
| 25 | `bm_daniel` | 367,244 bytes | PASS — valid RIFF/WAVE |
| 26 | `bm_fable` | 405,644 bytes | PASS — valid RIFF/WAVE |
| 27 | `bm_george` | 436,844 bytes | PASS — valid RIFF/WAVE |
| 28 | `bm_lewis` | 422,444 bytes | PASS — valid RIFF/WAVE |

All entries represent actual generated browser audio, not catalogue-only checks or mocked responses.

## Timings and environment

| Measurement | Result |
|---|---:|
| Model initialization (wall clock) | 3.75 seconds |
| App model-load diagnostic | 3.7 seconds |
| Last one-sentence synthesis diagnostic | 10.6 seconds |
| Last generation + ZIP diagnostic | 10.6 seconds |
| Complete test elapsed time | Approximately 4 minutes 48 seconds |
| Browser | Headless Chrome 156.0.8078.4 |
| Operating system | GitHub-hosted Linux runner |
| Logical processors | 4 |
| Browser-reported device memory | 16 GB |
| Secure context | Yes |

The synthesis diagnostic reports the most recently completed short generation; it is not a cumulative time or a per-voice performance benchmark. The GitHub-hosted runner results are not a benchmark of the founder's CPU-only Windows PC.

## Download and model asset checks

- q8 ONNX model CDN response: 92,361,116 bytes.
- All 28 voice asset URLs were requested from Hugging Face and redirected to the CDN.
- All 28 redirected voice asset responses returned HTTP 200 with 522,240 bytes each.
- The Adam multi-sentence ZIP had a valid ZIP signature and downloaded successfully.
- The individual WAV download matched the generated WAV blob size.

## Conclusion

**All 28 English voices currently registered by Kokoro.js 1.2.1 passed real browser synthesis and valid WAV checks on the deployed GitHub Pages app.** ZIP export and individual WAV download also passed.

This verifies the current English voice catalogue only. It does not establish multilingual support, cross-device performance, cache persistence, or performance on the founder's Windows PC. Those remain separate follow-up tests. The active Kokoro.js 1.2.1 registry exposes American and British English voices; do not label this release as supporting all 54 files from the separate local PyTorch inventory.
