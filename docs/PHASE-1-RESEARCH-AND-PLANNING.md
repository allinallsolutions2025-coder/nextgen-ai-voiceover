# NextGen AI Voiceover
## Phase 1 — Research and Planning

**Document status:** Working product blueprint  
**Prepared:** 1 November 2026  
**Product name:** NextGen AI Voiceover  
**Initial TTS engine:** Kokoro  
**Initial platform:** Web application  
**Development approach:** GitHub as the source of truth; automated testing with GitHub Actions

---

## 1. Executive summary

NextGen AI Voiceover is a planned freemium text-to-speech web application built initially around the Kokoro open-weight TTS model. The goal is to make voice generation accessible to a broad audience, with early validation focused on creators making YouTube videos, Shorts, Reels, podcasts, educational material and other digital content.

The project began with a working browser-based Hugging Face Static Space. The prototype accepts text, generates one WAV file per sentence and packages the files into a ZIP. It currently uses one voice (Adam) at a fixed speed. It demonstrates a basic browser-inference workflow, but it is not yet a complete SaaS product: there is no verified account system, billing, durable user history, service-level guarantee or robust server-enforced usage control.

**Current recommendation:** preserve the browser-first Kokoro.js + ONNX + WASM direction for the MVP investigation. Validate the actual model-loading path, browser compatibility, performance, licensing and usage-control options before committing to the final architecture. The separate local Python/PyTorch application is a useful development and comparison tool, but its `.pth` model and `.pt` voice files are not directly interchangeable with the browser ONNX runtime's model and `.bin` voice assets.

Phase 1 research is documented here. Important work remains before final architecture sign-off: reproducible browser performance tests, a component-by-component licence review, and a decision on how fair-use limits can be implemented in a browser-first product.

## 2. Product decisions confirmed by the founder

| Area | Confirmed decision |
|---|---|
| Product name | NextGen AI Voiceover |
| Intended audience | Everyone |
| Initial model | Kokoro only |
| Business model | Freemium |
| Free plan | Fair-use limits; exact allowance not decided |
| Initial platform | Web application |
| Brand identity / visual system | Decide later |
| Existing prototype | Audit first; improve or rebuild based on evidence |
| Development workflow | Work in GitHub and test using GitHub Actions |
| Primary repository | `allinallsolutions2025-coder/nextgen-ai-voiceover` |
| Repository visibility | Private |

### Recommended initial audience focus (not a restriction)

The product can be open to everyone, but early validation should focus on content creators because the founder already uses the prototype for YouTube channels. Initial user interviews and beta tests should include Shorts/Reels creators, long-form YouTubers, podcasters, educators and small businesses.

## 3. Problem statement and product opportunity

The founder became concerned that the ElevenLabs Free plan restricts use to non-commercial purposes. The current ElevenLabs Terms of Use state that Free Users may use the services only for non-commercial purposes, while Paid Users may use them commercially subject to the remaining terms and policies.

Kokoro's official Hugging Face repository declares the model under Apache 2.0, which permits commercial use subject to the licence conditions. This makes Kokoro a credible technical foundation to investigate for a product with commercial deployment. It does **not** mean every dependency, voice asset, dataset component, third-party package or generated output is automatically free of all restrictions. Those components require separate review.

The opportunity is not simply “free AI voices.” Existing products already offer free or freemium TTS. The product should differentiate through a simple workflow, transparent model/licensing information, creator-focused audio handling, voice choice, reliable downloads and an honest fair-use policy.

## 4. Existing prototype audit

### 4.1 Hugging Face Space

Prototype: [TheRealOrgin — Kokoro Sentence WAV ZIP Builder](https://huggingface.co/spaces/adummuy/TheRealOrgin)

The supplied README, `index.html`, `SPACE_UPLOAD_CHECKLIST.txt` and `TECHNICAL_NOTES.txt` establish:

- Space SDK: `static`; entry file: `index.html`.
- Frontend runtime: Kokoro.js `1.2.1`, loaded from a version-pinned jsDelivr URL.
- ZIP library: JSZip `3.10.1`, loaded from a version-pinned jsDelivr URL.
- Model ID: `onnx-community/Kokoro-82M-v1.0-ONNX`.
- Inference configuration: `dtype: "q8"`, `device: "wasm"`.
- Default voice: `am_adam` (Adam).
- Default speed: `0.95`.
- Input limit: 20,000 characters.
- Output limit: 150 sentence segments per ZIP.
- Text parsing supports one sentence per line and attempts to split paragraphs at `.`, `!` and `?`; it also unwraps quoted Python-list string lines.
- The app generates one WAV per parsed sentence and packages the files into a ZIP in the browser.
- Model/runtime assets are not bundled in the Static Space. The browser obtains them over the network as needed.
- The UI asks the user to keep the browser tab open during generation.

**Important architecture finding:** the current Space is browser-based. It does not run the native Python Kokoro pipeline on a Hugging Face CPU/GPU server. A Static Space hosts web assets; the browser performs speech inference with WASM. First-download duration and subsequent cache behaviour must be measured in real browsers. Do not promise that model assets will always remain cached: users can clear browser data, use another browser/device or encounter storage eviction.

### 4.2 Local Windows model inventory

The supplied inventory CSV and screenshots show:

- 54 voice files under `voices/`, each approximately 0.5 MiB in the inventory.
- `kokoro-v1_0.pth`: approximately 312 MiB according to the inventory.
- `config.json`.
- Four Hugging Face cache/metadata files.

These local assets are for the native PyTorch Kokoro setup. The local `.pt` files are not the same format as the ONNX repository's browser voice `.bin` files.

### 4.3 Local Python desktop application

Supplied file: `kokoro_sentence_wav_zip.py`.

Observed implementation:

- Tkinter desktop UI.
- Constants: `VOICE = "am_adam"`, `SPEED = 0.95`, `LANG_CODE = "a"` (American English), sample rate 24 kHz, 20,000-character input limit and 150-segment ZIP limit.
- Loads `config.json`, `kokoro-v1_0.pth` and the selected `.pt` voice from the local model folder.
- Detects CUDA with `torch.cuda.is_available()`; selects CUDA when available and otherwise CPU.
- Loads the model in a background thread and keeps the pipeline in memory for later generations until the desktop app is closed.
- Generates one WAV per sentence and writes a ZIP using a temporary file followed by an atomic replace.
- Includes basic progress/error handling and cleans up the temporary ZIP after a failure.

The supplied `download_kokoro_model.py` currently requests only three files: `config.json`, `kokoro-v1_0.pth` and `voices/am_adam.pt`. It does not fetch all 54 voices. A future setup script should support downloading the complete catalogue or selected voices without duplicating already downloaded files.

### 4.4 Dependency file and local machine

The supplied `requirements.txt` contains:

```text
kokoro==0.9.4
soundfile>=0.12.1,<1.0
numpy>=1.26.4,<2.0
huggingface_hub>=0.25.0,<1.0
```

The desktop script imports `torch` directly. Kokoro may bring PyTorch in as a dependency, but the project should make the runtime choice explicit and reproducible in a lockfile or documented install instructions after compatibility testing.

The founder's reported local environment is `torch 2.14.1+cpu`, with `torch.cuda.is_available() == False`. The tested PC is CPU-only; do not assume CUDA acceleration is available.

The Python script also advises installing eSpeak NG for Windows if the relevant phonemization dependency reports an error. Confirm actual runtime requirements and installation instructions during a clean-environment test.

### 4.5 What the prototype does not yet prove

The supplied files show implementation intent, not independent test results. The following have not yet been measured or verified end-to-end:

- Cold-start model download duration and exact transferred bytes.
- Warm-start/cache reuse behaviour across reloads and browser sessions.
- Generation speed by text length, voice and device.
- Browser memory consumption and maximum practical input size.
- Behaviour on mobile devices and lower-powered laptops.
- Resilience to interrupted generation, tab closure, browser storage eviction and network errors.
- Accessibility, keyboard navigation and screen-reader support.
- Security/privacy review of future analytics, authentication and third-party scripts.

## 5. Kokoro model and asset strategy

### 5.1 Native and ONNX assets are different

| Local/native Python runtime | Browser runtime |
|---|---|
| `kokoro` Python package | Kokoro.js / browser-compatible runtime |
| PyTorch `.pth` weights | ONNX model files |
| `.pt` voice embeddings | ONNX/browser `.bin` voice files |
| CPU or compatible CUDA device | WASM/browser device (current prototype) |

Do not copy native `.pth` or `.pt` assets into the browser app and assume they will load. Do not upload either model weights or voice binary collections to the application Git repository by default.

### 5.2 ONNX variants and download size

The ONNX repository contains multiple model variants and supporting files. The model card lists example model files including approximately:

- FP32 `model.onnx`: 326 MB.
- FP16 `model_fp16.onnx`: 163 MB.
- Quantized `model_quantized.onnx`: 92.4 MB.
- Mixed-precision `model_q8f16.onnx`: 86 MB.

The whole repository tree is larger than any one model variant because it contains multiple variants and supporting assets. The current app's `dtype: "q8"` configuration must be tested to establish exactly which model file(s) the pinned Kokoro.js runtime fetches. Do not infer that from filenames alone.

### 5.3 Voice catalogue

The local inventory contains 54 native `.pt` voice files. The ONNX model repository has browser-compatible `.bin` voice assets and documents its voice catalogue. NextGen AI Voiceover should build its selector from a reviewed catalogue containing voice ID, display name, language, labels only where upstream documentation supports them, preview sample and licence/provenance note.

Do not claim that all voices are available in every language or that all languages have identical output quality. Language coverage and voice quality require separate tests.

### 5.4 Asset distribution decision

- **GitHub:** application source, tests, documentation, small metadata and configuration files.
- **Hugging Face model repositories:** upstream model files and model-specific voice assets, fetched selectively.
- **Browser cache:** optional local reuse of model files, subject to browser storage behaviour.
- **User audio:** initially generated locally in the browser; if server storage is added later, use private short-lived object storage and automatic cleanup.

Avoid committing large model weights to the Git repository. For the MVP, use upstream repositories and pinned runtime versions. Evaluate a controlled mirror only if uptime, licensing, bandwidth or version stability makes it necessary.

## 6. Licensing, commercial use and platform policy

### 6.1 ElevenLabs

The current ElevenLabs Terms of Use state that Free Users may use the services only for non-commercial purposes; Paid Users may use them commercially subject to the rest of the terms and prohibited-use policy. Recheck the current terms before relying on this interpretation. Do not assume that upgrading later retroactively grants commercial rights to audio generated under a free plan; ask ElevenLabs for clarification if needed.

### 6.2 Kokoro

The official `hexgrad/Kokoro-82M` Hugging Face repository declares Apache 2.0. Apache 2.0 permits commercial use, modification and redistribution subject to its conditions, including preserving applicable licence/notice information and marking changed files as required.

The model card also identifies CC BY 3.0 and CC BY 4.0 audio data used in training. Retain this provenance in the product's licence register. This does not by itself change the repository's declared model licence, but it is a reason to avoid broad claims such as “everything is copyright-free.” Review the exact assets redistributed with the app. Do not imply that model licensing guarantees that every generated output is free of third-party rights.

### 6.3 Component-by-component licence register required

Before public beta and especially before paid launch, record the exact version, source, licence, attribution/notice requirements, redistribution permissions and review date for:

- Kokoro model weights and configuration.
- Each voice asset or voice pack.
- Kokoro.js and its transitive packages.
- ONNX Runtime Web / WASM assets and other browser dependencies.
- JSZip and other frontend libraries.
- Fonts, icons, illustrations, sample audio and UI assets.
- Any future analytics, storage, authentication, email or payment SDK.

This document is not a legal opinion. Obtain qualified legal review before commercial launch if licence interpretation remains uncertain.

### 6.4 YouTube monetization

AI narration and faceless presentation do not, by themselves, establish that a channel is eligible or ineligible for monetization. YouTube's monetization policies focus on original/authentic value and exclude repetitive or mass-produced “inauthentic” content. Using a commercially permitted TTS engine does not guarantee YouTube Partner Program eligibility. Certain realistic altered or synthetic content may also require disclosure under YouTube's separate disclosure policy; check current policy for each use case.

## 7. Market and competitor research

Initial benchmark set:

- **ElevenLabs:** quality and creator-experience benchmark; free-plan commercial-use restriction is a key contrast to investigate.
- **TTSMaker:** free-plan and commercial-use positioning benchmark.
- **Speechify Studio:** polished creator workflow and freemium/pricing benchmark.

Do not publish competitor quota, price, feature or licence claims without rechecking the competitor's official current pricing and terms on the date the claim is published. Competitor details change frequently.

### Potential differentiation to test

1. Simple, creator-friendly interface.
2. Sentence-by-sentence audio generation.
3. Individual WAV downloads and one-click ZIP export.
4. Multiple Kokoro voices and adjustable speed.
5. Clear model and voice-asset licence information.
6. No traditional per-character wallet, while still applying fair-use and capacity limits transparently.

These are hypotheses to validate with beta users, not proven competitive advantages.

## 8. MVP scope proposal

### MVP — include

- Responsive web interface.
- Kokoro.js + ONNX + WASM inference, if browser benchmarking validates it.
- Model loading state and clear ready/error status.
- Voice selector for supported, verified voices.
- Speech speed control within tested safe bounds.
- Text editor with character/segment count and validation.
- Sentence splitting that can be tested and explained to users.
- Individual audio preview/playback.
- Individual WAV downloads.
- ZIP export of generated WAVs.
- Progress reporting, cancellation/retry behaviour and recoverable errors.
- Keyboard accessibility and mobile-responsive layout.
- Documentation for privacy, supported browsers, model attribution and limitations.

### Defer until after MVP validation

- Account system and saved history.
- Batch projects and bulk uploads.
- MP3 export and advanced audio processing.
- Voice cloning or user-uploaded custom voices.
- API access.
- Team accounts and collaboration.
- Advanced emotion/style controls.
- Payment integration and paid subscriptions.

Do not launch voice cloning as an MVP feature. It raises consent, impersonation, data-protection and abuse-prevention requirements that need a separate product and safety review.

## 9. Freemium product model

The confirmed direction is a fair-use Free tier plus a higher-capacity Premium tier. Exact quotas, prices and benefits remain undecided until infrastructure and beta usage are measured.

| Capability | Free tier (proposal) | Premium tier (proposal) |
|---|---|---|
| Core Kokoro TTS | Available | Available |
| Voice selection | Selected voices | Expanded catalogue |
| Speed controls | Basic | Expanded range, after testing |
| WAV download | Yes | Yes |
| ZIP export | Yes | Yes |
| Batch generation | Limited | Higher allowance |
| Generation priority | Standard | Potential priority if server jobs exist |
| History | Limited or local-only | Extended, if accounts/storage are built |
| Usage | Published fair-use cap | Higher published allowance |

**Important architectural constraint:** In a purely browser-side app, users can inspect or modify client code and run public model assets outside the app. A client-side counter alone is not reliable enforcement of a commercial quota. If enforceable quotas, billing entitlements or abuse controls become essential, the product will need a backend or another verifiable service boundary. This may require server-side inference, authenticated job issuance or a carefully designed hybrid. Do not promise unlimited generation or strong enforcement until this is solved.

## 10. Architecture options and recommendation

### Option A — browser-based inference (recommended for MVP investigation)

Frontend → Kokoro.js + ONNX/WASM in the user's browser → local audio generation → WAV/ZIP downloads.

**Advantages**
- Minimal server-side inference cost.
- No GPU inference server required for each generation.
- Model files can be cached by the browser where supported.
- Fits the existing Static Space prototype.

**Risks**
- User device CPU/RAM and browser compatibility determine performance.
- First model download can be large and depends on network conditions.
- Browser storage can be cleared or evicted.
- Client-side usage enforcement is weak.
- Mobile support, memory limits and reliability need real tests.

### Option B — server-side inference

Frontend → authenticated API → queue/worker → Kokoro inference host → temporary audio storage → downloads.

**Advantages**
- Central control over model version, queue and usage accounting.
- Better control over premium entitlements and abuse mitigation.
- Can support users whose devices are not suitable for local inference.

**Risks**
- Inference compute, storage, bandwidth and queue costs.
- Requires operational monitoring, security, retries and capacity planning.

### Recommendation

Prototype and benchmark Option A first, because the existing app already uses it and it may keep early hosting costs low. Do not lock the SaaS architecture until it is tested and the quota/control question is solved. A hybrid architecture may eventually fit: browser-side inference for local generation plus optional server-side jobs or features for paid users. This is a possibility, not an approved design.

## 11. GitHub-first development and CI strategy

GitHub is the source of truth for source code, issues, documentation, pull requests and release history. GitHub Actions will run automated checks on pushes and pull requests.

**Repository:** [allinallsolutions2025-coder/nextgen-ai-voiceover](https://github.com/allinallsolutions2025-coder/nextgen-ai-voiceover)  
**Visibility:** Private  
**Default branch:** `main`

### Proposed repository layout

```text
nextgen-ai-voiceover/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── browser-tests.yml
│       └── model-tests.yml
├── src/
│   ├── components/
│   ├── engine/
│   ├── voices/
│   ├── audio/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── browser/
├── docs/
├── public/
├── package.json
└── README.md
```

Final framework and exact structure remain to be selected after the browser/runtime test spike.

### Proposed CI checks

- Linting and formatting.
- Type checking if TypeScript is selected.
- Unit tests for text parsing, sentence segmentation, voice metadata and audio packaging.
- Frontend production build.
- Browser smoke tests for model status UI, controls, error states and ZIP interaction using mocks/stubs.
- Optional real-model integration test on a manual or scheduled workflow, avoiding large model downloads on every commit.
- Dependency and licence inventory checks.

Keep standard CI fast and deterministic. Do not make every pull request download hundreds of megabytes of model data. Pin actions to maintained versions and restrict workflow permissions to the minimum required.

## 12. Security, privacy and operational requirements

Before public beta:

- Validate text length, segment count and supported voice IDs.
- Avoid injecting user text into HTML; use safe DOM text APIs.
- Do not expose secret keys in browser code.
- If backend accounts are added, enforce authorization and usage rules server-side.
- Keep user scripts local unless a clear feature requires transmission.
- Publish a privacy policy that accurately describes data flows and retention.
- If audio is stored server-side, use private object storage, short-lived download links and automatic deletion.
- Add request/rate limits to backend endpoints.
- Record errors and aggregate performance metrics without logging user text/audio by default.
- Provide a clear consent and safety policy before any future voice cloning feature.

## 13. Risks and open questions

| Risk / question | Why it matters | Next validation |
|---|---|---|
| Model download size | A large first download harms onboarding | Measure actual assets fetched by current Kokoro.js q8 configuration |
| Browser caching | Repeat visits may still re-download assets | Test refresh, new session, storage clearing and browsers |
| CPU performance | Founder's PC is CPU-only | Benchmark short/medium/long scripts on CPU and browser WASM |
| Mobile and low-memory devices | Broad audience includes phones and older PCs | Run compatibility matrix and memory tests |
| `.pt` vs `.bin` mismatch | Assets cannot be swapped directly | Use runtime-compatible upstream voice assets |
| Licensing provenance | Model and bundled components have different licences | Complete versioned licence register |
| Fair-use enforcement | Browser-only controls can be bypassed | Decide backend/hybrid strategy before paid plans |
| Product identity | Brand system intentionally postponed | Research name/domain/trademark before public brand launch |
| Competitor terms/pricing | Frequently change | Recheck official pages before publishing comparisons |
| Actual demand | Differentiators are hypotheses | Conduct beta interviews and measure use/retention |

## 14. Phase 1 work plan and exit criteria

Phase 1 is complete when these deliverables exist:

1. Product requirements document and agreed MVP scope.
2. Complete licence register for model, voices, runtime and third-party packages.
3. Reproducible browser performance report (cold load, warm load, generation time, memory, device/browser matrix).
4. Verified model/voice asset-loading plan.
5. Decision on browser-only versus hybrid/server architecture, including quota-enforcement strategy.
6. Competitor comparison based on current official pages and documented review dates.
7. GitHub repository with CI workflows and a passing baseline test suite.
8. Prioritized Phase 2 backlog with acceptance criteria.

### Current progress

| Work item | Status |
|---|---|
| Product name and initial decisions | Confirmed |
| Public prototype source review | Reviewed |
| Local PyTorch model inventory | Reviewed (54 `.pt` voice files) |
| Desktop Python script | Reviewed |
| Model downloader script | Reviewed; downloads only Adam voice currently |
| Python requirements | Reviewed |
| Local compute capability | CPU-only confirmed by founder |
| GitHub private repository | Created and access verified |
| Phase 1 planning document | Prepared; committed separately from application code |
| Browser performance benchmarks | Pending |
| Clean browser/device test matrix | Pending |
| Full third-party licensing register | Pending |
| Fair-use enforcement architecture | Pending |
| CI workflows and baseline tests | Pending |
| Final Phase 1 sign-off | Pending |

## 15. Recommended immediate next steps

1. Commit and review this Phase 1 document in the private GitHub repository.
2. Set up a baseline GitHub Actions workflow for lint, unit tests and production build.
3. Create a small browser-runtime spike that verifies the selected ONNX quantized model and voice load path without adding accounts or payment code.
4. Run repeatable tests to measure cold/warm loading and speech generation on the founder's CPU-only Windows device and at least one mainstream browser environment.
5. Finalize the MVP architecture and Phase 2 backlog based on those results.

---

## Sources and reference links

Official sources should be rechecked before launch because terms, pricing, model repositories and platform policies can change.

### Model and runtime

- [Kokoro-82M official Hugging Face repository](https://huggingface.co/hexgrad/Kokoro-82M) — model card and Apache 2.0 declaration; includes training-data provenance notes.
- [Kokoro-82M ONNX repository](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) — browser-compatible model repository.
- [ONNX model variants and file sizes](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/onnx).
- [ONNX voice assets](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/voices).
- [Kokoro.js package](https://www.npmjs.com/package/kokoro-js).
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

### Hosting and development

- [Hugging Face Spaces overview](https://huggingface.co/docs/hub/spaces-overview).
- [Hugging Face Spaces hardware](https://huggingface.co/docs/hub/spaces-gpus).
- [GitHub Actions pricing](https://github.com/pricing).
- [GitHub Actions documentation](https://docs.github.com/actions).
- [GitHub repository file size guidance](https://docs.github.com/repositories/working-with-files/managing-large-files/about-large-files-on-github).

### Licensing and platform policies

- [ElevenLabs Terms of Use](https://elevenlabs.io/terms-of-use).
- [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392).
- [YouTube altered or synthetic content disclosure](https://support.google.com/youtube/answer/14328491).

### Competitor research starting points

- [TTSMaker](https://ttsmaker.com/).
- [ElevenLabs pricing](https://elevenlabs.io/pricing).
- [Speechify Studio pricing](https://speechify.com/pricing-studio/).

---

**Document note:** This is a project planning document, not legal advice, a guarantee of YouTube monetization, or proof that the prototype has passed production testing. Items marked pending require verification before launch.
