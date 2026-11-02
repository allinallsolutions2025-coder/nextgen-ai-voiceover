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
| Baseline 1 | Pending | Cold | Pending | Pending | Pending | Pending | Pending | Pending |
