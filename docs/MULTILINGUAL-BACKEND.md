# Multilingual Kokoro backend

This service is separate from GitHub Pages because static Pages hosting cannot run a Python/PyTorch inference process.

## Deploy to Hugging Face Spaces

1. Create a **public Docker Space** in your Hugging Face account (the Space repository must exist before the deploy workflow runs).
2. In the GitHub repository settings, add an Actions secret named `HF_TOKEN` containing a Hugging Face write token that can push to that Space.
3. Open **Actions → Deploy multilingual Kokoro backend → Run workflow** and enter the Space repository as `username/space-name`.
4. When the Space finishes building and its health check is ready, use its public app origin, normally `https://username-space-name.hf.space`.
5. Open the NextGen AI Voiceover page, paste that origin into **Multilingual engine**, optionally enter the Space's `NEXTGEN_API_KEY` secret, then choose **Connect / refresh**.

The deploy workflow copies only the contents of `backend/` into the Space repository. It never copies GitHub credentials or model weights.

## Runtime behavior

- One shared Kokoro model is reused by language-specific `KPipeline` instances.
- At startup, each of the nine language pipelines must synthesize a sample before its voices can be advertised.
- Each voice file must also load successfully before that voice is returned by `/v1/voices`.
- Speech requests are limited to 20,000 characters and speeds from 0.50× to 2.00×.
- The API returns PCM WAV. The web app converts it to MP3 locally when MP3 is selected.
- Set `NEXTGEN_API_KEY` as a Space secret to protect the API. Leave it unset for an unauthenticated public demo.
- CORS is restricted to the GitHub Pages origin and localhost development ports used by this app.

## Important

This repository contains the deployable backend implementation, but it is not live until a Hugging Face Space is created and the deployment workflow is run with a valid `HF_TOKEN`. Do not enable the multilingual voices on the website until the Space reports ready and passes the connection/synthesis check.
