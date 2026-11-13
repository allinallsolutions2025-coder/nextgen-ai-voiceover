# Repository audit — 2026-11-13

## Scope

Audit baseline: `main` at `3be5fef81f766043d002adec6a0270f6b5068873` (November 5, 2026).

The review covered the browser app entry point, PWA/service-worker files, core speech and audio modules, preview generation/loading, automated tests, GitHub Actions workflows, desktop and Android packaging configuration, and GitHub Pages documentation.

The audit preserved the English-first Kokoro browser workflow and the 28 American/British English voices.

## Findings and changes

### Fixed or hardened in this audit branch

1. **Malformed PWA metadata in `index.html`.** Two literal backslash-`n` sequences were present in the document head around the manifest link and mobile metadata. They were converted into actual line breaks so the browser can parse the tags. The build checker now requires the manifest link to be a standalone HTML head element.
2. **Preview cache smoke-test version mismatch.** The application opens IndexedDB schema version 2 and writes preview records tagged with sample version 2. The live Pages test explicitly opened database version 1 and filtered for sample version 1, which would raise an IndexedDB `VersionError` or report zero saved previews. The test now opens the current database version and validates record versions against `database.version`.
3. **Unpinned Playwright installation.** The live Pages and offline browser-test workflows installed the floating latest Playwright package. The previous live Pages and offline runs failed during npm installation because `playwright-core@1.65.0` was not available at that time, before Chromium or either browser test started. Both browser-test workflows now pin Playwright to `1.65.0`.
4. **Bundled voice-preview integrity.** The preview generator already wrote byte counts and SHA-256 values to the manifest, but the browser ignored them. The app now requires a complete, unique manifest matching the 28 supported English voice IDs, restricts every asset path to its matching voice WAV, and verifies WAV framing, exact length and SHA-256 before playback or local caching. Failed bundled samples remain eligible for automatic model-based regeneration. New unit tests cover malformed manifests, unsafe filenames, incomplete voice sets, corrupt WAV files and checksum mismatches.
5. **Flaky live smoke-test wait.** The browser test previously required observing a transient generation status before accepting completion. Very short scripts can complete between Playwright polls. The wait now accepts a completed state in the first phase and still validates the final result.
6. **Legacy API authentication default.** The separate legacy FastAPI backend previously allowed inference whenever `NEXTGEN_API_KEY` was unset. Protected endpoints now fail closed with HTTP 503 until a non-empty Space secret is configured, and use constant-time comparison for supplied keys. The README explains the required secret and new standard-library unit tests cover missing, incorrect and matching keys.
7. **Stale GitHub Pages guide.** The guide still described the older manual-only deployment process and an outdated build payload. It now documents the current automatic Pages workflow, published artifact boundaries, browser smoke test, offline model test, and manual verification steps.
8. **Stale dependency lockfile.** At the audit baseline, `package.json` was version `0.2.0`, while `package-lock.json` still declared `0.1.0` and contained no dependency entries. The Pages workflow already runs `npm install`; its generated lockfile is now staged together with the generated voice-preview library. The next Pages deployment should persist the regenerated lockfile. This is not counted as verified until the resulting commit is inspected.

## Existing test and release evidence reviewed

- The November 5 CI workflow on the audit baseline passed.
- The November 5 GitHub Pages deployment passed.
- The November 5 Windows/macOS/Linux desktop installer workflow passed.
- The November 5 Android APK workflow passed.
- The November 5 live Pages Chromium workflow failed at the Playwright install step; Chromium installation and the actual browser smoke test were skipped. The failure was a test-dependency installation failure, not a demonstrated app runtime failure.
- The November 2 full 28-voice browser report records real synthesis and WAV validation for all 28 English voices, plus ZIP/WAV download checks. That is historical evidence for that build, not a fresh post-audit runtime test.

## Audit-branch verification

The first audit commits passed the repository CI workflow on GitHub-hosted Node 24 runners. The expanded preview-integrity and backend-authentication changes have been committed after that run and are awaiting their new CI result:

- JavaScript syntax validation
- Unit test suite
- Static Vite build
- Python backend source compilation and unit tests
- Deployment-output validation, including PWA assets and local ONNX Runtime assets

The live Pages and offline synthesis browser workflows are separate from the CI workflow. They have not yet completed against this expanded audit branch; their full browser/device verification remains outstanding.

## Remaining verification

- Confirm the Pages deployment completes after merge and inspect the generated `package-lock.json` commit.
- Confirm the live Chromium workflow passes through the full browser test, including all 28 preview records being persisted and restored.
- Rerun offline model generation with external network access blocked.
- Repeat manual browser/device checks on Windows, macOS, Linux and Android; performance and compatibility vary by browser and hardware.
- After the generated lockfile has been inspected, switch CI to `npm ci` so dependency installation verifies the committed lockfile rather than silently resolving a new dependency tree.
- Keep the legacy backend's `NEXTGEN_API_KEY` Space secret configured; inference endpoints intentionally remain disabled without it.

## Pull request

Audit changes are proposed in [PR #10](https://github.com/allinallsolutions2025-coder/nextgen-ai-voiceover/pull/10).
