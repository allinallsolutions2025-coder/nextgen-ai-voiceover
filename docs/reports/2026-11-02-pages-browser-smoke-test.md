# Live GitHub Pages browser smoke test

**Date:** 2026-11-02  
**Result:** PASSED  
**Target:** [NextGen AI Voiceover on GitHub Pages](https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/)  
**Automation:** [GitHub Actions run #1](https://github.com/allinallsolutions2025-coder/nextgen-ai-voiceover/actions/runs/41444109313)  
**Browser:** Headless Chromium via Playwright on GitHub-hosted Linux runner

## Summary

The published Pages website was opened by a real Chromium browser. The test loaded the Kokoro runtime and quantized ONNX model, discovered a voice, synthesized a two-sentence script, checked a generated WAV header, validated the ZIP signature, and verified the browser downloaded the ZIP with the expected file size.

All automated assertions passed. The browser test reported no page errors or failed network requests.

## Environment

| Property | Observed value |
|---|---|
| Browser | Headless Chrome 156.0.8078.4 |
| Operating system | Linux (GitHub-hosted runner) |
| Hardware concurrency | 4 logical processors |
| `navigator.deviceMemory` | 16 GB (browser-reported estimate) |
| Secure context | Yes |
| Page response | HTTP 200 |
| Application title | NextGen AI Voiceover — Browser Runtime Test |

These are GitHub-hosted runner measurements, not measurements from the founder's Windows PC.

## Results

| Check | Result |
|---|---|
| GitHub Pages page loads | PASS |
| Application shell found | PASS |
| HTTPS secure context | PASS |
| Kokoro model reaches "Model ready" | PASS |
| Voice selector populated | PASS — 1 voice |
| Speech generation completes | PASS |
| WAV data readable | PASS |
| WAV RIFF/WAVE header | PASS |
| ZIP data readable | PASS |
| ZIP file signature | PASS |
| Browser ZIP download | PASS |
| Downloaded ZIP size equals generated ZIP size | PASS |
| Performance diagnostics populated | PASS |
| Page errors / failed requests | 0 |

### Timings

| Metric | Measured value |
|---|---:|
| Model initialization wall-clock | 5.64 seconds |
| App model-load diagnostic | 5.6 seconds |
| Synthesis time for two sentences | 23.0 seconds |
| Total generation + ZIP time | 23.2 seconds |

The 5.64-second model load occurred in a fresh Playwright browser context on a GitHub-hosted runner. It must not be compared directly with the founder's reported 1–2 minute load on a CPU-only Windows PC: hardware, network throughput, browser build and geography differ.

### Generated output

Test text:

> This is an automated NextGen AI Voiceover browser test. Kokoro should create a WAV file and a ZIP archive.

| Output check | Observed value |
|---|---:|
| Sentence/WAV rows generated | 2 |
| First WAV blob size | 424,844 bytes |
| WAV header | `RIFF....WAVE` |
| ZIP size | 843,805 bytes |
| ZIP signature | `504b0304` (valid local-file header) |
| Downloaded ZIP size | 843,805 bytes |
| Downloaded filename | `nextgen-voiceover-wavs.zip` |

The test reads the WAV and ZIP blobs in the browser, then triggers an actual browser download and checks the downloaded file size. It does not upload or retain the generated test audio in the repository.

## Network observations

The fresh browser context fetched these key assets:

| Asset | Observed response | Reported content length |
|---|---:|---:|
| Kokoro.js 1.2.1 bundle | 200 | 891,156 bytes |
| Quantized ONNX model (final CDN response) | 200 | 92,361,116 bytes |
| Transformers.js WASM binary | 200 | 2,988,171 bytes |
| Adam voice asset `am_adam.bin` (final CDN response) | 200 | 522,240 bytes |
| JSZip ESM bundle | 200 | 33,197 bytes |

Hugging Face model URLs initially returned redirects (307/302) and resolved to CDN URLs with HTTP 200. The 92,361,116-byte value is the ONNX model response's reported content length, not a sum of all network traffic.

## Important finding: one voice available

The runtime returned only one voice ID during this test: `am_adam`.

This means multi-voice support is **not yet verified in the web application**, even though the founder's local native PyTorch inventory contains 54 `.pt` voice files. Native PyTorch voice files are not interchangeable with the browser ONNX runtime's voice assets. The next engineering task is to establish the correct ONNX voice catalogue/API and test several browser-compatible voices end to end.

## Still not tested

- Warm-cache model load and actual reuse of cached ONNX/voice assets.
- Browser reload persistence and cache eviction.
- Founder Windows/Chrome performance and memory.
- 500, 2,000 and 10,000-character scripts.
- All 54 voice options or multiple languages.
- Mobile Safari/Chrome and lower-memory devices.
- Network interruption and retry/resume behaviour.
- Sustained or concurrent multi-user load.

## Conclusion

The published GitHub Pages build passes a real headless Chromium smoke test for page loading, Kokoro inference, WAV generation, ZIP creation and ZIP download.

This validates the **current single-voice browser prototype**, not a production SaaS or the full 54-voice product. The next priority is multi-voice discovery and warm-cache/performance testing on the founder's actual Windows/Chrome setup.
