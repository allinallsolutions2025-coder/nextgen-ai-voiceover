// Keep the Pages smoke test aligned with the currently deployed studio UI.
// Browser-local English synthesis plus an optional connected multilingual Kokoro API.
import { getSpeechChunks, validateParagraphInput } from "./lib/text.js";
import { getCompleteVoiceCatalog, normalizeVoiceCatalog } from "./lib/voice-catalog.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const JSZIP_CDN = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const LAMEJS_CDN = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
const ONNXRUNTIME_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.min.js";
const ONNXRUNTIME_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
const SUPERTONIC_MODEL_BASE = "https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46";
const SUPERTONIC_ONNX_BASE = SUPERTONIC_MODEL_BASE + "/onnx";
const SUPERTONIC_STYLE_BASE = SUPERTONIC_MODEL_BASE + "/voice_styles";
const MAX_CHARACTERS = 20000;
const MAX_PARAGRAPHS = 100;
const DRAFT_STORAGE_KEY = "nextgen-voiceover-draft-v1";
const PREVIEW_TEXT = "Hello! This is a short preview of the selected voice.";

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  characterCount: document.querySelector("#characterCount"),
  paragraphCount: document.querySelector("#paragraphCount"),
  speechEngineSelect: document.querySelector("#speechEngineSelect"),
  kokoroEngineControls: document.querySelector("#kokoroEngineControls"),
  supertonicEngineControls: document.querySelector("#supertonicEngineControls"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceHelp: document.querySelector("#voiceHelp"),
  supertonicLanguageSelect: document.querySelector("#supertonicLanguageSelect"),
  supertonicVoiceStyleSelect: document.querySelector("#supertonicVoiceStyleSelect"),
  acceptSupertonicLicense: document.querySelector("#acceptSupertonicLicense"),
  loadSupertonicButton: document.querySelector("#loadSupertonicButton"),
  supertonicModelStatus: document.querySelector("#supertonicModelStatus"),
  previewVoiceButton: document.querySelector("#previewVoiceButton"),
  voicePreviewAudio: document.querySelector("#voicePreviewAudio"),
  draftStatus: document.querySelector("#draftStatus"),
  outputFormat: document.querySelector("#outputFormat"),
  speedInput: document.querySelector("#speedInput"),
  speedValue: document.querySelector("#speedValue"),
  loadButton: document.querySelector("#loadButton"),
  generateButton: document.querySelector("#generateButton"),
  cancelButton: document.querySelector("#cancelButton"),
  clearButton: document.querySelector("#clearButton"),
  progressTrack: document.querySelector("#progressTrack"),
  progressBar: document.querySelector("#progressBar"),
  statusMessage: document.querySelector("#statusMessage"),
  resultsPanel: document.querySelector("#resultsPanel"),
  resultsSummary: document.querySelector("#resultsSummary"),
  audioResults: document.querySelector("#audioResults"),
  zipDownload: document.querySelector("#zipDownload"),
  engineLabel: document.querySelector("#engineLabel")
};

const state = {
  tts: null,
  ttsPromise: null,
  TextSplitterStream: null,
  jsZipPromise: null,
  lamePromise: null,
  supportedVoiceIds: new Set(),
  supertonicTts: null,
  supertonicHelpers: null,
  supertonicLoadPromise: null,
  supertonicStylePromises: new Map(),
  supertonicStyles: new Map(),
  supertonicStyle: null,
  supertonicStyleName: "",
  onnxRuntimePromise: null,
  objectUrls: [],
  previewObjectUrl: null,
  previewController: null,
  activeAbortController: null,
  isGenerating: false,
  isPreviewing: false
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

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Generation stopped by the user.");
    error.name = "AbortError";
    throw error;
  }
}

function setDraftStatus(message, kind = "normal") {
  elements.draftStatus.textContent = message;
  elements.draftStatus.className = "draft-status" + (kind === "error" ? " draft-status-error" : "");
}

function saveDraftLocally() {
  const value = elements.scriptInput.value;
  try {
    if (value) localStorage.setItem(DRAFT_STORAGE_KEY, value);
    else localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftStatus(value ? "Draft saved on this device" : "Draft cleared from this device");
  } catch {
    setDraftStatus("Local draft saving is unavailable", "error");
  }
}

function restoreDraftLocally() {
  try {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft && !elements.scriptInput.value) {
      elements.scriptInput.value = savedDraft;
      setDraftStatus("Draft restored from this device");
    }
  } catch {
    setDraftStatus("Local draft storage is unavailable", "error");
  }
}

function updatePreviewButtonState() {
  const supertonicSelected = elements.speechEngineSelect.value === "supertonic";
  const voice = elements.voiceSelect.value;
  const voiceAvailable = supertonicSelected
    ? Boolean(state.supertonicTts && elements.supertonicLanguageSelect.value && elements.scriptInput.value.trim())
    : Boolean(voice) && state.supportedVoiceIds.has(voice);
  elements.previewVoiceButton.disabled = !voiceAvailable || state.isGenerating || state.isPreviewing;
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
  const browserVoices = normalizeVoiceCatalog(tts?.voices ?? []);
  const completeCatalog = getCompleteVoiceCatalog(tts?.voices ?? []);
  state.supportedVoiceIds = new Set(browserVoices.map((voice) => voice.id));
  const unavailableVoices = completeCatalog.filter((voice) => !state.supportedVoiceIds.has(voice.id));

  elements.voiceSelect.replaceChildren();
  const groups = new Map();
  for (const voice of browserVoices) {
    if (!groups.has(voice.languageLabel)) groups.set(voice.languageLabel, []);
    groups.get(voice.languageLabel).push(voice);
  }
  for (const [languageLabel, groupVoices] of groups) {
    const group = document.createElement("optgroup");
    group.label = languageLabel + " — Kokoro · browser WASM";
    for (const voice of groupVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.gender + " (" + voice.id + ")";
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }
  const preserved = [...elements.voiceSelect.options].find((option) => option.value === previousSelection);
  const preferred = browserVoices.some((voice) => voice.id === "af_heart") ? "af_heart" : (browserVoices[0]?.id || "");
  elements.voiceSelect.value = preserved?.value || preferred;
  elements.voiceSelect.disabled = browserVoices.length === 0;
  elements.voiceHelp.textContent =
    browserVoices.length + " English Kokoro voices · American and British English only. The 26 non-English Kokoro entries have been removed; use Supertonic 3 for separate local multilingual speech.";
  updatePreviewButtonState();
}

let onnxRuntimeScriptPromise = null;

async function getOnnxRuntime() {
  if (globalThis.ort?.InferenceSession && globalThis.ort?.Tensor) return globalThis.ort;
  if (!onnxRuntimeScriptPromise) {
    onnxRuntimeScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = ONNXRUNTIME_CDN;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        const ort = globalThis.ort;
        if (ort?.InferenceSession && ort?.Tensor) resolve(ort);
        else reject(new Error("ONNX Runtime Web loaded without exposing its browser API."));
      };
      script.onerror = () => reject(new Error("Could not load ONNX Runtime Web from jsDelivr."));
      document.head.appendChild(script);
    }).catch((error) => {
      onnxRuntimeScriptPromise = null;
      throw error;
    });
  }
  return onnxRuntimeScriptPromise;
}

async function loadSupertonicHelpers() {
  if (state.supertonicHelpers) return state.supertonicHelpers;
  const ort = await getOnnxRuntime();
  ort.env.wasm.wasmPaths = ONNXRUNTIME_WASM_BASE;
  ort.env.wasm.numThreads = 1;
  state.supertonicHelpers = await import("./lib/supertonic.js");
  return state.supertonicHelpers;
}

async function loadSupertonicVoiceStyle(styleName = elements.supertonicVoiceStyleSelect.value) {
  if (!state.supertonicTts) throw new Error("Load Supertonic 3 before choosing a voice style.");
  const name = String(styleName || "M1").toUpperCase();
  if (!/^[MF][1-5]$/.test(name)) throw new Error("Choose one of the ten Supertonic preset styles.");
  if (state.supertonicStyles.has(name)) {
    state.supertonicStyle = state.supertonicStyles.get(name);
    state.supertonicStyleName = name;
    return state.supertonicStyle;
  }
  if (state.supertonicStylePromises.has(name)) return state.supertonicStylePromises.get(name);
  const promise = (async () => {
    const { loadVoiceStyle } = await loadSupertonicHelpers();
    const style = await loadVoiceStyle([SUPERTONIC_STYLE_BASE + "/" + name + ".json"], true);
    state.supertonicStyles.set(name, style);
    state.supertonicStyle = style;
    state.supertonicStyleName = name;
    return style;
  })().finally(() => state.supertonicStylePromises.delete(name));
  state.supertonicStylePromises.set(name, promise);
  return promise;
}

async function loadSupertonicModel() {
  if (!elements.acceptSupertonicLicense.checked) {
    elements.supertonicModelStatus.textContent = "Please confirm the OpenRAIL-M usage restrictions before loading this model.";
    setStatus("Supertonic 3 requires acknowledgement of its model-use restrictions.", "error");
    return;
  }
  if (state.supertonicTts) {
    elements.supertonicModelStatus.textContent = "Ready · Supertonic 3 is already loaded on this device.";
    return state.supertonicTts;
  }
  if (state.supertonicLoadPromise) return state.supertonicLoadPromise;
  elements.loadSupertonicButton.disabled = true;
  elements.loadSupertonicButton.textContent = "Loading Supertonic 3…";
  elements.supertonicModelStatus.textContent =
    "Downloading about 398 MB of ONNX weights from Hugging Face, then initializing them locally. This is a first-use download.";
  setStatus("Loading Supertonic 3 multilingual model in your browser. No speech server is used…");
  state.supertonicLoadPromise = (async () => {
    const { loadTextToSpeech } = await loadSupertonicHelpers();
    const result = await loadTextToSpeech(SUPERTONIC_ONNX_BASE, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    }, (modelName, current, total) => {
      elements.supertonicModelStatus.textContent =
        "Loading ONNX model " + current + " of " + total + ": " + modelName + ". Downloads run directly in this browser.";
      setStatus("Loading Supertonic 3 · " + current + "/" + total + " · " + modelName + "…");
    });
    state.supertonicTts = result.textToSpeech;
    await loadSupertonicVoiceStyle(elements.supertonicVoiceStyleSelect.value || "M1");
    return result.textToSpeech;
  })().then((tts) => {
    elements.loadSupertonicButton.textContent = "Supertonic 3 loaded";
    elements.supertonicModelStatus.textContent =
      "Ready · 31 languages · 10 preset voice styles · ONNX WASM on this device. Your script stays in this browser.";
    elements.engineLabel.textContent = "Supertonic 3 · on-device";
    elements.speechEngineSelect.value = "supertonic";
    setSpeechEngine();
    setStatus("Supertonic 3 is ready. Choose a language and preset voice style to generate speech locally.", "good");
    return tts;
  }).catch((error) => {
    state.supertonicLoadPromise = null;
    state.supertonicTts = null;
    state.supertonicStyles.clear();
    state.supertonicStyle = null;
    state.supertonicStyleName = "";
    elements.loadSupertonicButton.disabled = false;
    elements.loadSupertonicButton.textContent = "Retry Supertonic model load";
    elements.supertonicModelStatus.textContent = "Could not load Supertonic 3: " + (error?.message || String(error));
    setStatus("Supertonic 3 could not initialize: " + (error?.message || String(error)), "error");
    throw error;
  }).finally(() => {
    elements.loadSupertonicButton.disabled = Boolean(state.supertonicTts);
  });
  return state.supertonicLoadPromise;
}

function setSpeechEngine() {
  const supertonicSelected = elements.speechEngineSelect.value === "supertonic";
  elements.kokoroEngineControls.hidden = supertonicSelected;
  elements.supertonicEngineControls.hidden = !supertonicSelected;
  elements.loadButton.hidden = supertonicSelected;
  elements.voiceSelect.disabled = supertonicSelected || !state.tts;
  if (supertonicSelected) {
    elements.engineLabel.textContent = state.supertonicTts ? "Supertonic 3 · on-device" : "Supertonic 3 · not loaded";
    elements.generateButton.disabled = !state.supertonicTts;
    if (!state.supertonicTts) setStatus("Load the Supertonic 3 model to enable 31-language local speech.");
  } else {
    elements.engineLabel.textContent = "Kokoro · English · local";
    elements.generateButton.disabled = !state.tts;
  }
  updatePreviewButtonState();
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
    setStatus("The 28 English Kokoro voices are ready locally. Choose Supertonic 3 for separate on-device multilingual speech.", "good");
    elements.generateButton.disabled = false;
    setProgress(100);
  } catch (error) {
    console.error(error);
    setBadge("Model load failed", "error");
    setStatus("Could not load the English Kokoro model: " + (error?.message || String(error)) + ". Check your connection and try again.", "error");
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

async function generateSpeechBlob(tts, text, options, outputFormat, signal) {
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
    throwIfAborted(signal);
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

  throwIfAborted(signal);
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


async function generateSelectedSpeechBlob(tts, text, voice, speed, outputFormat, signal) {
  throwIfAborted(signal);
  return generateSpeechBlob(tts, text, { voice, speed }, outputFormat, signal);
}

async function generateSupertonicSpeechBlob(text, language, styleName, speed, outputFormat, signal) {
  if (!state.supertonicTts) throw new Error("Load Supertonic 3 before generating multilingual speech.");
  const style = await loadSupertonicVoiceStyle(styleName);
  throwIfAborted(signal);
  const result = await state.supertonicTts.call(
    text, language, style, 8, speed, 0.3,
    (step, total) => {
      throwIfAborted(signal);
      setStatus("Supertonic 3 · denoising step " + step + " of " + total + " · " + language.toUpperCase() + "…");
    }
  );
  throwIfAborted(signal);
  const sampleRate = Number(state.supertonicTts.sampleRate);
  const duration = Number(result.duration?.[0] || 0);
  const sampleCount = Math.max(0, Math.floor(sampleRate * duration));
  const samples = Float32Array.from((result.wav || []).slice(0, sampleCount));
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Supertonic 3 returned an empty or invalid audio result.");
  }
  if (outputFormat === "mp3") return createMp3BlobFromSamples(samples, sampleRate);
  return createWavBlobFromSamples(samples, sampleRate);
}

async function previewSelectedVoice() {
  if (state.isGenerating || state.isPreviewing) return;
  const supertonicSelected = elements.speechEngineSelect.value === "supertonic";
  const sample = elements.scriptInput.value.trim().slice(0, 160);
  if (supertonicSelected && !sample) {
    setStatus("Enter a short sample in the selected language before previewing a Supertonic style.", "error");
    return;
  }
  const voice = supertonicSelected ? elements.supertonicVoiceStyleSelect.value : elements.voiceSelect.value;
  if (!voice) return;
  const controller = new AbortController();
  state.previewController = controller;
  state.isPreviewing = true;
  elements.previewVoiceButton.disabled = true;
  elements.previewVoiceButton.textContent = "Generating preview…";
  try {
    const tts = supertonicSelected ? null : (state.tts || await getTTS());
    const blob = supertonicSelected
      ? await generateSupertonicSpeechBlob(sample, elements.supertonicLanguageSelect.value, voice,
        Number(elements.speedInput.value), "wav", controller.signal)
      : await generateSelectedSpeechBlob(tts, PREVIEW_TEXT, voice,
        Number(elements.speedInput.value), "wav", controller.signal);
    throwIfAborted(controller.signal);
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(blob);
    elements.voicePreviewAudio.src = state.previewObjectUrl;
    elements.voicePreviewAudio.hidden = false;
    try { await elements.voicePreviewAudio.play(); } catch {}
    setStatus(
      supertonicSelected
        ? "Supertonic preview ready: " + voice + " · " + elements.supertonicLanguageSelect.value.toUpperCase() + "."
        : "Voice preview ready: " + voice + ". Try another voice to compare.",
      "good"
    );
  } catch (error) {
    if (error?.name === "AbortError") setStatus("Voice preview stopped.", "normal");
    else {
      console.error(error);
      setStatus("Could not preview this voice: " + (error?.message || String(error)), "error");
    }
  } finally {
    state.isPreviewing = false;
    state.previewController = null;
    elements.previewVoiceButton.textContent = "Preview voice";
    updatePreviewButtonState();
  }
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
  const supertonicSelected = elements.speechEngineSelect.value === "supertonic";
  const selectedVoice = supertonicSelected ? elements.supertonicVoiceStyleSelect.value : (elements.voiceSelect.value || "af_heart");
  const speed = Number(elements.speedInput.value);
  const language = elements.supertonicLanguageSelect.value;
  if (supertonicSelected && !state.supertonicTts) {
    setStatus("Load Supertonic 3 before generating multilingual speech.", "error");
    return;
  }

  clearResults();
  const controller = new AbortController();
  state.activeAbortController = controller;
  state.isGenerating = true;
  elements.cancelButton.hidden = false;
  elements.cancelButton.disabled = false;
  elements.previewVoiceButton.disabled = true;
  elements.generateButton.disabled = true;
  elements.loadButton.disabled = true;
  elements.speechEngineSelect.disabled = true;
  elements.scriptInput.disabled = true;
  elements.voiceSelect.disabled = true;
  elements.supertonicLanguageSelect.disabled = true;
  elements.supertonicVoiceStyleSelect.disabled = true;
  elements.loadSupertonicButton.disabled = true;
  elements.speedInput.disabled = true;
  elements.outputFormat.disabled = true;
  setProgress(1);

  const outputBlobs = [];
  const outputFormat = elements.outputFormat.value;
  const extension = outputFormat === "mp3" ? "mp3" : "wav";
  const scriptForSpeech = validation.paragraphs.join("\n\n");
  let tts = state.tts;
  try {
    if (supertonicSelected) {
      await loadSupertonicVoiceStyle(selectedVoice);
    } else {
      tts = tts || await getTTS();
      if (elements.voiceSelect.options.length === 0) populateVoiceSelector(tts);
      setBadge("Model ready", "ready");
      if (!state.supportedVoiceIds.has(selectedVoice)) {
        throw new Error("Kokoro voice " + selectedVoice + " is not in the 28 supported English voices.");
      }
    }
    if (outputFormat === "mp3") {
      setStatus("Preparing the MP3 encoder…");
      await getLameJS();
    }
    const renderSpeech = (speechText) => supertonicSelected
      ? generateSupertonicSpeechBlob(speechText, language, selectedVoice, speed, outputFormat, controller.signal)
      : generateSelectedSpeechBlob(tts, speechText, selectedVoice, speed, outputFormat, controller.signal);
    const jobCount = validation.paragraphs.length + (validation.paragraphs.length > 1 ? 1 : 0);
    let completedJobs = 0;

    for (let index = 0; index < validation.paragraphs.length; index += 1) {
      const paragraphNumber = index + 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
      setStatus("Generating paragraph " + paragraphNumber + " of " + validation.paragraphs.length +
        (supertonicSelected ? " locally with Supertonic 3 · " + language.toUpperCase() + "…" : " locally with Kokoro…"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const audioBlob = await renderSpeech(validation.paragraphs[index]);
      throwIfAborted(controller.signal);
      outputBlobs.push(audioBlob);
      const filename = "paragraph_" + String(paragraphNumber).padStart(3, "0") + "." + extension;
      addAudioResult({
        title: "Paragraph " + paragraphNumber,
        subtitle: validation.paragraphs[index].slice(0, 110) + (validation.paragraphs[index].length > 110 ? "…" : ""),
        filename, blob: audioBlob, kind: "paragraph", index: paragraphNumber, outputFormat
      });
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    let fullScriptBlob;
    if (outputBlobs.length === 1) {
      fullScriptBlob = outputBlobs[0];
    } else {
      setStatus("Generating one continuous voiceover for the complete script…");
      await new Promise((resolve) => setTimeout(resolve, 0));
      fullScriptBlob = await renderSpeech(scriptForSpeech);
      throwIfAborted(controller.signal);
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }
    const engineSubtitle = supertonicSelected
      ? "Supertonic 3 · " + selectedVoice + " · " + language.toUpperCase()
      : "Kokoro · " + selectedVoice;
    addAudioResult({
      title: "Full script voiceover",
      subtitle: validation.paragraphs.length + " paragraph(s) · " + engineSubtitle + " · " + speed.toFixed(2) + "×",
      filename: "full_script." + extension, blob: fullScriptBlob, kind: "full", outputFormat
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
      type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 }
    });
    const zipUrl = URL.createObjectURL(zipBlob);
    state.objectUrls.push(zipUrl);
    elements.zipDownload.href = zipUrl;
    elements.zipDownload.hidden = false;
    elements.resultsPanel.hidden = false;
    elements.resultsSummary.textContent =
      "Full script voiceover + " + validation.paragraphs.length + " paragraph " +
      formatLabel(outputFormat) + " file(s) · " + engineSubtitle + " · " + speed.toFixed(2) + "×";
    setProgress(100);
    setStatus("Voiceover complete. Preview or download the full script, individual paragraphs, or the complete " +
      formatLabel(outputFormat) + " bundle.", "good");
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      setStatus("Generation stopped. Completed paragraph audio remains available below.", "normal");
    } else {
      console.error(error);
      setProgress(0);
      setStatus("Generation failed: " + (error?.message || String(error)) +
        " Any completed paragraph audio remains available below.", "error");
    }
    elements.resultsPanel.hidden = elements.audioResults.childElementCount === 0;
  } finally {
    state.isGenerating = false;
    state.activeAbortController = null;
    elements.cancelButton.hidden = true;
    elements.cancelButton.disabled = true;
    elements.speechEngineSelect.disabled = false;
    elements.scriptInput.disabled = false;
    elements.speedInput.disabled = false;
    elements.outputFormat.disabled = false;
    elements.supertonicLanguageSelect.disabled = false;
    elements.supertonicVoiceStyleSelect.disabled = false;
    elements.loadSupertonicButton.disabled = Boolean(state.supertonicTts);
    elements.loadButton.disabled = Boolean(state.tts);
    setSpeechEngine();
    updatePreviewButtonState();
  }
}

elements.scriptInput.addEventListener("input", () => {
  updateScriptCounts();
  saveDraftLocally();
  clearResults();
});

elements.voiceSelect.addEventListener("change", updatePreviewButtonState);
elements.previewVoiceButton.addEventListener("click", previewSelectedVoice);
elements.cancelButton.addEventListener("click", () => {
  if (!state.activeAbortController) return;
  state.activeAbortController.abort();
  elements.cancelButton.disabled = true;
  setStatus("Stopping after the current speech chunk…");
});

elements.outputFormat.addEventListener("change", () => clearResults());

elements.speedInput.addEventListener("input", () => {
  elements.speedValue.textContent = Number(elements.speedInput.value).toFixed(2) + "×";
});

elements.loadButton.addEventListener("click", loadModel);
elements.loadSupertonicButton.addEventListener("click", () => void loadSupertonicModel().catch(console.error));
elements.speechEngineSelect.addEventListener("change", setSpeechEngine);
elements.supertonicVoiceStyleSelect.addEventListener("change", async () => {
  if (!state.supertonicTts) {
    updatePreviewButtonState();
    return;
  }
  elements.previewVoiceButton.disabled = true;
  elements.supertonicModelStatus.textContent = "Loading preset voice style " + elements.supertonicVoiceStyleSelect.value + "…";
  try {
    await loadSupertonicVoiceStyle(elements.supertonicVoiceStyleSelect.value);
    elements.supertonicModelStatus.textContent =
      "Ready · Supertonic 3 · " + elements.supertonicVoiceStyleSelect.value + " · 31 languages · local ONNX WASM.";
    setStatus("Supertonic voice style ready: " + elements.supertonicVoiceStyleSelect.value + ".", "good");
  } catch (error) {
    console.error(error);
    setStatus("Could not load this Supertonic preset: " + (error?.message || String(error)), "error");
  } finally {
    updatePreviewButtonState();
  }
});
elements.generateButton.addEventListener("click", generateAudio);

elements.clearButton.addEventListener("click", () => {
  elements.scriptInput.value = "";
  saveDraftLocally();
  updateScriptCounts();
  clearResults();
  setStatus("Script cleared. The loaded voice model remains ready in this tab.");
  setProgress(0);
});

restoreDraftLocally();
updateScriptCounts();
setSpeechEngine();

window.addEventListener("beforeunload", () => {
  revokeObjectUrls();
  if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
});

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
    await loadModel();
  }
  if (document.readyState === "complete") {
    void initializeStudio();
  } else {
    window.addEventListener("load", () => void initializeStudio(), { once: true });
  }
}
