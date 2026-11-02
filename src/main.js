import { validateInput } from "./lib/text.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const JSZIP_CDN = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const MAX_CHARACTERS = 20000;
const MAX_SEGMENTS = 150;

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  characterCount: document.querySelector("#characterCount"),
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
  elements.resultsSummary.textContent = "Your WAV files will appear here.";
  elements.resultsPanel.hidden = true;
}

async function getTTS() {
  if (state.tts) return state.tts;
  if (!state.ttsPromise) {
    state.ttsPromise = (async () => {
      setBadge("Loading model", "loading");
      setStatus("Loading Kokoro q8 model in WASM mode. The first download may take several minutes.");
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

function normalizeVoices(rawVoices) {
  const source = rawVoices && typeof rawVoices === "object" && !Array.isArray(rawVoices) && rawVoices.voices
    ? rawVoices.voices
    : rawVoices;

  let entries = [];
  if (Array.isArray(source)) {
    entries = source.map((item) => {
      if (typeof item === "string") return item;
      return item?.id ?? item?.name ?? item?.voice ?? "";
    });
  } else if (source && typeof source === "object") {
    entries = Object.keys(source);
  }

  return [...new Set(entries.map((item) => String(item).trim()).filter(Boolean))].sort();
}

async function populateVoiceSelector(tts) {
  let voices = [];
  if (typeof tts.list_voices === "function") {
    voices = normalizeVoices(await tts.list_voices());
  }

  if (!voices.length) {
    elements.voiceHelp.textContent = "Voice listing was unavailable; using the known Adam voice for this test.";
    voices = ["am_adam"];
  } else {
    elements.voiceHelp.textContent = voices.length + " voices reported by the loaded runtime.";
  }

  const preferred = voices.includes("am_adam") ? "am_adam" : voices[0];
  elements.voiceSelect.replaceChildren();

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = voice;
    elements.voiceSelect.append(option);
  }

  elements.voiceSelect.value = preferred;
  elements.voiceSelect.disabled = false;
}

async function loadModel() {
  elements.loadButton.disabled = true;
  elements.generateButton.disabled = true;

  try {
    const tts = await getTTS();
    await populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    setStatus("Kokoro is loaded in this browser. Choose a voice and generate a short test script.", "good");
    elements.generateButton.disabled = false;
    setProgress(100);
  } catch (error) {
    console.error(error);
    setBadge("Model load failed", "error");
    setStatus("Could not load Kokoro: " + (error?.message || String(error)) + ". Check the connection and refresh to retry.", "error");
    setProgress(0);
    state.ttsPromise = null;
  } finally {
    elements.loadButton.disabled = false;
  }
}

function toWavBlob(audio) {
  if (!audio || typeof audio.toWav !== "function") {
    throw new Error("The audio result did not provide WAV data.");
  }

  return Promise.resolve(audio.toWav()).then(async (value) => {
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer) return new Blob([value], { type: "audio/wav" });
    if (ArrayBuffer.isView(value)) {
      return new Blob([value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)], { type: "audio/wav" });
    }
    throw new Error("The voice engine returned an unsupported WAV data type.");
  });
}

function addAudioResult(filename, blob) {
  const url = URL.createObjectURL(blob);
  state.objectUrls.push(url);

  const row = document.createElement("div");
  row.className = "audio-row";

  const name = document.createElement("span");
  name.className = "audio-name";
  name.textContent = filename;

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.src = url;
  player.setAttribute("aria-label", "Preview " + filename);

  const download = document.createElement("a");
  download.className = "audio-download";
  download.href = url;
  download.download = filename;
  download.textContent = "Download WAV";

  row.append(name, player, download);
  elements.audioResults.append(row);
}

async function generateAudio() {
  const validation = validateInput(elements.scriptInput.value, MAX_CHARACTERS, MAX_SEGMENTS);
  if (!validation.valid) {
    setStatus(validation.message, "error");
    return;
  }

  clearResults();
  elements.generateButton.disabled = true;
  elements.loadButton.disabled = true;
  elements.scriptInput.disabled = true;
  setProgress(1);

  try {
    const tts = await getTTS();
    const JSZip = await getJSZip();
    const zip = new JSZip();

    const voice = elements.voiceSelect.value || "am_adam";
    const speed = Number(elements.speedInput.value);

    for (let index = 0; index < validation.sentences.length; index += 1) {
      const number = index + 1;
      const filename = "s" + String(number).padStart(3, "0") + ".wav";
      const percentage = 5 + (index / validation.sentences.length) * 90;

      setProgress(percentage);
      setStatus("Generating WAV " + number + " of " + validation.sentences.length + " with " + voice + "…");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const audio = await tts.generate(validation.sentences[index], { voice, speed });
      const wavBlob = await toWavBlob(audio);
      zip.file(filename, wavBlob);
      addAudioResult(filename, wavBlob);
    }

    setStatus("Packaging " + validation.sentences.length + " WAV file(s) into a ZIP…");
    setProgress(97);
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
    elements.resultsSummary.textContent = validation.sentences.length + " WAV file(s) · " + voice + " · " + speed.toFixed(2) + "×";
    setProgress(100);
    setStatus("Completed. Preview individual files or download the complete ZIP.", "good");
  } catch (error) {
    console.error(error);
    setProgress(0);
    setStatus("Generation failed: " + (error?.message || String(error)), "error");
    elements.resultsPanel.hidden = elements.audioResults.childElementCount === 0;
  } finally {
    elements.generateButton.disabled = !state.tts;
    elements.loadButton.disabled = false;
    elements.scriptInput.disabled = false;
  }
}

elements.scriptInput.addEventListener("input", () => {
  elements.characterCount.textContent = elements.scriptInput.value.length.toLocaleString() + " / " + MAX_CHARACTERS.toLocaleString();
});

elements.speedInput.addEventListener("input", () => {
  elements.speedValue.textContent = Number(elements.speedInput.value).toFixed(2) + "×";
});

elements.loadButton.addEventListener("click", loadModel);
elements.generateButton.addEventListener("click", generateAudio);

elements.clearButton.addEventListener("click", () => {
  elements.scriptInput.value = "";
  elements.characterCount.textContent = "0 / " + MAX_CHARACTERS.toLocaleString();
  clearResults();
  setStatus("Text cleared. The loaded model remains available in this tab.");
  setProgress(0);
});

if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  setStatus("Open this app over HTTPS or localhost for browser model compatibility.", "error");
}