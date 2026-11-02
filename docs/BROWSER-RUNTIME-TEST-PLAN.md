# Browser Runtime Test Plan

## Purpose

Measure the actual Kokoro.js + ONNX + WASM browser workflow before approving it as the MVP inference architecture.

This plan separates deterministic GitHub Actions checks from real model integration testing. Routine CI must not repeatedly download large model files.

## Test environment

Record for every run:
- Date and time.
- Browser name and full version.
- Operating system.
- CPU model and available RAM (where known).
- GPU / WebGPU availability (informational; baseline uses WASM).
- Network type and approximate download speed.
- Whether browser cache was cold or warm.

## Test cases

### 1. Cold model load
1. Open the application in a fresh browser profile or clear site data for the test origin.
2. Open Developer Tools → Network and enable Preserve log.
3. Load the application and select **Load voice model**.
4. Record time from click to **Model ready**.
5. Record model/runtime request URLs, transferred bytes and any failed requests.
6. Confirm that the voice list loads and Adam is available.

### 2. Warm reload / cache behaviour
1. Without clearing storage, reload the page.
2. Load the model again.
3. Compare transferred bytes and load time against the cold run.
4. Repeat in a new tab and then a new browser session.
5. Record whether the browser reuses cached assets.

Do not assume browser cache will persist indefinitely. A cleared profile or storage eviction may force a new download.

### 3. Short text synthesis
Use the same test text and settings for repeatability:

> Hello. This is a short NextGen AI Voiceover browser test.

Record:
- Time from Generate click to first WAV.
- Total generation time.
- Output duration and file size.
- Whether playback succeeds.
- Whether the ZIP opens and contains the expected WAV file.

### 4. Medium and long text synthesis
Test approximately 500, 2,000 and 10,000 characters, remaining within the current 20,000-character input limit and 150-segment limit.

Record:
- Parsed sentence count.
- Total generation time.
- Average time per sentence.
- Peak memory estimate from browser task manager/devtools where available.
- Any UI freeze, tab crash, audio truncation or failed segment.

Do not use sensitive personal text for tests.

### 5. Voice coverage
For each voice selected for MVP:
1. Confirm the ID is returned by the runtime voice list.
2. Generate the same short neutral test sentence.
3. Confirm a playable WAV is produced.
4. Record language, quality notes and any unsupported voice/language combination.

Do not expose all 54 native PyTorch voice files in the web UI unless matching ONNX assets are confirmed.

### 6. Error handling
Test:
- Offline before model load.
- Network interruption during model load.
- Empty text.
- More than 20,000 characters.
- More than 150 sentence segments.
- Unsupported or missing voice ID.
- Browser tab refresh during generation.
- Download blocked by browser settings.

Record expected versus actual behaviour and create an issue for each reproducible failure.

### 7. Mobile and low-resource devices
Test at least one Android or iOS browser and one lower-powered laptop if available. Record cold-start time, generation time, memory and failures. Do not claim broad device support until this has been done.

## Acceptance criteria for the first runtime spike

- Model can load successfully in a supported desktop browser.
- Runtime returns a usable voice catalogue.
- At least one voice produces a non-empty playable WAV.
- ZIP contains the expected WAV files.
- Text remains in the browser (verify network log).
- Failure states are understandable and do not leave controls permanently disabled.
- Cold/warm load metrics and generation metrics are recorded.

The team must set numerical performance targets after collecting baseline measurements. Do not invent performance thresholds before the first test run.

## Result log template

| Run | Browser / OS | Cache | Model load | Short synthesis | 500 chars | 2k chars | 10k chars | Result / notes |
|---|---|---|---|---|---|---|---|---|
| Baseline 1 | Chrome / Windows (exact versions and hardware details not yet recorded) | Cold / first observed load | 1–2 minutes (user-reported) | Four-sentence smoke test completed; exact timing pending | Pending | Pending | Pending | Model/voice loaded; four WAVs played/downloaded; ZIP download worked |


## Baseline recorded 2026-11-02

Founder-reported first model load: approximately 1–2 minutes in Google Chrome on a CPU-only Windows PC. This is an initial observation, not a controlled benchmark. The exact Chrome version, CPU model, RAM, network throughput, cache state and bytes transferred were not recorded.

The application now displays local timings for:
- Model/runtime initialization from the Load action until the Kokoro runtime resolves.
- Cumulative synthesis time across all generated segments.
- Total generation job time, including WAV conversion and ZIP packaging.

For the next run, record these three values and use DevTools Network to capture actual transferred bytes and cache indicators. Compare a cold run (fresh profile or cleared site data) with a warm reload (same profile without clearing site data). Do not assume a warm reload is cached until the Network panel confirms it.


## HAR review — 2026-11-02

A Chrome HAR was supplied for the Codespaces preview at `https://turbo-space-yodel-5v4wpgr49qqr2wwj-4173.app.github.dev/`.

### Observed in the HAR

- Page `onContentLoad`: approximately 391 ms.
- Page `onLoad`: approximately 490 ms.
- Nine network entries were recorded.
- The app HTML returned HTTP 200.
- CSS, app JavaScript and text helper JavaScript were reported by Chrome as **memory cache**.
- Kokoro.js 1.2.1, the Transformers.js WASM JavaScript module, the 21.6 MB uncompressed WASM binary and JSZip were reported as **disk cache**.
- The browser requested `/favicon.ico`, which returned HTTP 404.

### What cannot be concluded from this HAR

- It is a warm-cache capture for several runtime assets, not a cold first-visit download measurement.
- No ONNX model weight or voice asset URL appears among the nine recorded requests. Therefore this file does not establish whether the model weights were newly downloaded, previously cached in another browser storage layer, or not fetched during the recorded session.
- The HAR does not include the visible Performance diagnostics values from the UI, nor the actual model initialization duration or synthesis duration.
- The content sizes shown for cached files are resource sizes, not bytes transferred during this capture.

### Follow-up

1. Capture a cold run in a fresh Chrome profile or after clearing site data for the preview origin.
2. Keep DevTools Network recording active with Preserve log enabled before clicking **Load voice model**.
3. Wait for **Model ready**, generate a short script, then export the HAR.
4. Confirm that ONNX model/config and voice asset URLs appear; record their transferred sizes and whether any are served from cache.
5. Screenshot the Performance diagnostics panel after generation.

The missing favicon request is fixed by adding an inline SVG data URL to the page head, avoiding an extra file and network request.


## Automated live Pages test — 2026-11-02

A real Playwright Chromium smoke test against the published GitHub Pages URL passed:
- HTTP 200 and application shell loaded over HTTPS.
- Kokoro q8/ONNX model loaded in 5.64 seconds on the GitHub-hosted Linux runner.
- Runtime returned one voice, `am_adam`.
- Two-sentence test produced two WAV rows.
- First WAV blob had a valid RIFF/WAVE header (424,844 bytes).
- ZIP had a valid ZIP signature; actual browser download completed at 843,805 bytes and matched the generated ZIP blob.
- Synthesis diagnostic: 23.0 seconds; total generation + ZIP: 23.2 seconds.
- Zero page errors or failed network requests were recorded.

The test fetched the quantized ONNX model (92,361,116-byte CDN response), Transformers.js WASM (2,988,171 bytes), and the Adam ONNX voice file (522,240 bytes). These are response content lengths, not a total traffic measurement.

**Interpretation:** this is a fresh Playwright browser-context result on a GitHub-hosted Linux machine, not a benchmark of the founder's Windows PC and not evidence of warm-cache persistence. See [the detailed test report](reports/2026-11-02-pages-browser-smoke-test.md).

**New issue to resolve:** the browser runtime exposes only `am_adam` in this test. Multi-voice support remains unverified; native `.pt` assets must not be assumed compatible with browser ONNX voice files.


## Multi-voice live Pages test — 2026-11-02

A real Playwright Chromium run against the published Pages URL passed:
- Kokoro.js 1.2.1 discovered 28 voices through the `tts.voices` getter.
- Adam (`am_adam`): 2 sentences, valid WAV output.
- Heart (`af_heart`): 1 sentence, valid WAV output.
- Emma (`bf_emma`): 1 sentence, valid WAV output.
- WAV RIFF/WAVE headers passed for all three outputs.
- ZIP validation and actual ZIP download passed; downloaded size matched generated size.
- An individual WAV download passed and matched the generated blob size.
- Three Hugging Face voice-file redirects resolved to CDN HTTP 200 responses (522,240 bytes each).

The browser was headless Chrome 156 on a GitHub-hosted Linux runner. Model loading: 3.29 seconds; latest single-sentence synthesis diagnostic: 5.8 seconds. These are not founder-PC timings.

See [the detailed multi-voice test report](reports/2026-11-02-multi-voice-browser-test.md).

**Runtime limitation:** Kokoro.js 1.2.1 actively registers 28 English voices (20 American and 8 British). Other multilingual voice definitions are commented out in this version; multilingual support remains a separate engineering task.
