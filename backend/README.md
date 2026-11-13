---
title: NextGen Kokoro Multilingual API
emoji: 🎙️
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# NextGen Kokoro Multilingual API

FastAPI inference service for the NextGen AI Voiceover GitHub Pages app. It uses the official Kokoro Python pipeline and verifies each language by synthesizing a short sample before advertising its voices.

- OpenAPI docs: `/docs`
- Health check: `/health`
- Voice catalogue: `/v1/voices`
- Speech endpoint: `POST /v1/audio/speech`

The container runs CPU-only PyTorch by default. Startup downloads the official Kokoro model and voice assets from Hugging Face. The first start and restarts can take time, especially on free CPU hardware.

Set the Space secret `NEXTGEN_API_KEY` before deploying or using the API. The protected `/health`, `/v1/voices`, and `/v1/audio/speech` endpoints fail closed with HTTP 503 until a non-empty secret is configured, and require the same value in the `X-API-Key` request header. For direct browser access, the Space must be public; do not put a Hugging Face account token in the website. Treat this legacy API as a separately operated service; the current browser/PWA app does not need it.
