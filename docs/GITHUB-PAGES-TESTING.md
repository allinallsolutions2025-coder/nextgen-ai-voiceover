# GitHub Pages testing

## Purpose

Use a stable HTTPS preview for browser testing instead of a running Codespaces port-forward. The source repository remains the private development source of truth.

## Important visibility and plan rules

- GitHub Pages on GitHub Free requires the source repository to be public.
- GitHub Pages can be enabled for a private repository on GitHub Pro, Team or Enterprise plans.
- A GitHub Pages site published from a private repository is still publicly accessible on the internet by default, unless the organization is on GitHub Enterprise Cloud and configures private site access control.
- Do not publish secrets, private user content, development notes, or internal documentation in the Pages artifact.

This project publishes only the static application build from `dist/`. The workflow deliberately excludes the repository's docs, GitHub workflows, tests and development scripts. Browser-side JavaScript is inherently visible to visitors; never put secrets or private credentials in it.

## Enable Pages once

1. Open the repository's **Settings**.
2. Open **Pages** under **Code and automation**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Save the setting if GitHub asks.

If GitHub reports that Pages is unavailable for this private repository, the account plan does not permit private-repository Pages. Do not change the repository to public without the owner's explicit decision. Options are:
- Upgrade the account to GitHub Pro while keeping the source repository private (the Pages site itself will still be public by default).
- Use a separate public preview repository containing only the frontend application files (the preview site is public).
- Keep the repository private and use a static host that supports private GitHub repositories.

## First deployment

The deployment workflow is manual initially so the site is not published until Pages settings and visibility have been reviewed.

1. Open the repository's **Actions** tab.
2. Select **Deploy preview to GitHub Pages**.
3. Select **Run workflow** on branch `main`.
4. Wait for the build and deployment jobs to complete.
5. Open the URL shown in the deployment job's environment.

Expected project URL when using the standard public project-site domain:

`https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/`

The actual URL shown by GitHub's deployment output is authoritative.

## Subsequent updates

After the first successful deployment, the workflow can be changed to deploy automatically on pushes to `main`, or remain manual during development. The CI workflow already runs independently on every push and pull request.

## Build contents

The build script creates `dist/` containing only:
- `index.html`
- `src/main.js`
- `src/lib/text.js`
- `src/styles.css`
- `.nojekyll`

The Kokoro model and JS runtime are still loaded from their configured external repositories/CDN at runtime. The first model load can therefore take longer than a subsequent load, depending on browser cache and network conditions.

## Testing on Pages

Use the same browser-runtime plan:
- Capture cold model load in a fresh browser profile / cleared site data.
- Capture warm reload without clearing storage.
- Record actual ONNX model and voice asset requests in DevTools Network.
- Record model-load, synthesis and total-generation timings from the UI.
- Verify individual WAV and ZIP downloads.
- Test Chrome first, then another browser/device.
