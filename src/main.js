import { getSpeechChunks, validateParagraphInput } from "./lib/text.js";
import { normalizeVoiceCatalog } from "./lib/voice-catalog.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const JSZIP_CDN = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const MAX_CHARACTERS = 20000;
const MAX_PARAGRAPHS = 100;

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  characterCount: document.querySelector("#characterCount"),
  paragraphCount: document.querySelector("#paragraphCount"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceHelp: document.querySelector("#voiceHelp"),
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
  zipDownload: document.querySelector("#zipDownload")
};

const state = {
  tts: null,
  ttsPromise: null,
  jsZipPromise: null,
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
      setStatus("Loading the Kokoro voice model into this browser. The first download may take several minutes.");
      const module = await import(KOKORO_CDN);
      if (!module.KokoroTTS) throw new Error("KokoroTTS was not exported by the selected Kokoro.js module.");
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

function populateVoiceSelector(tts) {
  const voices = normalizeVoiceCatalog(tts.voices);
  if (!voices.length) throw new Error("Kokoro loaded, but its supported voice catalogue was empty.");

  const groups = new Map();
  for (const voice of voices) {
    if (!groups.has(voice.languageLabel)) groups.set(voice.languageLabel, []);
    groups.get(voice.languageLabel).push(voice);
  }

  elements.voiceSelect.replaceChildren();
  for (const [languageLabel, groupVoices] of groups) {
    const group = document.createElement("optgroup");
    group.label = languageLabel;
    for (const voice of groupVoices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.gender + " (" + voice.id + ")";
      group.append(option);
    }
    elements.voiceSelect.append(group);
  }

  const preferred = voices.some((voice) => voice.id === "am_adam") ? "am_adam" : voices[0].id;
  elements.voiceSelect.value = preferred;
  elements.voiceSelect.disabled = false;
  elements.voiceHelp.textContent = voices.length + " voices · " + [...groups.keys()].join(" and ");
}

async function loadModel() {
  if (state.tts) {
    setBadge("Model ready", "ready");
    setStatus("Voice model is ready. Choose a voice and generate your script.", "good");
    return;
  }

  elements.loadButton.disabled = true;
  elements.generateButton.disabled = true;
  try {
    const tts = await getTTS();
    populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    setStatus("Voice model ready. Your script can now be generated in this browser.", "good");
    elements.generateButton.disabled = false;
    setProgress(100);
  } catch (error) {
    console.error(error);
    setBadge("Model load failed", "error");
    setStatus("Could not load the voice model: " + (error?.message || String(error)) + ". Check your connection and try again.", "error");
    setProgress(0);
  } finally {
    elements.loadButton.disabled = false;
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

async function generateSpeechWav(tts, text, options) {
  if (typeof tts.stream !== "function") {
    throw new Error("This Kokoro runtime does not support streaming audio generation.");
  }

  const speechChunks = getSpeechChunks(text);
  if (!speechChunks.length) throw new Error("No speech text was available to generate.");
  const streamInput = speechChunks.join("\\n");
  const waveChunks = [];
  let sampleRate = null;
  let totalSamples = 0;

  for await (const item of tts.stream(streamInput, { ...options, split_pattern: /\\n+/ })) {
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
  return createWavBlobFromSamples(combined, sampleRate);
}

function addAudioResult({ title, subtitle, filename, blob, kind, index }) {
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

  const format = document.createElement("span");
  format.className = "format-tag";
  format.textContent = "WAV";
  cardHeading.append(titleGroup, format);

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
  download.textContent = "↓ Download WAV";
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
  setProgress(1);

  const paragraphBlobs = [];
  const scriptForSpeech = validation.paragraphs.join("\n\n");

  try {
    const tts = await getTTS();
    if (elements.voiceSelect.options.length === 0) populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    const JSZip = await getJSZip();
    const zip = new JSZip();
    const voice = elements.voiceSelect.value || "am_adam";
    const speed = Number(elements.speedInput.value);
    const jobCount = validation.paragraphs.length + (validation.paragraphs.length > 1 ? 1 : 0);
    let completedJobs = 0;

    for (let index = 0; index < validation.paragraphs.length; index += 1) {
      const paragraphNumber = index + 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
      setStatus("Generating paragraph " + paragraphNumber + " of " + validation.paragraphs.length + "…");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const wavBlob = await generateSpeechWav(tts, validation.paragraphs[index], { voice, speed });
      paragraphBlobs.push(wavBlob);
      const filename = "paragraph_" + String(paragraphNumber).padStart(3, "0") + ".wav";
      zip.file(filename, wavBlob);
      addAudioResult({
        title: "Paragraph " + paragraphNumber,
        subtitle: validation.paragraphs[index].slice(0, 110) + (validation.paragraphs[index].length > 110 ? "…" : ""),
        filename,
        blob: wavBlob,
        kind: "paragraph",
        index: paragraphNumber
      });
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    let fullScriptBlob;
    if (paragraphBlobs.length === 1) {
      // A one-paragraph script is already the complete voiceover; reuse its audio.
      fullScriptBlob = paragraphBlobs[0];
    } else {
      setStatus("Generating one continuous voiceover for the complete script…");
      await new Promise((resolve) => setTimeout(resolve, 0));
      fullScriptBlob = await generateSpeechWav(tts, scriptForSpeech, { voice, speed });
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    zip.file("full_script.wav", fullScriptBlob);
    addAudioResult({
      title: "Full script voiceover",
      subtitle: validation.paragraphs.length + " paragraph(s) · " + voice + " · " + speed.toFixed(2) + "×",
      filename: "full_script.wav",
      blob: fullScriptBlob,
      kind: "full"
    });

    setStatus("Packaging the full-script and paragraph WAV files…");
    setProgress(96);
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
      "Full script voiceover + " + validation.paragraphs.length + " paragraph WAV file(s) · " + voice + " · " + speed.toFixed(2) + "×";
    setProgress(100);
    setStatus("Voiceover complete. Preview or download the full script, individual paragraphs, or the complete WAV bundle.", "good");
  } catch (error) {
    console.error(error);
    setProgress(0);
    setStatus("Generation failed: " + (error?.message || String(error)) + " Any completed paragraph WAV files remain available below.", "error");
    elements.resultsPanel.hidden = elements.audioResults.childElementCount === 0;
  } finally {
    elements.generateButton.disabled = !state.tts;
    elements.loadButton.disabled = false;
    elements.scriptInput.disabled = false;
    elements.voiceSelect.disabled = !state.tts;
    elements.speedInput.disabled = false;
  }
}

elements.scriptInput.addEventListener("input", () => {
  updateScriptCounts();
  clearResults();
});

elements.speedInput.addEventListener("input", () => {
  elements.speedValue.textContent = Number(elements.speedInput.value).toFixed(2) + "×";
});

elements.loadButton.addEventListener("click", loadModel);
elements.generateButton.addEventListener("click", generateAudio);

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
}