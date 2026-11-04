// English-first browser-local voiceover studio.
import { getSpeechChunks, validateParagraphInput } from "./lib/text.js";
import { applyPronunciationRules, parsePronunciationRules } from "./lib/pronunciation.js";
import { normalizeVoiceCatalog } from "./lib/voice-catalog.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const JSZIP_CDN = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const LAMEJS_CDN = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
const MAX_CHARACTERS = 20000;
const MAX_PARAGRAPHS = 100;
const DRAFT_STORAGE_KEY = "nextgen-voiceover-draft-v1";
const PREVIEW_TEXT = "Hello! This is a short preview of the selected voice.";

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  characterCount: document.querySelector("#characterCount"),
  paragraphCount: document.querySelector("#paragraphCount"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceHelp: document.querySelector("#voiceHelp"),
  voiceFilterSelect: document.querySelector("#voiceFilterSelect"),
  pronunciationRules: document.querySelector("#pronunciationRules"),
  pronunciationStatus: document.querySelector("#pronunciationStatus"),
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
};

const state = {
  tts: null,
  ttsPromise: null,
  TextSplitterStream: null,
  jsZipPromise: null,
  lamePromise: null,
  supportedVoiceIds: new Set(),
  voiceCatalog: [],
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
  const voice = elements.voiceSelect.value;
  const voiceAvailable = Boolean(state.tts && voice && state.supportedVoiceIds.has(voice));
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

function renderVoiceSelector() {
  const previousSelection = elements.voiceSelect.value;
  const filter = elements.voiceFilterSelect.value;
  const filteredVoices = state.voiceCatalog.filter((voice) => {
    if (filter === "american") return voice.language === "en-us";
    if (filter === "british") return voice.language === "en-gb";
    if (filter === "female" || filter === "male") return voice.gender.toLowerCase() === filter;
    return true;
  });

  elements.voiceSelect.replaceChildren();
  const groups = new Map();
  for (const voice of filteredVoices) {
    if (!groups.has(voice.languageLabel)) groups.set(voice.languageLabel, []);
    groups.get(voice.languageLabel).push(voice);
  }
  for (const [languageLabel, groupVoices] of groups) {
    const group = document.createElement("optgroup");
    group.label = languageLabel;
    for (const voice of groupVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.gender;
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }
  if (!filteredVoices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.disabled = true;
    option.textContent = "No voices match this filter";
    elements.voiceSelect.append(option);
  }

  const preserved = filteredVoices.find((voice) => voice.id === previousSelection);
  const preferred = filteredVoices.find((voice) => voice.id === "af_heart")?.id || filteredVoices[0]?.id || "";
  elements.voiceSelect.value = preserved?.id || preferred;
  elements.voiceSelect.disabled = filteredVoices.length === 0;
  elements.voiceHelp.textContent = filteredVoices.length + " of 28 English voices shown · American and British accents · generated locally.";
  updatePreviewButtonState();
}

function populateVoiceSelector(tts = null) {
  state.voiceCatalog = normalizeVoiceCatalog(tts?.voices ?? []);
  state.supportedVoiceIds = new Set(state.voiceCatalog.map((voice) => voice.id));
  renderVoiceSelector();
}

function updatePronunciationStatus() {
  const parsed = parsePronunciationRules(elements.pronunciationRules.value);
  if (parsed.errors.length) {
    elements.pronunciationStatus.textContent = "Fix line(s): " + parsed.errors.join(", ");
    elements.pronunciationStatus.classList.add("pronunciation-status-error");
  } else {
    elements.pronunciationStatus.textContent = parsed.rules.length
      ? parsed.rules.length + " pronunciation rule(s) active · saved in this browser"
      : "No custom pronunciation rules";
    elements.pronunciationStatus.classList.remove("pronunciation-status-error");
  }
}

function savePronunciationRules() {
  const value = elements.pronunciationRules.value;
  try {
    if (value) localStorage.setItem("nextgen-voiceover-pronunciation-v1", value);
    else localStorage.removeItem("nextgen-voiceover-pronunciation-v1");
  } catch {
    // The feature still works for this session if local storage is unavailable.
  }
  updatePronunciationStatus();
}

function restorePronunciationRules() {
  try {
    elements.pronunciationRules.value = localStorage.getItem("nextgen-voiceover-pronunciation-v1") || "";
  } catch {
    elements.pronunciationRules.value = "";
  }
  updatePronunciationStatus();
}

function setSpeed(value) {
  const speed = Math.max(0.5, Math.min(2, Number(value) || 1));
  elements.speedInput.value = speed.toFixed(2);
  elements.speedValue.textContent = speed.toFixed(2) + "×";
  for (const button of document.querySelectorAll("[data-speed-preset]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.speedPreset) === speed));
  }
  clearResults();
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
    setStatus("Your 28 English voices are ready. Choose an American or British voice and preview it before generating.", "good");
    elements.generateButton.disabled = !state.voiceCatalog.length;
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
  // Let Kokoro detect punctuation and length boundaries itself. Appending a
  // newline after every chunk can trigger a TextSplitterStream hang when a
  // chunk ends with a URL or @mention in Kokoro.js 1.2.1.
  splitter.push(speechChunks.join(" "));
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

async function previewSelectedVoice() {
  if (state.isGenerating || state.isPreviewing) return;
  const selectedVoice = elements.voiceSelect.value;
  if (!selectedVoice || !state.supportedVoiceIds.has(selectedVoice)) return;
  const pronunciation = parsePronunciationRules(elements.pronunciationRules.value);
  if (pronunciation.errors.length) {
    setStatus("Fix pronunciation rules on line(s) " + pronunciation.errors.join(", ") + " before previewing.", "error");
    return;
  }
  const scriptSample = elements.scriptInput.value.trim().slice(0, 160) || PREVIEW_TEXT;
  const sample = applyPronunciationRules(scriptSample, pronunciation.rules);
  const controller = new AbortController();
  state.previewController = controller;
  state.isPreviewing = true;
  elements.previewVoiceButton.disabled = true;
  elements.previewVoiceButton.textContent = "Generating preview…";
  try {
    const tts = state.tts || await getTTS();
    const blob = await generateSelectedSpeechBlob(
      tts, sample, selectedVoice, Number(elements.speedInput.value), "wav", controller.signal
    );
    throwIfAborted(controller.signal);
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(blob);
    elements.voicePreviewAudio.src = state.previewObjectUrl;
    elements.voicePreviewAudio.hidden = false;
    try { await elements.voicePreviewAudio.play(); } catch {}
    setStatus("English voice preview ready: " + selectedVoice + ". Try another accent or voice to compare.", "good");
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
  const pronunciation = parsePronunciationRules(elements.pronunciationRules.value);
  if (pronunciation.errors.length) {
    setStatus("Fix pronunciation rules on line(s) " + pronunciation.errors.join(", ") + " before generating.", "error");
    updatePronunciationStatus();
    return;
  }
  const selectedVoice = elements.voiceSelect.value || "af_heart";
  const speed = Number(elements.speedInput.value);
  clearResults();

  const controller = new AbortController();
  state.activeAbortController = controller;
  state.isGenerating = true;
  elements.cancelButton.hidden = false;
  elements.cancelButton.disabled = false;
  elements.previewVoiceButton.disabled = true;
  elements.generateButton.disabled = true;
  elements.loadButton.disabled = true;
  elements.scriptInput.disabled = true;
  elements.voiceSelect.disabled = true;
  elements.voiceFilterSelect.disabled = true;
  elements.pronunciationRules.disabled = true;
  elements.speedInput.disabled = true;
  for (const button of document.querySelectorAll("[data-speed-preset]")) button.disabled = true;
  elements.outputFormat.disabled = true;
  setProgress(1);

  const outputBlobs = [];
  const outputFormat = elements.outputFormat.value;
  const extension = outputFormat === "mp3" ? "mp3" : "wav";
  const scriptForSpeech = validation.paragraphs.join("\n\n");
  let tts = state.tts;
  try {
    tts = tts || await getTTS();
    if (!state.voiceCatalog.length) populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    if (!state.supportedVoiceIds.has(selectedVoice)) {
      throw new Error("Choose one of the 28 available American or British English voices.");
    }
    if (outputFormat === "mp3") {
      setStatus("Preparing the MP3 encoder…");
      await getLameJS();
    }
    const renderSpeech = (speechText) => generateSelectedSpeechBlob(
      tts, applyPronunciationRules(speechText, pronunciation.rules),
      selectedVoice, speed, outputFormat, controller.signal
    );
    const jobCount = validation.paragraphs.length + (validation.paragraphs.length > 1 ? 1 : 0);
    let completedJobs = 0;

    for (let index = 0; index < validation.paragraphs.length; index += 1) {
      const paragraphNumber = index + 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
      setStatus("Generating paragraph " + paragraphNumber + " of " + validation.paragraphs.length + " locally with English Kokoro…");
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
      setStatus("Generating one continuous English voiceover for the complete script…");
      await new Promise((resolve) => setTimeout(resolve, 0));
      fullScriptBlob = await renderSpeech(scriptForSpeech);
      throwIfAborted(controller.signal);
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }
    const engineSubtitle = "Kokoro English · " + selectedVoice;
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
    setStatus("English voiceover complete. Preview or download the full script, individual paragraphs, or the complete " +
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
    elements.scriptInput.disabled = false;
    elements.voiceSelect.disabled = state.voiceCatalog.length === 0;
    elements.voiceFilterSelect.disabled = false;
    elements.pronunciationRules.disabled = false;
    elements.speedInput.disabled = false;
    for (const button of document.querySelectorAll("[data-speed-preset]")) button.disabled = false;
    elements.outputFormat.disabled = false;
    elements.loadButton.disabled = Boolean(state.tts);
    elements.generateButton.disabled = !state.tts || !state.voiceCatalog.length;
    updatePreviewButtonState();
  }
}

elements.scriptInput.addEventListener("input", () => {
  updateScriptCounts();
  saveDraftLocally();
  clearResults();
});

elements.voiceSelect.addEventListener("change", () => {
  clearResults();
  updatePreviewButtonState();
});
elements.voiceFilterSelect.addEventListener("change", () => {
  renderVoiceSelector();
  clearResults();
});
elements.pronunciationRules.addEventListener("input", () => {
  savePronunciationRules();
  clearResults();
});
elements.previewVoiceButton.addEventListener("click", previewSelectedVoice);
elements.cancelButton.addEventListener("click", () => {
  if (!state.activeAbortController) return;
  state.activeAbortController.abort();
  elements.cancelButton.disabled = true;
  setStatus("Stopping after the current speech chunk…");
});

elements.outputFormat.addEventListener("change", () => clearResults());

elements.speedInput.addEventListener("input", () => setSpeed(elements.speedInput.value));
for (const button of document.querySelectorAll("[data-speed-preset]")) {
  button.addEventListener("click", () => setSpeed(button.dataset.speedPreset));
}

elements.loadButton.addEventListener("click", loadModel);
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
restorePronunciationRules();
updateScriptCounts();
setSpeed(elements.speedInput.value);

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
