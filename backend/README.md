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

Set the optional Space secret `NEXTGEN_API_KEY` to require an API key. Enter that same value in the app's Multilingual engine settings. For direct browser access, the Space must be public; do not put a Hugging Face account token in the website.
