# GitHub Pages deployment and testing

## Current deployment model

The repository's live browser app is published from the `main` branch by the **Deploy preview to GitHub Pages** workflow.

The workflow runs on pushes to `main` that change the app, public assets, Vite configuration, package manifests, relevant build scripts, or the deployment workflow itself. It can also be started manually with `workflow_dispatch`.

Expected project-site URL:

`https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/`

GitHub's deployment environment URL is authoritative if the Pages site is ever moved.

## Enable Pages

For a new repository setup:

1. Open repository **Settings**.
2. Open **Pages** under **Code and automation**.
3. Set **Build and deployment → Source** to **GitHub Actions**.
4. Save the setting if GitHub asks.

The repository is public. The published Pages site is also publicly accessible; do not put credentials, private scripts, private customer information, or generated user audio in the published files. Browser-side JavaScript and assets are visible to visitors.

## What is published

The deployment workflow builds the Vite app and publishes only `dist/`. The published output contains the static application shell and bundled JavaScript/CSS, PWA manifest and icons, service worker, ONNX Runtime WebAssembly assets, and the pre-generated English voice preview library.

The large Kokoro q8 ONNX model and its 28 English voice packs are **not** shipped in the GitHub Pages artifact. The browser downloads the pinned model assets on first use from the configured model distribution source, then uses the browser model cache and service-worker runtime cache where available. Native offline packages use a separate build path that bundles those model assets.

Repository documentation, tests, workflows, backend source and development scripts are not part of the Pages artifact.

## Automated checks

The repository has separate workflows for:

- **CI** — Node 24 syntax checks, unit tests, static build, legacy backend source checks, and deployment-output validation.
- **Deploy preview to GitHub Pages** — pre-generates the 28 English voice preview WAVs if needed, runs checks/build, and publishes `dist/`.
- **Test live GitHub Pages app** — runs the Playwright Chromium smoke test against the published URL after a successful Pages deployment. It tests model loading, synthesis, audio exports, ZIP contents, voice filters, voice preview caching and reload recovery.
- **Verify offline Kokoro voice generation** — packages the pinned q8 model and ONNX Runtime WebAssembly assets, then tests generation with external network requests blocked.

A successful static build does not by itself prove that live model downloads, browser synthesis or preview-cache restoration work. Review the live-site and offline test run results separately.

## Manual browser verification

For additional device/browser checks:

1. Open the published app in a fresh browser profile to observe first-load model downloads.
2. Generate a short test script with at least one American and one British voice.
3. Generate a multi-paragraph script and check the section files and continuous full-script audio.
4. Download and open the WAV or MP3, SRT, VTT and project ZIP outputs.
5. Reload the page and check that the draft, saved preferences and pre-generated voice previews are restored.
6. Repeat in another browser/device and record any platform-specific issues.

The browser model cache can be evicted by the browser, so offline reuse is best-effort in the web app. The native desktop and Android build workflows verify the separately bundled model path.
