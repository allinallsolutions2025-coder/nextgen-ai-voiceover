// Browser-local English synthesis plus an optional connected multilingual Kokoro API.
import { getSpeechChunks, validateParagraphInput } from "./lib/text.js";
import { getCompleteVoiceCatalog, normalizeVoiceCatalog } from "./lib/voice-catalog.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const JSZIP_CDN = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const LAMEJS_CDN = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
const MAX_CHARACTERS = 20000;
const MAX_PARAGRAPHS = 100;

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  characterCount: document.querySelector("#characterCount"),
  paragraphCount: document.querySelector("#paragraphCount"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceHelp: document.querySelector("#voiceHelp"),
  outputFormat: document.querySelector("#outputFormat"),
  speedInput: document.querySelector("#speedInput"),
  speedValue: document.querySelector("#speedValue"),
  loadButton: document.querySelector("#loadButton"),
  generateButton: document.querySelector("#generateButton"),
  clearButton: document.querySelector("#clearButton"),
  progressTrack: document.querySelector("#progressTrack"),
  progressBar: document.querySelector("#progressBar"),
  statusMessage: document.querySelector("#statusMessage"),
  resultsPanel: document.querySelector("#resultsPanel"),
  resultsSummary: document.querySelector("#resultsSummary"),
  audioResults: document.querySelector("#audioResults"),
  zipDownload: document.querySelector("#zipDownload"),
  serverApiUrl: document.querySelector("#serverApiUrl"),
  serverApiKey: document.querySelector("#serverApiKey"),
  connectServerButton: document.querySelector("#connectServerButton"),
  serverConnectionStatus: document.querySelector("#serverConnectionStatus"),
  engineLabel: document.querySelector("#engineLabel")
};

const state = {
  tts: null,
  ttsPromise: null,
  TextSplitterStream: null,
  jsZipPromise: null,
  lamePromise: null,
  supportedVoiceIds: new Set(),
  serverVoiceIds: new Set(),
  serverApiBase: "",
  serverReady: false,
  objectUrls: []
};

function setStatus(message, kind = "normal") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = "status" + (kind === "good" ? " status-good" : kind === "error" ? " status-error" : "");
}

function setProgress(value) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  elements.progressBar.style.width = percentage + "%";
  elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(percentage)));
}

function setBadge(label, kind) {
  elements.modelBadge.textContent = label;
  elements.modelBadge.className = "badge badge-" + kind;
}

function revokeObjectUrls() {
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
}

function clearResults() {
  revokeObjectUrls();
  elements.audioResults.replaceChildren();
  elements.zipDownload.hidden = true;
  elements.zipDownload.removeAttribute("href");
  elements.resultsSummary.textContent = "Your audio files will appear here.";
  elements.resultsPanel.hidden = true;
}

function updateScriptCounts() {
  const value = elements.scriptInput.value;
  const validation = validateParagraphInput(value, MAX_CHARACTERS, MAX_PARAGRAPHS);
  const count = validation.paragraphs?.length || 0;
  elements.characterCount.textContent = value.length.toLocaleString() + " / " + MAX_CHARACTERS.toLocaleString() + " characters";
  elements.paragraphCount.textContent = count + (count === 1 ? " paragraph" : " paragraphs");
}

async function getTTS() {
  if (state.tts) return state.tts;
  if (!state.ttsPromise) {
    state.ttsPromise = (async () => {
      setBadge("Loading model", "loading");
      setStatus("Restoring the voice model from this browser’s saved cache. The first visit downloads it; later visits reuse the cached model files.");
      const module = await import(KOKORO_CDN);
      if (!module.KokoroTTS) throw new Error("KokoroTTS was not exported by the selected Kokoro.js module.");
      if (!module.TextSplitterStream) throw new Error("The selected Kokoro.js module does not expose TextSplitterStream.");
      // Transformers.js caches model and WASM files through the browser Cache API by default.
      // Keep both caches enabled explicitly when this Kokoro bundle exposes its env object.
      if (module.env) {
        module.env.useBrowserCache = true;
        module.env.useWasmCache = true;
      }
      state.TextSplitterStream = module.TextSplitterStream;
      return module.KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm"
      });
    })().then((tts) => {
      state.tts = tts;
      return tts;
    }).catch((error) => {
      state.ttsPromise = null;
      state.tts = null;
      throw error;
    });
  }
  return state.ttsPromise;
}

async function getLameJS() {
  if (window.lamejs?.Mp3Encoder) return window.lamejs;
  if (!state.lamePromise) {
    state.lamePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = LAMEJS_CDN;
      script.async = true;
      script.onload = () => window.lamejs?.Mp3Encoder
        ? resolve(window.lamejs)
        : reject(new Error("The MP3 encoder loaded without exposing lamejs.Mp3Encoder."));
      script.onerror = () => reject(new Error("Could not load the browser MP3 encoder. Check your connection and retry."));
      document.head.append(script);
    }).catch((error) => {
      state.lamePromise = null;
      throw error;
    });
  }
  return state.lamePromise;
}

async function getJSZip() {
  if (!state.jsZipPromise) {
    state.jsZipPromise = import(JSZIP_CDN)
      .then((module) => module.default || module)
      .catch((error) => {
        state.jsZipPromise = null;
        throw error;
      });
  }
  return state.jsZipPromise;
}

function populateVoiceSelector(tts = null) {
  const previousSelection = elements.voiceSelect.value;
  const voices = normalizeVoiceCatalog(tts?.voices ?? []);
  const completeCatalog = getCompleteVoiceCatalog(tts?.voices ?? []);
  state.supportedVoiceIds = new Set(voices.map((voice) => voice.id));
  const serverVoices = completeCatalog.filter((voice) =>
    !state.supportedVoiceIds.has(voice.id) && state.serverVoiceIds.has(voice.id)
  );
  const unavailableVoices = completeCatalog.filter((voice) =>
    !state.supportedVoiceIds.has(voice.id) && !state.serverVoiceIds.has(voice.id)
  );
  const groups = new Map();
  for (const voice of voices) {
    if (!groups.has(voice.languageLabel)) groups.set(voice.languageLabel, []);
    groups.get(voice.languageLabel).push(voice);
  }

  elements.voiceSelect.replaceChildren();
  for (const [languageLabel, groupVoices] of groups) {
    const group = document.createElement("optgroup");
    group.label = languageLabel + " — browser";
    for (const voice of groupVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.gender + " (" + voice.id + ")";
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }
  if (serverVoices.length) {
    const group = document.createElement("optgroup");
    group.label = "Multilingual voices — connected server (" + serverVoices.length + ")";
    for (const voice of serverVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.gender + " (" + voice.id + ") · server";
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }
  if (unavailableVoices.length) {
    const group = document.createElement("optgroup");
    group.label = "Multilingual voices — server required (" + unavailableVoices.length + ")";
    for (const voice of unavailableVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.disabled = true;
      option.textContent = voice.name + " · " + voice.gender + " (" + voice.id + ") — connect server";
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }

  const preserved = [...elements.voiceSelect.options].find((option) =>
    option.value === previousSelection && !option.disabled
  );
  const preferred = voices.some((voice) => voice.id === "af_heart") ? "af_heart" :
    (voices[0]?.id || serverVoices[0]?.id || "");
  elements.voiceSelect.value = preserved?.value || preferred;
  elements.voiceSelect.disabled = voices.length + serverVoices.length === 0;
  elements.voiceHelp.textContent =
    voices.length + " browser-ready voices · " +
    (state.serverReady ? serverVoices.length + " multilingual server voices connected" :
      unavailableVoices.length + " multilingual voices need a server") +
    (groups.size ? " · " + [...groups.keys()].join(" · ") : "");
}

function normalizeServerBaseUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Use an HTTP or HTTPS server URL.");
  return parsed.origin.replace(/\/+$/, "");
}

function serverHeaders() {
  const key = elements.serverApiKey.value.trim();
  return key ? { "X-API-Key": key } : {};
}

async function connectServer({ silent = false } = {}) {
  const rawUrl = elements.serverApiUrl.value.trim();
  if (!rawUrl) {
    state.serverReady = false;
    state.serverVoiceIds = new Set();
    state.serverApiBase = "";
    elements.serverConnectionStatus.textContent = "Not connected. Add your deployed Space URL to enable multilingual voices.";
    elements.engineLabel.textContent = "Local generation";
    try {
      localStorage.removeItem("nextgen-kokoro-server-url");
    } catch {}
    if (state.tts || elements.voiceSelect.options.length) populateVoiceSelector(state.tts);
    elements.generateButton.disabled = !state.tts;
    return false;
  }

  elements.connectServerButton.disabled = true;
  elements.connectServerButton.textContent = "Connecting…";
  elements.serverConnectionStatus.textContent = "Checking multilingual engine…";
  try {
    const baseUrl = normalizeServerBaseUrl(rawUrl);
    const headers = serverHeaders();
    const healthResponse = await fetch(baseUrl + "/health", { headers });
    if (!healthResponse.ok) throw new Error("Health check returned HTTP " + healthResponse.status + ".");
    const health = await healthResponse.json();
    if (health.status !== "ready") throw new Error("The server has not finished loading its Kokoro model.");
    const voicesResponse = await fetch(baseUrl + "/v1/voices", { headers });
    if (!voicesResponse.ok) throw new Error("Voice catalogue returned HTTP " + voicesResponse.status + ".");
    const payload = await voicesResponse.json();
    const knownIds = new Set(getCompleteVoiceCatalog().map((voice) => voice.id));
    const ids = (Array.isArray(payload.voices) ? payload.voices : [])
      .map((voice) => String(voice?.id || ""))
      .filter((id) => knownIds.has(id));
    state.serverVoiceIds = new Set(ids);
    const multilingualCount = ids.filter((id) => !state.supportedVoiceIds.has(id)).length;
    if (!multilingualCount) throw new Error("The server did not report any additional multilingual voices.");
    state.serverApiBase = baseUrl;
    state.serverReady = true;
    try {
      localStorage.setItem("nextgen-kokoro-server-url", baseUrl);
    } catch {}
    elements.serverConnectionStatus.textContent =
      "Connected · " + multilingualCount + " multilingual voices ready · " + (health.device || "server");
    elements.engineLabel.textContent = "Local + multilingual engine";
    populateVoiceSelector(state.tts);
    elements.generateButton.disabled = false;
    if (!silent) setStatus("Multilingual engine connected. Server-enabled voices can now be selected.", "good");
    return true;
  } catch (error) {
    state.serverReady = false;
    state.serverVoiceIds = new Set();
    state.serverApiBase = "";
    elements.serverConnectionStatus.textContent = "Connection failed: " + (error?.message || String(error));
    elements.engineLabel.textContent = "Local generation";
    if (state.tts || elements.voiceSelect.options.length) populateVoiceSelector(state.tts);
    elements.generateButton.disabled = !state.tts;
    if (!silent) setStatus("Could not connect to the multilingual engine: " + (error?.message || String(error)), "error");
    return false;
  } finally {
    elements.connectServerButton.disabled = false;
    elements.connectServerButton.textContent = "Connect / refresh";
  }
}
async function loadModel() {
  if (state.tts) {
    setBadge("Model ready", "ready");
    elements.loadButton.textContent = "Model ready";
    elements.loadButton.disabled = true;
    setStatus("Voice model is ready. Choose a voice and generate your script.", "good");
    return;
  }

  elements.loadButton.disabled = true;
  elements.generateButton.disabled = true;
  try {
    const tts = await getTTS();
    populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    setStatus(
      state.serverReady
        ? "Browser model ready. English voices run locally; multilingual voices run on your connected server."
        : "Browser model ready. English voices run locally; connect a multilingual server to enable other languages.",
      "good"
    );
    elements.generateButton.disabled = false;
    setProgress(100);
  } catch (error) {
    console.error(error);
    setBadge("Model load failed", "error");
    if (state.serverReady) {
      populateVoiceSelector(null);
      elements.generateButton.disabled = false;
      setStatus("The browser model could not load, but your connected multilingual server is available.", "good");
    } else {
      setStatus("Could not load the voice model: " + (error?.message || String(error)) + ". Check your connection and try again.", "error");
    }
    setProgress(0);
  } finally {
    const ready = Boolean(state.tts);
    elements.loadButton.textContent = ready ? "Model ready" : "Retry model load";
    elements.loadButton.disabled = ready;
  }
}

function createWavBlobFromSamples(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function generateSpeechBlob(tts, text, options, outputFormat) {
  if (typeof tts.stream !== "function") {
    throw new Error("This Kokoro runtime does not support streaming audio generation.");
  }

  const speechChunks = getSpeechChunks(text);
  if (!speechChunks.length) throw new Error("No speech text was available to generate.");
  if (!state.TextSplitterStream) throw new Error("Kokoro's streaming text splitter is unavailable.");
  const splitter = new state.TextSplitterStream();
  for (const chunk of speechChunks) splitter.push(chunk + "\n");
  splitter.close();

  const waveChunks = [];
  let sampleRate = null;
  let totalSamples = 0;

  for await (const item of tts.stream(splitter, options)) {
    const raw = item?.audio?.audio;
    const rate = Number(item?.audio?.sampling_rate);
    if (!raw || !ArrayBuffer.isView(raw) || !Number.isFinite(rate)) {
      throw new Error("The streaming voice engine returned an unsupported audio chunk.");
    }
    if (sampleRate !== null && sampleRate !== rate) {
      throw new Error("The voice engine changed sample rate during one voiceover.");
    }
    sampleRate = rate;
    const samples = raw instanceof Float32Array ? raw : Float32Array.from(raw);
    waveChunks.push(samples);
    totalSamples += samples.length;
  }

  if (!waveChunks.length || !sampleRate) {
    throw new Error("The voice engine returned no audio chunks.");
  }

  const pauseSamples = Math.round(sampleRate * 0.09);
  const totalLength = totalSamples + Math.max(0, waveChunks.length - 1) * pauseSamples;
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (let index = 0; index < waveChunks.length; index += 1) {
    if (index > 0) offset += pauseSamples;
    combined.set(waveChunks[index], offset);
    offset += waveChunks[index].length;
  }
  if (outputFormat === "mp3") return createMp3BlobFromSamples(combined, sampleRate);
  return createWavBlobFromSamples(combined, sampleRate);
}

async function generateRemoteSpeechBlob(text, voice, speed, outputFormat) {
  if (!state.serverReady || !state.serverApiBase) {
    throw new Error("The multilingual server is not connected. Connect or refresh it, then try again.");
  }
  const response = await fetch(state.serverApiBase + "/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...serverHeaders() },
    body: JSON.stringify({ input: text, voice, speed })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error("Multilingual server returned HTTP " + response.status + (detail ? ": " + detail : ""));
  }
  const wavBlob = await response.blob();
  if (wavBlob.size <= 44 || !wavBlob.type.includes("audio")) {
    throw new Error("The multilingual server returned an empty or unsupported audio file.");
  }
  if (outputFormat === "wav") return wavBlob;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser cannot convert server WAV audio to MP3.");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await wavBlob.arrayBuffer());
    return await createMp3BlobFromSamples(new Float32Array(decoded.getChannelData(0)), decoded.sampleRate);
  } finally {
    await context.close();
  }
}

async function generateSelectedSpeechBlob(tts, text, voice, speed, outputFormat) {
  if (state.serverVoiceIds.has(voice) && !state.supportedVoiceIds.has(voice)) {
    return generateRemoteSpeechBlob(text, voice, speed, outputFormat);
  }
  return generateSpeechBlob(tts, text, { voice, speed }, outputFormat);
}

async function createMp3BlobFromSamples(samples, sampleRate) {
  const lame = await getLameJS();
  const encoder = new lame.Mp3Encoder(1, sampleRate, 128);
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
  }

  const output = [];
  const frameSize = 1152;
  for (let offset = 0; offset < pcm.length; offset += frameSize) {
    const encoded = encoder.encodeBuffer(pcm.subarray(offset, Math.min(offset + frameSize, pcm.length)));
    if (encoded?.length) output.push(new Uint8Array(encoded));
  }
  const finalChunk = encoder.flush();
  if (finalChunk?.length) output.push(new Uint8Array(finalChunk));
  if (!output.length) throw new Error("The MP3 encoder returned an empty audio file.");
  return new Blob(output, { type: "audio/mpeg" });
}

function formatLabel(outputFormat) {
  return outputFormat === "mp3" ? "MP3" : "WAV";
}

function addAudioResult({ title, subtitle, filename, blob, kind, index, outputFormat }) {
  const url = URL.createObjectURL(blob);
  state.objectUrls.push(url);

  const card = document.createElement("article");
  card.className = "audio-card" + (kind === "full" ? " audio-card-full" : " audio-card-paragraph");
  if (kind === "full") {
    card.id = "fullScriptAudio";
    card.dataset.testid = "full-script-audio";
  } else {
    card.classList.add("paragraph-audio-card");
    card.dataset.paragraphIndex = String(index);
  }

  const cardHeading = document.createElement("div");
  cardHeading.className = "audio-card-heading";
  const titleGroup = document.createElement("div");
  const titleElement = document.createElement("strong");
  titleElement.className = "audio-card-title";
  titleElement.textContent = title;
  const subtitleElement = document.createElement("span");
  subtitleElement.className = "audio-card-subtitle";
  subtitleElement.textContent = subtitle;
  titleGroup.append(titleElement, subtitleElement);

  const formatTag = document.createElement("span");
  formatTag.className = "format-tag";
  formatTag.textContent = formatLabel(outputFormat);
  cardHeading.append(titleGroup, formatTag);

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.src = url;
  player.setAttribute("aria-label", "Preview " + title);
  player.className = "audio-player";

  const download = document.createElement("a");
  download.className = "audio-download";
  download.href = url;
  download.download = filename;
  download.textContent = "↓ Download " + formatLabel(outputFormat);
  if (kind === "full") download.id = "fullScriptDownload";
  else download.dataset.paragraphDownloadIndex = String(index);

  card.append(cardHeading, player, download);
  if (kind === "full") elements.audioResults.prepend(card);
  else elements.audioResults.append(card);
}

async function generateAudio() {
  const script = elements.scriptInput.value.trim();
  const validation = validateParagraphInput(script, MAX_CHARACTERS, MAX_PARAGRAPHS);
  if (!validation.valid) {
    setStatus(validation.message, "error");
    return;
  }

  clearResults();
  elements.generateButton.disabled = true;
  elements.loadButton.disabled = true;
  elements.scriptInput.disabled = true;
  elements.voiceSelect.disabled = true;
  elements.speedInput.disabled = true;
  elements.outputFormat.disabled = true;
  setProgress(1);

  const outputBlobs = [];
  const outputFormat = elements.outputFormat.value;
  const extension = outputFormat === "mp3" ? "mp3" : "wav";
  const scriptForSpeech = validation.paragraphs.join("\n\n");

  try {
    const voice = elements.voiceSelect.value || "af_heart";
    const useServer = state.serverReady && state.serverVoiceIds.has(voice) && !state.supportedVoiceIds.has(voice);
    let tts = state.tts;
    if (!useServer) {
      tts = tts || await getTTS();
      if (elements.voiceSelect.options.length === 0) populateVoiceSelector(tts);
      setBadge("Model ready", "ready");
      if (!state.supportedVoiceIds.has(voice)) {
        throw new Error("Voice " + voice + " is not supported by the browser runtime or connected multilingual server.");
      }
    }
    const speed = Number(elements.speedInput.value);
    if (outputFormat === "mp3") {
      setStatus("Preparing the MP3 encoder…");
      await getLameJS();
    }
    const jobCount = validation.paragraphs.length + (validation.paragraphs.length > 1 ? 1 : 0);
    let completedJobs = 0;

    for (let index = 0; index < validation.paragraphs.length; index += 1) {
      const paragraphNumber = index + 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
      setStatus("Generating paragraph " + paragraphNumber + " of " + validation.paragraphs.length +
        (useServer ? " on the multilingual server…" : "…"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const audioBlob = await generateSelectedSpeechBlob(tts, validation.paragraphs[index], voice, speed, outputFormat);
      outputBlobs.push(audioBlob);
      const filename = "paragraph_" + String(paragraphNumber).padStart(3, "0") + "." + extension;
      addAudioResult({
        title: "Paragraph " + paragraphNumber,
        subtitle: validation.paragraphs[index].slice(0, 110) + (validation.paragraphs[index].length > 110 ? "…" : ""),
        filename,
        blob: audioBlob,
        kind: "paragraph",
        index: paragraphNumber,
        outputFormat
      });
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    let fullScriptBlob;
    if (outputBlobs.length === 1) {
      // A one-paragraph script is already the complete voiceover; reuse its audio.
      fullScriptBlob = outputBlobs[0];
    } else {
      setStatus("Generating one continuous voiceover for the complete script…");
      await new Promise((resolve) => setTimeout(resolve, 0));
      fullScriptBlob = await generateSelectedSpeechBlob(tts, scriptForSpeech, voice, speed, outputFormat);
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    addAudioResult({
      title: "Full script voiceover",
      subtitle: validation.paragraphs.length + " paragraph(s) · " + voice + " · " + speed.toFixed(2) + "×",
      filename: "full_script." + extension,
      blob: fullScriptBlob,
      kind: "full",
      outputFormat
    });

    setStatus("Packaging the full-script and paragraph " + formatLabel(outputFormat) + " files…");
    setProgress(96);
    const JSZip = await getJSZip();
    const zip = new JSZip();
    for (let index = 0; index < outputBlobs.length; index += 1) {
      zip.file("paragraph_" + String(index + 1).padStart(3, "0") + "." + extension, outputBlobs[index]);
    }
    zip.file("full_script." + extension, fullScriptBlob);
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 3 }
    });
    const zipUrl = URL.createObjectURL(zipBlob);
    state.objectUrls.push(zipUrl);
    elements.zipDownload.href = zipUrl;
    elements.zipDownload.hidden = false;
    elements.resultsPanel.hidden = false;
    elements.resultsSummary.textContent =
      "Full script voiceover + " + validation.paragraphs.length + " paragraph " + formatLabel(outputFormat) + " file(s) · " + voice + " · " + speed.toFixed(2) + "×";
    setProgress(100);
    setStatus("Voiceover complete. Preview or download the full script, individual paragraphs, or the complete " + formatLabel(outputFormat) + " bundle.", "good");
  } catch (error) {
    console.error(error);
    setProgress(0);
    setStatus("Generation failed: " + (error?.message || String(error)) + " Any completed paragraph WAV files remain available below.", "error");
    elements.resultsPanel.hidden = elements.audioResults.childElementCount === 0;
  } finally {
    elements.generateButton.disabled = !state.tts && !state.serverReady;
    elements.loadButton.disabled = Boolean(state.tts);
    elements.scriptInput.disabled = false;
    elements.voiceSelect.disabled = !state.tts && !state.serverReady;
    elements.speedInput.disabled = false;
    elements.outputFormat.disabled = false;
  }
}

elements.scriptInput.addEventListener("input", () => {
  updateScriptCounts();
  clearResults();
});

elements.outputFormat.addEventListener("change", () => clearResults());

elements.speedInput.addEventListener("input", () => {
  elements.speedValue.textContent = Number(elements.speedInput.value).toFixed(2) + "×";
});

elements.loadButton.addEventListener("click", loadModel);
elements.generateButton.addEventListener("click", generateAudio);
elements.connectServerButton.addEventListener("click", () => void connectServer());

elements.clearButton.addEventListener("click", () => {
  elements.scriptInput.value = "";
  updateScriptCounts();
  clearResults();
  setStatus("Script cleared. The loaded voice model remains ready in this tab.");
  setProgress(0);
});

updateScriptCounts();

if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  setStatus("Open this app over HTTPS or localhost for browser model compatibility.", "error");
} else {
  // Ask the browser to protect this origin’s model cache from routine storage eviction.
  // This is best-effort; a declined request does not prevent browser caching.
  async function initializeStudio() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (error) {
      console.info("Persistent browser storage was not granted.", error);
    }
    elements.serverApiUrl.value = localStorage.getItem("nextgen-kokoro-server-url") || "";
    elements.serverApiKey.value = "";
    if (elements.serverApiUrl.value) await connectServer({ silent: true });
    await loadModel();
  }
  if (document.readyState === "complete") {
    void initializeStudio();
  } else {
    window.addEventListener("load", () => void initializeStudio(), { once: true });
  }
}
