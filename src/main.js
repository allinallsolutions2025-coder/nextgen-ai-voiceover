// English-first browser-local voiceover studio.
import { getSpeechChunks, validateParagraphInput } from "./lib/text.js";
import { applyPronunciationRules, parsePronunciationRules } from "./lib/pronunciation.js";
import { getCompleteVoiceCatalog, normalizeVoiceCatalog } from "./lib/voice-catalog.js";
import { validateVoicePreviewManifest, verifyVoicePreviewBlob } from "./lib/voice-previews.js";
import { prepareNarrationText, splitNarrationSections } from "./lib/narration.js";
import { processAudioSamples } from "./lib/audio-processing.js";
import { getAudioDurationSeconds } from "./lib/audio-metadata.js";
import { buildSubtitleCues, getCreatorPreset, serializeSrt, serializeVtt } from "./lib/subtitles.js";
import {
  mergeParagraphWithNext, moveParagraph, reconcileParagraphs,
  serializeParagraphs, splitParagraph
} from "./lib/paragraph-editor.js";
import { Capacitor } from "@capacitor/core";
import { env as transformersEnv } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const KOKORO_PACKAGE = "kokoro-js@1.2.1";
const OFFLINE_TEST = new URLSearchParams(location.search).has("offline-test");
const PACKAGED_RUNTIME = location.protocol === "app:" || Capacitor.isNativePlatform() || OFFLINE_TEST;
const MAX_CHARACTERS = 20000;
const MAX_PARAGRAPHS = 100;
const DRAFT_STORAGE_KEY = "nextgen-voiceover-draft-v1";
const FAVORITES_STORAGE_KEY = "nextgen-voiceover-favorite-voices-v1";
const RECENT_VOICES_STORAGE_KEY = "nextgen-voiceover-recent-voices-v1";
const PARAGRAPH_SETTINGS_STORAGE_KEY = "nextgen-voiceover-paragraph-settings-v1";
const CREATOR_EXPORT_SETTINGS_KEY = "nextgen-voiceover-creator-export-v1";
const PREVIEW_TEXT = "Hello! This is a short preview of the selected voice.";
const VOICE_PREVIEW_CACHE_VERSION = 2;
const VOICE_PREVIEW_DB_NAME = "nextgen-voiceover-voice-previews-v1";
const VOICE_PREVIEW_STORE_NAME = "voice-previews";

function configureLocalKokoroAssets() {
  if (!PACKAGED_RUNTIME) return;

  // Transformers.js owns model/local-file settings. Kokoro.js's env export
  // only proxies cacheDir and wasmPaths, so configure the real environment.
  transformersEnv.allowLocalModels = true;
  transformersEnv.localModelPath = new URL("../models/", import.meta.url).href;
  transformersEnv.allowRemoteModels = false;
  transformersEnv.useBrowserCache = true;
  transformersEnv.backends.onnx.wasm.wasmPaths = new URL("../ort/", import.meta.url).href;

  // Kokoro.js 1.2.1 hard-codes the voice file host. Redirect only its English
  // voice requests to the corresponding bundled local .bin files.
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    let requestUrl;
    try {
      const rawUrl = typeof input === "string" || input instanceof URL ? input : input.url;
      requestUrl = new URL(rawUrl);
    } catch {
      return originalFetch(input, init);
    }
    const match = requestUrl.pathname.match(
      /^\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/main\/voices\/((?:af|am|bf|bm)_[a-z]+\.bin)$/
    );
    if (!match || requestUrl.hostname !== "huggingface.co") {
      return originalFetch(input, init);
    }
    const localVoiceUrl = new URL(
      "../models/onnx-community/Kokoro-82M-v1.0-ONNX/voices/" + match[1],
      import.meta.url
    );
    return originalFetch(localVoiceUrl, init);
  };
}

configureLocalKokoroAssets();

if (("https:" === location.protocol || location.hostname === "localhost") &&
    "serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  const serviceWorkerUrl = new URL("../sw.js", import.meta.url);
  const serviceWorkerScope = new URL("../", import.meta.url).pathname;
  navigator.serviceWorker.register(serviceWorkerUrl, { scope: serviceWorkerScope })
    .catch(error => console.warn("Offline app installation is unavailable in this browser:", error));
}

const elements = {
  modelBadge: document.querySelector("#modelBadge"),
  scriptInput: document.querySelector("#scriptInput"),
  paragraphEditorDetails: document.querySelector("#paragraphEditorDetails"),
  paragraphEditorStatus: document.querySelector("#paragraphEditorStatus"),
  paragraphEditorList: document.querySelector("#paragraphEditorList"),
  characterCount: document.querySelector("#characterCount"),
  paragraphCount: document.querySelector("#paragraphCount"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceHelp: document.querySelector("#voiceHelp"),
  voiceFilterSelect: document.querySelector("#voiceFilterSelect"),
  pronunciationRules: document.querySelector("#pronunciationRules"),
  pronunciationStatus: document.querySelector("#pronunciationStatus"),
  enhanceSpokenText: document.querySelector("#enhanceSpokenText"),
  runBenchmarkButton: document.querySelector("#runBenchmarkButton"),
  stopBenchmarkButton: document.querySelector("#stopBenchmarkButton"),
  benchmarkStatus: document.querySelector("#benchmarkStatus"),
  benchmarkResults: document.querySelector("#benchmarkResults"),
  previewVoiceButton: document.querySelector("#previewVoiceButton"),
  voicePreviewAudio: document.querySelector("#voicePreviewAudio"),
  favoriteVoiceButton: document.querySelector("#favoriteVoiceButton"),
  recentVoiceHelp: document.querySelector("#recentVoiceHelp"),
  spokenPreviewText: document.querySelector("#spokenPreviewText"),
  draftStatus: document.querySelector("#draftStatus"),
  outputFormat: document.querySelector("#outputFormat"),
  creatorPreset: document.querySelector("#creatorPreset"),
  normalizeAudio: document.querySelector("#normalizeAudio"),
  trimSilence: document.querySelector("#trimSilence"),
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
  subtitleDownloads: document.querySelector("#subtitleDownloads"),
  srtDownload: document.querySelector("#srtDownload"),
  vttDownload: document.querySelector("#vttDownload"),
  subtitleStatus: document.querySelector("#subtitleStatus"),
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
  voicePreviewDbPromise: null,
  voicePreviewBlobs: new Map(),
  voicePreviewBundledIds: new Set(),
  voicePreviewLibraryPromise: null,
  voicePreviewObjectUrls: new Map(),
  voicePreviewPersistedIds: new Set(),
  voicePreviewFailedIds: new Set(),
  voicePreviewPrepareController: null,
  voicePreviewPreparePromise: null,
  isPreparingVoicePreviews: false,
  voicePreviewUserPaused: false,
  previewObjectUrl: null,
  previewController: null,
  activeAbortController: null,
  isGenerating: false,
  isPreviewing: false,
  favoriteVoiceIds: new Set(),
  recentVoiceIds: [],
  paragraphs: [],
  generatedParagraphBlobs: [],
  fullScriptBlob: null,
  zipObjectUrl: null,
  outputExtension: "wav",
  projectExport: null,
  subtitleSrtBlob: null,
  subtitleVttBlob: null
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

function updateBenchmarkButtonState() {
  if (!elements.runBenchmarkButton) return;
  const failed = state.voicePreviewFailedIds.size;
  const missing = state.voiceCatalog.length - state.voicePreviewBlobs.size;
  elements.runBenchmarkButton.disabled = !state.tts || !state.voiceCatalog.length ||
    state.isPreparingVoicePreviews || state.isGenerating || state.isPreviewing ||
    (missing <= 0 && failed === 0);
  elements.runBenchmarkButton.textContent = failed ? "Retry failed previews" :
    state.voicePreviewUserPaused ? "Resume preparation" :
    missing > 0 ? "Prepare missing previews" : "All " + state.voiceCatalog.length + " previews ready";
  elements.stopBenchmarkButton.hidden = !state.isPreparingVoicePreviews;
  elements.stopBenchmarkButton.disabled = !state.isPreparingVoicePreviews;
}

function persistParagraphSettings() {
  try {
    localStorage.setItem(PARAGRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(state.paragraphs));
  } catch {
    // The editor remains available for the current tab when storage is unavailable.
  }
}

function restoreParagraphSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(PARAGRAPH_SETTINGS_STORAGE_KEY) || "[]");
    state.paragraphs = reconcileParagraphs(elements.scriptInput.value, Array.isArray(saved) ? saved : []);
  } catch {
    state.paragraphs = reconcileParagraphs(elements.scriptInput.value, []);
  }
}

function persistCreatorExportSettings() {
  try {
    localStorage.setItem(CREATOR_EXPORT_SETTINGS_KEY, JSON.stringify({
      preset: elements.creatorPreset.value,
      normalize: elements.normalizeAudio.checked,
      trimSilence: elements.trimSilence.checked
    }));
  } catch {
    // These settings still apply for the current tab when storage is unavailable.
  }
}

function restoreCreatorExportSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(CREATOR_EXPORT_SETTINGS_KEY) || "{}");
    if (["shorts", "longform", "podcast", "narration"].includes(saved.preset)) {
      elements.creatorPreset.value = saved.preset;
    }
    if (typeof saved.normalize === "boolean") elements.normalizeAudio.checked = saved.normalize;
    if (typeof saved.trimSilence === "boolean") elements.trimSilence.checked = saved.trimSilence;
  } catch {
    elements.creatorPreset.value = "shorts";
    elements.normalizeAudio.checked = false;
    elements.trimSilence.checked = false;
  }
}

function setCreatorExportControlsDisabled(disabled) {
  elements.creatorPreset.disabled = disabled;
  elements.normalizeAudio.disabled = disabled;
  elements.trimSilence.disabled = disabled;
}

function syncParagraphsFromScript() {
  state.paragraphs = reconcileParagraphs(elements.scriptInput.value, state.paragraphs);
  persistParagraphSettings();
  renderParagraphEditor();
}

function updateParagraphEditorStatus(message, kind = "normal") {
  elements.paragraphEditorStatus.textContent = message;
  elements.paragraphEditorStatus.className = "paragraph-editor-status" +
    (kind === "error" ? " status-error" : kind === "good" ? " status-good" : "");
}

function updateParagraphEditorControls() {
  const busy = state.isGenerating || state.isPreviewing;
  for (const button of elements.paragraphEditorList.querySelectorAll(".paragraph-action-regenerate")) {
    const index = Number(button.dataset.paragraphIndex);
    const hasAudio = Boolean(state.generatedParagraphBlobs[index] && state.fullScriptBlob);
    button.disabled = busy || !hasAudio;
    button.textContent = hasAudio ? "Regenerate section" : "Generate all first";
  }
  for (const button of elements.paragraphEditorList.querySelectorAll(".paragraph-action-move-up")) {
    button.disabled = busy || Number(button.dataset.paragraphIndex) === 0;
  }
  for (const button of elements.paragraphEditorList.querySelectorAll(".paragraph-action-move-down")) {
    button.disabled = busy || Number(button.dataset.paragraphIndex) === state.paragraphs.length - 1;
  }
  for (const button of elements.paragraphEditorList.querySelectorAll(".paragraph-action-split, .paragraph-action-merge")) {
    button.disabled = busy;
  }
  for (const input of elements.paragraphEditorList.querySelectorAll("textarea, select")) input.disabled = busy;
}

function appendParagraphAction(container, label, action, index, className, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary paragraph-action " + className;
  button.dataset.paragraphAction = action;
  button.dataset.paragraphIndex = String(index);
  button.textContent = label;
  button.disabled = disabled;
  container.append(button);
  return button;
}

function renderParagraphEditor() {
  if (!elements.paragraphEditorList) return;
  elements.paragraphEditorList.replaceChildren();
  const count = state.paragraphs.length;
  elements.paragraphEditorDetails.hidden = count === 0;
  if (!count) {
    updateParagraphEditorStatus("Add a blank line in your script to create another paragraph.");
    return;
  }

  const globalVoice = elements.voiceSelect.value || "af_heart";
  const globalSpeed = Number(elements.speedInput.value) || 1;
  updateParagraphEditorStatus(
    count + (count === 1 ? " paragraph ready." : " paragraphs ready.") +
    " Section overrides are optional; leave them on studio default to inherit the main settings."
  );

  state.paragraphs.forEach((paragraph, index) => {
    const card = document.createElement("article");
    card.className = "paragraph-editor-card";
    card.dataset.paragraphId = paragraph.id;

    const heading = document.createElement("div");
    heading.className = "paragraph-editor-heading";
    const title = document.createElement("strong");
    title.textContent = "Paragraph " + (index + 1);
    const meta = document.createElement("small");
    meta.textContent = paragraph.text.length.toLocaleString() + " characters";
    heading.append(title, meta);

    const textarea = document.createElement("textarea");
    textarea.className = "paragraph-editor-text";
    textarea.dataset.paragraphIndex = String(index);
    textarea.rows = Math.max(3, Math.min(7, Math.ceil(paragraph.text.length / 90)));
    textarea.maxLength = 20000;
    textarea.value = paragraph.text;
    textarea.setAttribute("aria-label", "Text for paragraph " + (index + 1));

    const settings = document.createElement("div");
    settings.className = "paragraph-editor-settings";

    const voiceField = document.createElement("label");
    voiceField.className = "paragraph-editor-field";
    const voiceLabel = document.createElement("span");
    voiceLabel.textContent = "Voice";
    const voiceSelect = document.createElement("select");
    voiceSelect.className = "paragraph-editor-voice";
    voiceSelect.dataset.paragraphIndex = String(index);
    voiceSelect.setAttribute("aria-label", "Voice for paragraph " + (index + 1));
    const defaultVoice = document.createElement("option");
    defaultVoice.value = "";
    defaultVoice.textContent = "Studio default · " + (state.voiceCatalog.find(voice => voice.id === globalVoice)?.name || globalVoice);
    voiceSelect.append(defaultVoice);
    for (const voice of state.voiceCatalog) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name + " · " + voice.languageLabel;
      voiceSelect.append(option);
    }
    voiceSelect.value = paragraph.voice || "";
    voiceField.append(voiceLabel, voiceSelect);

    const speedField = document.createElement("label");
    speedField.className = "paragraph-editor-field";
    const speedLabel = document.createElement("span");
    speedLabel.textContent = "Speaking pace";
    const speedSelect = document.createElement("select");
    speedSelect.className = "paragraph-editor-speed";
    speedSelect.dataset.paragraphIndex = String(index);
    speedSelect.setAttribute("aria-label", "Speaking pace for paragraph " + (index + 1));
    const defaultSpeed = document.createElement("option");
    defaultSpeed.value = "";
    defaultSpeed.textContent = "Studio default · " + globalSpeed.toFixed(2) + "×";
    speedSelect.append(defaultSpeed);
    for (let value = 0.5; value <= 2.0001; value += 0.05) {
      const option = document.createElement("option");
      option.value = value.toFixed(2);
      option.textContent = value.toFixed(2) + "×";
      speedSelect.append(option);
    }
    speedSelect.value = paragraph.speed || "";
    speedField.append(speedLabel, speedSelect);
    settings.append(voiceField, speedField);

    const actions = document.createElement("div");
    actions.className = "paragraph-editor-actions";
    appendParagraphAction(actions, "↑ Move up", "move-up", index, "paragraph-action-move-up", index === 0);
    appendParagraphAction(actions, "↓ Move down", "move-down", index, "paragraph-action-move-down", index === count - 1);
    appendParagraphAction(actions, "Split at cursor", "split", index, "paragraph-action-split");
    appendParagraphAction(actions, "Merge next", "merge", index, "paragraph-action-merge", index === count - 1);
    appendParagraphAction(
      actions,
      state.generatedParagraphBlobs[index] ? "Regenerate section" : "Generate all first",
      "regenerate",
      index,
      "paragraph-action-regenerate",
      !state.generatedParagraphBlobs[index]
    );

    card.append(heading, textarea, settings, actions);
    elements.paragraphEditorList.append(card);
  });
  updateParagraphEditorControls();
}

function applyParagraphStructureChange(message) {
  elements.scriptInput.value = serializeParagraphs(state.paragraphs);
  updateScriptCounts();
  saveDraftLocally();
  persistParagraphSettings();
  updateSpokenTextPreview();
  clearResults();
  renderParagraphEditor();
  updateParagraphEditorStatus(message, "good");
}

function setParagraphEditorBusy(busy) {
  for (const input of elements.paragraphEditorList.querySelectorAll("textarea, select, button")) {
    input.disabled = busy;
  }
  if (!busy) updateParagraphEditorControls();
}

function handleParagraphEditorInput(event) {
  const textarea = event.target.closest(".paragraph-editor-text");
  if (!textarea) return;
  const index = Number(textarea.dataset.paragraphIndex);
  if (!Number.isInteger(index) || !state.paragraphs[index]) return;
  state.paragraphs[index] = { ...state.paragraphs[index], text: textarea.value };
  elements.scriptInput.value = serializeParagraphs(state.paragraphs);
  const meta = textarea.closest(".paragraph-editor-card")?.querySelector(".paragraph-editor-heading small");
  if (meta) meta.textContent = textarea.value.length.toLocaleString() + " characters";
  updateScriptCounts();
  saveDraftLocally();
  persistParagraphSettings();
  updateSpokenTextPreview();
  clearResults();
}

function handleParagraphEditorChange(event) {
  const select = event.target.closest(".paragraph-editor-voice, .paragraph-editor-speed");
  if (!select) return;
  const index = Number(select.dataset.paragraphIndex);
  if (!Number.isInteger(index) || !state.paragraphs[index]) return;
  if (select.classList.contains("paragraph-editor-voice")) {
    state.paragraphs[index] = { ...state.paragraphs[index], voice: select.value };
    if (select.value) rememberRecentVoice(select.value);
  } else {
    state.paragraphs[index] = { ...state.paragraphs[index], speed: select.value };
  }
  persistParagraphSettings();
  const voice = state.paragraphs[index].voice || elements.voiceSelect.value;
  const speed = state.paragraphs[index].speed || Number(elements.speedInput.value).toFixed(2);
  updateParagraphEditorStatus(
    "Paragraph " + (index + 1) + " uses " + (voice || "studio voice") + " at " + speed + "×. Regenerate its section file to apply changes."
  );
}

function handleParagraphEditorAction(event) {
  const button = event.target.closest("[data-paragraph-action]");
  if (!button || button.disabled) return;
  const index = Number(button.dataset.paragraphIndex);
  const action = button.dataset.paragraphAction;
  if (action === "move-up" || action === "move-down") {
    state.paragraphs = moveParagraph(state.paragraphs, index, action === "move-up" ? -1 : 1);
    applyParagraphStructureChange("Paragraph order updated. Generate again to refresh the audio exports.");
    return;
  }
  if (action === "split") {
    const textarea = button.closest(".paragraph-editor-card")?.querySelector(".paragraph-editor-text");
    const split = splitParagraph(state.paragraphs, index, textarea?.selectionStart);
    if (!split) {
      updateParagraphEditorStatus("Place the text cursor inside the paragraph where you want to split it.", "error");
      return;
    }
    state.paragraphs = split;
    applyParagraphStructureChange("Paragraph split. Both sections are ready to generate.");
    return;
  }
  if (action === "merge") {
    const merged = mergeParagraphWithNext(state.paragraphs, index);
    if (!merged) return;
    state.paragraphs = merged;
    applyParagraphStructureChange("Paragraphs merged. Generate again to refresh the audio exports.");
    return;
  }
  if (action === "regenerate") void regenerateParagraph(index);
}

function persistVoicePreferences() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favoriteVoiceIds]));
    localStorage.setItem(RECENT_VOICES_STORAGE_KEY, JSON.stringify(state.recentVoiceIds));
  } catch {
    // Voice preferences remain usable for this tab if storage is unavailable.
  }
}

function restoreVoicePreferences() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    const recent = JSON.parse(localStorage.getItem(RECENT_VOICES_STORAGE_KEY) || "[]");
    state.favoriteVoiceIds = new Set(Array.isArray(favorites)
      ? favorites.filter(id => typeof id === "string" && /^[ab][fm]_[a-z]+$/.test(id))
      : []);
    state.recentVoiceIds = Array.isArray(recent)
      ? [...new Set(recent.filter(id => typeof id === "string" && /^[ab][fm]_[a-z]+$/.test(id)))].slice(0, 5)
      : [];
  } catch {
    state.favoriteVoiceIds = new Set();
    state.recentVoiceIds = [];
  }
}

function updateRecentVoiceLabel() {
  if (!elements.recentVoiceHelp) return;
  const recentNames = state.recentVoiceIds
    .map(id => state.voiceCatalog.find(voice => voice.id === id)?.name)
    .filter(Boolean);
  elements.recentVoiceHelp.textContent = recentNames.length
    ? "Recently used: " + recentNames.join(" · ")
    : "Recently used: none yet.";
}

function rememberRecentVoice(voiceId) {
  if (!state.supportedVoiceIds.has(voiceId)) return;
  state.recentVoiceIds = [voiceId, ...state.recentVoiceIds.filter(id => id !== voiceId)].slice(0, 5);
  persistVoicePreferences();
  updateRecentVoiceLabel();
}

function toggleFavoriteVoice() {
  const voiceId = elements.voiceSelect.value;
  if (!state.supportedVoiceIds.has(voiceId)) return;
  if (state.favoriteVoiceIds.has(voiceId)) state.favoriteVoiceIds.delete(voiceId);
  else state.favoriteVoiceIds.add(voiceId);
  persistVoicePreferences();
  renderVoiceSelector();
  const voiceName = state.voiceCatalog.find(voice => voice.id === voiceId)?.name || voiceId;
  setStatus(
    state.favoriteVoiceIds.has(voiceId) ? voiceName + " saved to favorite voices." : voiceName + " removed from favorite voices.",
    "good"
  );
}

function updatePreviewButtonState() {
  const voice = elements.voiceSelect.value;
  const voiceAvailable = Boolean(voice && state.supportedVoiceIds.has(voice));
  const previewReady = Boolean(voiceAvailable && (state.tts || state.voicePreviewBlobs.has(voice)));
  const busy = state.isGenerating || state.isPreviewing;
  elements.previewVoiceButton.disabled = !previewReady || busy;
  elements.favoriteVoiceButton.disabled = !voiceAvailable || busy;
  const favorite = state.favoriteVoiceIds.has(voice);
  elements.favoriteVoiceButton.setAttribute("aria-pressed", String(favorite));
  elements.favoriteVoiceButton.textContent = favorite ? "★ Saved voice" : "☆ Save voice";
  updateBenchmarkButtonState();
}

function revokeObjectUrls() {
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
}

function clearResults() {
  revokeObjectUrls();
  state.generatedParagraphBlobs = [];
  state.fullScriptBlob = null;
  state.zipObjectUrl = null;
  state.projectExport = null;
  state.subtitleSrtBlob = null;
  state.subtitleVttBlob = null;
  elements.subtitleDownloads.hidden = true;
  elements.srtDownload.removeAttribute("href");
  elements.vttDownload.removeAttribute("href");
  elements.audioResults.replaceChildren();
  elements.zipDownload.hidden = true;
  elements.zipDownload.removeAttribute("href");
  elements.resultsSummary.textContent = "Your audio files will appear here.";
  elements.resultsPanel.hidden = true;
  updateParagraphEditorControls();
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
      const module = await import("kokoro-js");
      if (!module.KokoroTTS) throw new Error("KokoroTTS was not exported by the selected Kokoro.js module.");
      if (!module.TextSplitterStream) throw new Error("The selected Kokoro.js module does not expose TextSplitterStream.");
      // Configure the actual Transformers.js environment above. Kokoro.js
      // exposes only a WASM-path proxy in its own env export.
      if (module.env) module.env.wasmPaths = new URL("../ort/", import.meta.url).href;
      state.TextSplitterStream = module.TextSplitterStream;
      return module.KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        revision: MODEL_REVISION
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
    state.lamePromise = import("@breezystack/lamejs").then((module) => {
      const encoder = module.default || module;
      window.lamejs = encoder;
      if (!window.lamejs?.Mp3Encoder && module.Mp3Encoder) window.lamejs = module;
      if (!window.lamejs?.Mp3Encoder) throw new Error("The bundled MP3 encoder did not expose lamejs.Mp3Encoder.");
      return window.lamejs;
    }).catch((error) => {
      state.lamePromise = null;
      throw error;
    });
  }
  return state.lamePromise;
}

async function getJSZip() {
  if (!state.jsZipPromise) {
    state.jsZipPromise = import("jszip")
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
    if (filter === "favorites") return state.favoriteVoiceIds.has(voice.id);
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
  elements.voiceHelp.textContent = filteredVoices.length + " of 28 voices shown · American and British accents.";
  updateRecentVoiceLabel();
  renderParagraphEditor();
  updatePreviewButtonState();
}

function populateVoiceSelector(tts = null) {
  state.voiceCatalog = normalizeVoiceCatalog(tts?.voices ?? []);
  state.supportedVoiceIds = new Set(state.voiceCatalog.map((voice) => voice.id));
  state.paragraphs = state.paragraphs.map(paragraph => ({
    ...paragraph,
    voice: paragraph.voice && state.supportedVoiceIds.has(paragraph.voice) ? paragraph.voice : ""
  }));
  persistParagraphSettings();
  renderVoiceSelector();
  renderParagraphEditor();
  renderVoicePreviewCards();
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

function transformTextForSpeech(text, rules = []) {
  const customPronunciation = applyPronunciationRules(text, rules);
  return elements.enhanceSpokenText.checked
    ? prepareNarrationText(customPronunciation)
    : customPronunciation;
}

function updateSpokenTextPreview() {
  if (!elements.spokenPreviewText) return;
  const source = elements.scriptInput.value;
  if (!source.trim()) {
    elements.spokenPreviewText.textContent = "Your prepared spoken script will appear here.";
    return;
  }
  const pronunciation = parsePronunciationRules(elements.pronunciationRules.value);
  if (pronunciation.errors.length) {
    elements.spokenPreviewText.textContent =
      "Fix pronunciation rules on line(s) " + pronunciation.errors.join(", ") + " to preview the prepared spoken text.";
    return;
  }
  elements.spokenPreviewText.textContent = transformTextForSpeech(source, pronunciation.rules);
}

function restoreSpokenTextPreference() {
  try {
    const saved = localStorage.getItem("nextgen-voiceover-smart-pronunciation-v1");
    elements.enhanceSpokenText.checked = saved === null ? true : saved === "true";
  } catch {
    elements.enhanceSpokenText.checked = true;
  }
}

function saveSpokenTextPreference() {
  try {
    localStorage.setItem("nextgen-voiceover-smart-pronunciation-v1", String(elements.enhanceSpokenText.checked));
  } catch {
    // Preference still applies for the current tab.
  }
  clearResults();
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
  renderParagraphEditor();
}

async function loadModel() {
  if (state.tts) {
    if (!state.voiceCatalog.length) populateVoiceSelector(state.tts);
    setBadge("Model ready", "ready");
    elements.loadButton.textContent = "Model ready";
    elements.loadButton.disabled = true;
    setStatus("Voice model is ready. Choose a voice and generate your script.", "good");
    void runVoiceBenchmark();
    return;
  }

  elements.loadButton.disabled = true;
  elements.generateButton.disabled = true;
  try {
    const tts = await getTTS();
    populateVoiceSelector(tts);
    setBadge("Model ready", "ready");
    setStatus("Your 28 English voices are ready. Pre-generated voice previews are already available.", "good");
    elements.generateButton.disabled = !state.voiceCatalog.length;
    updateBenchmarkButtonState();
    setProgress(100);
    void runVoiceBenchmark();
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

  const speechSections = splitNarrationSections(text);
  if (!speechSections.length) throw new Error("No speech text was available to generate.");
  if (!state.TextSplitterStream) throw new Error("Kokoro's streaming text splitter is unavailable.");

  const waveChunks = [];
  let sampleRate = null;
  let totalSamples = 0;

  for (let sectionIndex = 0; sectionIndex < speechSections.length; sectionIndex += 1) {
    throwIfAborted(signal);
    const speechChunks = getSpeechChunks(speechSections[sectionIndex]);
    if (!speechChunks.length) continue;
    const splitter = new state.TextSplitterStream();
    // Push the section once without synthetic newline delimiters. Kokoro can
    // split on its own; a trailing newline can stall around URLs/@mentions.
    splitter.push(speechChunks.join(" "));
    splitter.close();

    let sectionChunkCount = 0;
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
      const pauseBefore = waveChunks.length === 0
        ? 0
        : sectionChunkCount === 0
          ? Math.round(rate * 0.38)
          : Math.round(rate * 0.12);
      waveChunks.push({ samples, pauseBefore });
      totalSamples += samples.length;
      sectionChunkCount += 1;
    }
  }

  throwIfAborted(signal);
  if (!waveChunks.length || !sampleRate) {
    throw new Error("The voice engine returned no audio chunks.");
  }

  const totalPauseSamples = waveChunks.reduce((total, chunk) => total + chunk.pauseBefore, 0);
  const combined = new Float32Array(totalSamples + totalPauseSamples);
  let offset = 0;
  for (const chunk of waveChunks) {
    offset += chunk.pauseBefore;
    combined.set(chunk.samples, offset);
    offset += chunk.samples.length;
  }
  const processedAudio = processAudioSamples(combined, sampleRate, {
    normalize: elements.normalizeAudio.checked,
    trimSilence: elements.trimSilence.checked
  });
  if (outputFormat === "mp3") return createMp3BlobFromSamples(processedAudio.samples, sampleRate);
  return createWavBlobFromSamples(processedAudio.samples, sampleRate);
}


async function generateSelectedSpeechBlob(tts, text, voice, speed, outputFormat, signal) {
  throwIfAborted(signal);
  return generateSpeechBlob(tts, text, { voice, speed }, outputFormat, signal);
}

async function previewSelectedVoice() {
  if(state.isGenerating||state.isPreviewing)return;
  const selectedVoice=elements.voiceSelect.value; rememberRecentVoice(selectedVoice);
  if(!selectedVoice||!state.supportedVoiceIds.has(selectedVoice))return;
  const scriptSample=elements.scriptInput.value.trim().slice(0,160);
  const cached=!scriptSample?state.voicePreviewBlobs.get(selectedVoice):null;
  if(cached){
    if(state.previewObjectUrl)URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl=URL.createObjectURL(cached); elements.voicePreviewAudio.src=state.previewObjectUrl;
    elements.voicePreviewAudio.hidden=false; try{await elements.voicePreviewAudio.play();}catch{}
    setStatus("Ready-to-play English preview: "+selectedVoice+".","good"); return;
  }
  const pronunciation=parsePronunciationRules(elements.pronunciationRules.value);
  if(pronunciation.errors.length){setStatus("Fix pronunciation rules on line(s) "+pronunciation.errors.join(", ")+" before previewing.","error");return;}
  await pauseBackgroundVoicePreviews();
  const sample=transformTextForSpeech(scriptSample||PREVIEW_TEXT,pronunciation.rules);
  const controller=new AbortController(); state.previewController=controller; state.isPreviewing=true;
  updateParagraphEditorControls(); updateBenchmarkButtonState(); elements.previewVoiceButton.disabled=true; elements.previewVoiceButton.textContent="Generating preview…";
  try{
    const tts=state.tts||await getTTS();
    const blob=await generateSelectedSpeechBlob(tts,sample,selectedVoice,Number(elements.speedInput.value),"wav",controller.signal);
    throwIfAborted(controller.signal);
    if(!scriptSample){
      const saved=await saveVoicePreviewCache(selectedVoice,blob,await getVoicePreviewDatabase());
      const voice=state.voiceCatalog.find(item=>item.id===selectedVoice); if(voice)setPreviewReady(voice,blob,saved);
    }
    if(state.previewObjectUrl)URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl=URL.createObjectURL(blob); elements.voicePreviewAudio.src=state.previewObjectUrl;
    elements.voicePreviewAudio.hidden=false; try{await elements.voicePreviewAudio.play();}catch{}
    setStatus("English voice preview ready: "+selectedVoice+".","good");
  }catch(error){
    if(error?.name==="AbortError")setStatus("Voice preview stopped.","normal");
    else{console.error(error);setStatus("Could not preview this voice: "+(error?.message||String(error)),"error");}
  }finally{
    state.isPreviewing=false; state.previewController=null; updateParagraphEditorControls();
    elements.previewVoiceButton.textContent="Preview voice"; updatePreviewButtonState(); resumeVoicePreviewPreparation();
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

function updateParagraphAudioResult(index, blob, voice, speed, outputFormat) {
  const paragraphNumber = index + 1;
  const card = elements.audioResults.querySelector(
    '.paragraph-audio-card[data-paragraph-index="' + paragraphNumber + '"]'
  );
  if (!card) throw new Error("The paragraph audio card is missing. Generate the script again.");

  const player = card.querySelector("audio");
  const previousUrl = player.src;
  if (previousUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previousUrl);
    state.objectUrls = state.objectUrls.filter(item => item !== previousUrl);
  }
  const url = URL.createObjectURL(blob);
  state.objectUrls.push(url);
  const download = card.querySelector(".audio-download");
  const subtitle = card.querySelector(".audio-card-subtitle");
  player.src = url;
  download.href = url;
  download.download = "paragraph_" + String(paragraphNumber).padStart(3, "0") + "." + outputFormat;
  if (subtitle) {
    const excerpt = state.paragraphs[index].text.slice(0, 110);
    subtitle.textContent = excerpt + (state.paragraphs[index].text.length > 110 ? "…" : "") +
      " · " + voice + " · " + speed.toFixed(2) + "×";
  }
}

async function createSubtitleExports() {
  if (!state.fullScriptBlob || !state.projectExport?.spokenScript) return;
  const durationSeconds = await getAudioDurationSeconds(state.fullScriptBlob);
  const preset = getCreatorPreset(state.projectExport.presetId);
  const cues = buildSubtitleCues(state.projectExport.spokenScript, durationSeconds, { preset: preset.id });
  const srtText = serializeSrt(cues);
  const vttText = serializeVtt(cues);
  state.subtitleSrtBlob = new Blob([srtText], { type: "application/x-subrip;charset=utf-8" });
  state.subtitleVttBlob = new Blob([vttText], { type: "text/vtt;charset=utf-8" });
  state.projectExport.audioDurationSeconds = durationSeconds;
  state.projectExport.subtitleCueCount = cues.length;
  state.projectExport.subtitleTiming = "Estimated from measured full-audio duration, weighted by phrase length and punctuation. Review and adjust before publishing; this is not word-level forced alignment.";

  for (const [element, blob, filename] of [
    [elements.srtDownload, state.subtitleSrtBlob, "full_script.srt"],
    [elements.vttDownload, state.subtitleVttBlob, "full_script.vtt"]
  ]) {
    const url = URL.createObjectURL(blob);
    state.objectUrls.push(url);
    element.href = url;
    element.download = filename;
  }
  elements.subtitleStatus.textContent = preset.label + " captions · " + durationSeconds.toFixed(1) +
    " seconds · " + cues.length + " estimated cues. Review timing before publishing.";
  elements.subtitleDownloads.hidden = false;
}

async function refreshZipDownload() {
  if (!state.fullScriptBlob || !state.generatedParagraphBlobs.length) return;
  const JSZip = await getJSZip();
  const zip = new JSZip();
  const extension = state.outputExtension;
  for (let index = 0; index < state.generatedParagraphBlobs.length; index += 1) {
    zip.file("paragraph_" + String(index + 1).padStart(3, "0") + "." + extension, state.generatedParagraphBlobs[index]);
  }
  zip.file("full_script." + extension, state.fullScriptBlob);
  if (state.projectExport) {
    zip.file("original_script.txt", state.projectExport.originalScript || "");
    zip.file("spoken_script.txt", state.projectExport.spokenScript || "");
    if (state.subtitleSrtBlob) zip.file("full_script.srt", state.subtitleSrtBlob);
    if (state.subtitleVttBlob) zip.file("full_script.vtt", state.subtitleVttBlob);
    const manifest = {
      name: "NextGen AI Voiceover creator project",
      createdAt: state.projectExport.createdAt,
      outputFormat: state.projectExport.outputFormat,
      voice: state.projectExport.voice,
      speed: state.projectExport.speed,
      creatorPreset: getCreatorPreset(state.projectExport.presetId),
      audioProcessing: state.projectExport.audioProcessing,
      audioDurationSeconds: state.projectExport.audioDurationSeconds || null,
      subtitleCueCount: state.projectExport.subtitleCueCount || 0,
      subtitleTiming: state.projectExport.subtitleTiming || "Not generated",
      notes: [
        "Speech is generated locally with Kokoro English voices.",
        "Subtitle timing is estimated from the measured full-audio duration and phrase weights; it is not phoneme- or word-level forced alignment.",
        "Check subtitle timing and line breaks in your video editor before publishing.",
        "Audio level matching targets approximately -18 dBFS RMS with a -1 dBFS peak ceiling; it is not an EBU R128 LUFS compliance measurement."
      ]
    };
    zip.file("project.json", JSON.stringify(manifest, null, 2));
    zip.file("README.txt", "NextGen AI Voiceover project export\n\nContains the full-script audio, paragraph audio files, original_script.txt, spoken_script.txt, project.json and any generated full_script.srt / full_script.vtt captions.\n\nSubtitle cue times are estimates based on the measured audio runtime and phrase length. Review and adjust them before publishing. Audio level matching is an RMS-based browser process, not certified LUFS mastering.\n");
  }
  const zipBlob = await zip.generateAsync({
    type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 }
  });
  if (state.zipObjectUrl) {
    URL.revokeObjectURL(state.zipObjectUrl);
    state.objectUrls = state.objectUrls.filter(item => item !== state.zipObjectUrl);
  }
  const zipUrl = URL.createObjectURL(zipBlob);
  state.zipObjectUrl = zipUrl;
  state.objectUrls.push(zipUrl);
  elements.zipDownload.href = zipUrl;
  elements.zipDownload.download = "nextgen-voiceover-project.zip";
  elements.zipDownload.textContent = "Download project ZIP ↓";
  elements.zipDownload.hidden = false;
}

async function regenerateParagraph(index) {
  if (state.isGenerating || state.isPreviewing) return;
  const paragraph = state.paragraphs[index];
  if (!paragraph || !state.generatedParagraphBlobs[index] || !state.fullScriptBlob) return;

  const pronunciation = parsePronunciationRules(elements.pronunciationRules.value);
  if (pronunciation.errors.length) {
    setStatus("Fix pronunciation rules on line(s) " + pronunciation.errors.join(", ") + " before regenerating.", "error");
    updatePronunciationStatus();
    return;
  }

  const voice = paragraph.voice || elements.voiceSelect.value || "af_heart";
  const speed = Number(paragraph.speed || elements.speedInput.value);
  if (!state.supportedVoiceIds.has(voice)) {
    setStatus("Choose a valid English voice for paragraph " + (index + 1) + ".", "error");
    return;
  }

  await pauseBackgroundVoicePreviews();
  const controller = new AbortController();
  state.activeAbortController = controller;
  state.isGenerating = true;
  updateBenchmarkButtonState();
  elements.cancelButton.hidden = false;
  elements.cancelButton.disabled = false;
  elements.generateButton.disabled = true;
  elements.scriptInput.disabled = true;
  elements.voiceSelect.disabled = true;
  elements.voiceFilterSelect.disabled = true;
  elements.pronunciationRules.disabled = true;
  elements.speedInput.disabled = true;
  elements.outputFormat.disabled = true;
  setCreatorExportControlsDisabled(true);
  setParagraphEditorBusy(true);
  setProgress(15);
  setStatus("Regenerating paragraph " + (index + 1) + " locally with " + voice + " at " + speed.toFixed(2) + "×…");

  try {
    const tts = state.tts || await getTTS();
    const outputFormat = elements.outputFormat.value;
    if (outputFormat === "mp3") await getLameJS();
    const spokenText = transformTextForSpeech(paragraph.text, pronunciation.rules);
    const blob = await generateSelectedSpeechBlob(
      tts, spokenText, voice, speed, outputFormat, controller.signal
    );
    throwIfAborted(controller.signal);
    state.generatedParagraphBlobs[index] = blob;
    updateParagraphAudioResult(index, blob, voice, speed, outputFormat);
    setProgress(85);
    await refreshZipDownload();
    setProgress(100);
    setStatus(
      "Paragraph " + (index + 1) + " regenerated. Its section file and ZIP bundle are updated; the full-script file keeps the studio-default voice and pace.",
      "good"
    );
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      setStatus("Paragraph regeneration stopped. The previous section audio remains available.", "normal");
    } else {
      console.error(error);
      setProgress(0);
      setStatus("Could not regenerate paragraph " + (index + 1) + ": " + (error?.message || String(error)), "error");
    }
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
    elements.outputFormat.disabled = false;
    setCreatorExportControlsDisabled(false);
    elements.generateButton.disabled = !state.tts || !state.voiceCatalog.length;
    elements.loadButton.disabled = Boolean(state.tts);
    setParagraphEditorBusy(false);
    updatePreviewButtonState();
    updateBenchmarkButtonState();
    resumeVoicePreviewPreparation();
  }
}

function setBenchmarkStatus(message, kind = "normal") {
  elements.benchmarkStatus.textContent = message;
  elements.benchmarkStatus.className = "benchmark-status" + (kind === "error" ? " status-error" : kind === "good" ? " status-good" : "");
}
function previewCard(id) { return [...elements.benchmarkResults.children].find(card => card.dataset.voiceId === id) || null; }
function setPreviewReady(voice, blob, persisted = false, bundled = false) {
  state.voicePreviewBlobs.set(voice.id, blob);
  state.voicePreviewFailedIds.delete(voice.id);
  if (persisted) state.voicePreviewPersistedIds.add(voice.id);
  if (bundled) state.voicePreviewBundledIds.add(voice.id);
  const card = previewCard(voice.id);
  if (!card) return;
  let url = state.voicePreviewObjectUrls.get(voice.id);
  if (!url) { url = URL.createObjectURL(blob); state.voicePreviewObjectUrls.set(voice.id,url); }
  card.classList.remove("benchmark-card-error"); card.classList.add("benchmark-card-ready");
  const label = state.voicePreviewBundledIds.has(voice.id)
    ? "Ready · bundled with app"
    : persisted ? "Ready · saved on this device" : "Ready · this session";
  card.querySelector(".benchmark-card-state").textContent = label;
  const audio = card.querySelector("audio"); audio.src = url; audio.hidden = false;
  const link = card.querySelector("a"); link.href = url; link.hidden = false;
}
function setPreviewError(voice,error) {
  state.voicePreviewFailedIds.add(voice.id);
  const card=previewCard(voice.id); if(!card)return;
  card.classList.add("benchmark-card-error");
  card.querySelector(".benchmark-card-state").textContent="Could not prepare: "+(error?.message||"generation failed");
}
function renderVoicePreviewCards() {
  elements.benchmarkResults.replaceChildren();
  for (const voice of state.voiceCatalog) {
    const card=document.createElement("article"); card.className="benchmark-card"; card.dataset.voiceId=voice.id;
    const title=document.createElement("strong"); title.textContent=voice.name+" · "+voice.id;
    const meta=document.createElement("small"); meta.textContent=voice.languageLabel+" · "+voice.gender;
    const status=document.createElement("small"); status.className="benchmark-card-state"; status.textContent="Waiting to prepare";
    const audio=document.createElement("audio"); audio.controls=true; audio.preload="none"; audio.hidden=true;
    audio.setAttribute("aria-label","Ready-to-play English preview for "+voice.name);
    const download=document.createElement("a"); download.hidden=true; download.download="voice-preview-"+voice.id+".wav"; download.textContent="Download WAV";
    card.append(title,meta,status,audio,download); elements.benchmarkResults.append(card);
    if(state.voicePreviewBlobs.has(voice.id))setPreviewReady(voice,state.voicePreviewBlobs.get(voice.id),state.voicePreviewPersistedIds.has(voice.id));
  }
  updateBenchmarkButtonState();
}

async function loadStaticVoicePreviewLibrary() {
  try {
    const manifestUrl = new URL("./voice-previews/manifest.json", document.baseURI);
    const manifestResponse = await fetch(manifestUrl, { cache: "no-cache" });
    if (!manifestResponse.ok) {
      setBenchmarkStatus("Pre-generated previews are not published yet. The app will prepare any missing previews after the model loads.");
      return 0;
    }
    const manifest = await manifestResponse.json();
    const previewEntries = validateVoicePreviewManifest(manifest, {
      modelId: MODEL_ID,
      modelRevision: MODEL_REVISION,
      previewVersion: VOICE_PREVIEW_CACHE_VERSION,
      voiceIds: [...state.supportedVoiceIds]
    });

    const db = await getVoicePreviewDatabase();
    const results = await Promise.allSettled(previewEntries.map(async (entry) => {
      const voice = state.voiceCatalog.find(item => item.id === entry.id);
      if (!voice) throw new Error("The voice catalogue is missing " + entry.id + ".");
      try {
        const response = await fetch(new URL(entry.file, manifestUrl), { cache: "force-cache" });
        if (!response.ok) throw new Error("Could not load preview " + entry.id + " (HTTP " + response.status + ").");
        const blob = await response.blob();
        await verifyVoicePreviewBlob(entry, blob);
        const saved = await saveVoicePreviewCache(entry.id, blob, db);
        setPreviewReady(voice, blob, saved, true);
        return true;
      } catch (error) {
        setPreviewError(voice, error);
        throw error;
      }
    }));

    const loaded = results.filter(result => result.status === "fulfilled" && result.value).length;
    for (const result of results) {
      if (result.status === "rejected") console.warn("A bundled voice preview could not be loaded.", result.reason);
    }
    if (loaded === state.voiceCatalog.length) {
      setBenchmarkStatus("All " + loaded + " pre-generated English voice previews are loaded and ready.", "good");
    } else {
      setBenchmarkStatus(loaded + " of " + state.voiceCatalog.length + " bundled previews are ready. Missing voices can be prepared by the model.", loaded ? "good" : "error");
    }
    updateBenchmarkButtonState();
    return loaded;
  } catch (error) {
    console.warn("The bundled voice preview library could not be loaded.", error);
    setBenchmarkStatus("Could not load the saved preview library: " + (error?.message || String(error)), "error");
    return 0;
  }
}

function getVoicePreviewDatabase() {
  if(!("indexedDB" in window))return Promise.resolve(null);
  if(!state.voicePreviewDbPromise)state.voicePreviewDbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(VOICE_PREVIEW_DB_NAME,VOICE_PREVIEW_CACHE_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("voice-previews"))request.result.createObjectStore("voice-previews",{keyPath:"voiceId"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Unable to open local voice preview storage."));
  }).catch(error=>{console.warn(error);state.voicePreviewDbPromise=null;return null;});
  return state.voicePreviewDbPromise;
}
async function readVoicePreviewCache(db) {
  if(!db)return [];
  return new Promise(resolve=>{try{
    const request=db.transaction("voice-previews","readonly").objectStore("voice-previews").getAll();
    request.onsuccess=()=>resolve(request.result||[]); request.onerror=()=>resolve([]);
  }catch{resolve([]);}});
}
async function saveVoicePreviewCache(id,blob,db) {
  if(!db)return false;
  return new Promise(resolve=>{try{
    const tx=db.transaction("voice-previews","readwrite");
    tx.objectStore("voice-previews").put({voiceId:id,sampleVersion:VOICE_PREVIEW_CACHE_VERSION,blob,createdAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); tx.onabort=()=>resolve(false);
  }catch{resolve(false);}});
}
async function pauseBackgroundVoicePreviews() {
  const pending=state.voicePreviewPreparePromise;
  if(!pending)return;
  state.voicePreviewPrepareController?.abort();
  await pending.catch(()=>{});
}
function resumeVoicePreviewPreparation() {
  if(state.voicePreviewUserPaused||!state.tts||state.voicePreviewBlobs.size>=state.voiceCatalog.length||state.voicePreviewPreparePromise)return;
  void runVoiceBenchmark();
}
async function runVoiceBenchmark({retryFailures=false}={}) {
  if(!state.tts||!state.voiceCatalog.length||state.isGenerating||state.isPreviewing)return;
  if(state.voicePreviewLibraryPromise) await state.voicePreviewLibraryPromise;
  if(state.voicePreviewBlobs.size >= state.voiceCatalog.length) {
    setBenchmarkStatus("All " + state.voiceCatalog.length + " pre-generated English voice previews are loaded and ready.", "good");
    updateBenchmarkButtonState();
    return;
  }
  if(state.voicePreviewPreparePromise)return state.voicePreviewPreparePromise;
  if(retryFailures)state.voicePreviewFailedIds.clear();
  state.voicePreviewUserPaused=false;
  const controller=new AbortController(); state.voicePreviewPrepareController=controller;
  state.isPreparingVoicePreviews=true; elements.runBenchmarkButton.disabled=true;
  elements.stopBenchmarkButton.hidden=false; elements.stopBenchmarkButton.disabled=false;
  setBenchmarkStatus("Checking this browser for saved voice previews…");
  const task=(async()=>{
    try{
      const db=await getVoicePreviewDatabase(), cached=await readVoicePreviewCache(db);
      throwIfAborted(controller.signal);
      for(const entry of cached){
        if(entry?.sampleVersion!==VOICE_PREVIEW_CACHE_VERSION||!(entry.blob instanceof Blob)||!state.supportedVoiceIds.has(entry.voiceId))continue;
        const voice=state.voiceCatalog.find(item=>item.id===entry.voiceId);
        state.voicePreviewBlobs.set(voice.id,entry.blob); state.voicePreviewPersistedIds.add(voice.id); setPreviewReady(voice,entry.blob,true);
      }
      const total=state.voiceCatalog.length;
      for(const voice of state.voiceCatalog){
        throwIfAborted(controller.signal);
        if(state.voicePreviewBlobs.has(voice.id)||state.voicePreviewFailedIds.has(voice.id))continue;
        const card=previewCard(voice.id);
        if(card){card.classList.remove("benchmark-card-ready","benchmark-card-error");card.querySelector(".benchmark-card-state").textContent="Preparing preview…";}
        setBenchmarkStatus("Preparing "+(state.voicePreviewBlobs.size+1)+" of "+total+" · "+voice.name+" ("+voice.languageLabel+")…");
        await new Promise(resolve=>setTimeout(resolve,0));
        try{
          const blob=await generateSelectedSpeechBlob(state.tts,PREVIEW_TEXT,voice.id,1,"wav",controller.signal);
          throwIfAborted(controller.signal);
          const persisted=await saveVoicePreviewCache(voice.id,blob,db); setPreviewReady(voice,blob,persisted);
        }catch(error){
          if(controller.signal.aborted||error?.name==="AbortError")throw error;
          console.error("Voice preview failed for "+voice.id,error); setPreviewError(voice,error);
        }
        updateBenchmarkButtonState();
      }
      throwIfAborted(controller.signal);
      if(state.voicePreviewFailedIds.size)setBenchmarkStatus(state.voicePreviewBlobs.size+" of "+total+" previews are ready. Retry the remaining voices.","error");
      else if(state.voicePreviewPersistedIds.size===total)setBenchmarkStatus("All "+total+" English voice previews are ready and saved on this device.","good");
      else if(state.voicePreviewBlobs.size===total)setBenchmarkStatus("All "+total+" previews are ready for this session. Browser storage is unavailable, so they cannot be saved for later.","good");
    }catch(error){
      if(controller.signal.aborted||error?.name==="AbortError")setBenchmarkStatus("Preparation paused. Completed previews are kept and will resume after your voiceover finishes.");
      else{console.error(error);setBenchmarkStatus("Voice preview preparation failed: "+(error?.message||String(error)),"error");}
    }
  })();
  state.voicePreviewPreparePromise=task.finally(()=>{
    state.isPreparingVoicePreviews=false; state.voicePreviewPrepareController=null; state.voicePreviewPreparePromise=null;
    elements.stopBenchmarkButton.hidden=true; elements.stopBenchmarkButton.disabled=true; updateBenchmarkButtonState();
  });
  return state.voicePreviewPreparePromise;
}

async function generateAudio() {
  if (state.isGenerating || state.isPreviewing) return;
  const script = elements.scriptInput.value.trim();
  state.paragraphs = reconcileParagraphs(script, state.paragraphs);
  persistParagraphSettings();
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
  rememberRecentVoice(selectedVoice);
  const speed = Number(elements.speedInput.value);
  clearResults();
  await pauseBackgroundVoicePreviews();

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
  setCreatorExportControlsDisabled(true);
  elements.runBenchmarkButton.disabled = true;
  renderParagraphEditor();
  setParagraphEditorBusy(true);
  setProgress(1);

  const outputBlobs = [];
  state.generatedParagraphBlobs = outputBlobs;
  const outputFormat = elements.outputFormat.value;
  const extension = outputFormat === "mp3" ? "mp3" : "wav";
  state.outputExtension = extension;
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
    const spokenScriptForExport = transformTextForSpeech(scriptForSpeech, pronunciation.rules);
    const renderSpeech = (speechText) => generateSelectedSpeechBlob(
      tts, transformTextForSpeech(speechText, pronunciation.rules),
      selectedVoice, speed, outputFormat, controller.signal
    );
    const needsSeparateFullScript = validation.paragraphs.length > 1 ||
      state.paragraphs.some(paragraph => paragraph.voice || paragraph.speed);
    const jobCount = validation.paragraphs.length + (needsSeparateFullScript ? 1 : 0);
    let completedJobs = 0;

    for (let index = 0; index < validation.paragraphs.length; index += 1) {
      const paragraphNumber = index + 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
      const paragraph = state.paragraphs[index] || { text: validation.paragraphs[index], voice: "", speed: "" };
      const paragraphVoice = paragraph.voice || selectedVoice;
      const paragraphSpeed = Number(paragraph.speed || speed);
      setStatus(
        "Generating paragraph " + paragraphNumber + " of " + validation.paragraphs.length +
        " with " + paragraphVoice + " at " + paragraphSpeed.toFixed(2) + "×…"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const spokenText = transformTextForSpeech(validation.paragraphs[index], pronunciation.rules);
      const audioBlob = await generateSelectedSpeechBlob(
        tts, spokenText, paragraphVoice, paragraphSpeed, outputFormat, controller.signal
      );
      throwIfAborted(controller.signal);
      outputBlobs.push(audioBlob);
      updateParagraphEditorControls();
      const filename = "paragraph_" + String(paragraphNumber).padStart(3, "0") + "." + extension;
      const excerpt = validation.paragraphs[index].slice(0, 110);
      addAudioResult({
        title: "Paragraph " + paragraphNumber,
        subtitle: excerpt + (validation.paragraphs[index].length > 110 ? "…" : "") +
          " · " + paragraphVoice + " · " + paragraphSpeed.toFixed(2) + "×",
        filename, blob: audioBlob, kind: "paragraph", index: paragraphNumber, outputFormat
      });
      completedJobs += 1;
      setProgress(5 + (completedJobs / jobCount) * 88);
    }

    let fullScriptBlob;
    if (outputBlobs.length === 1 && !needsSeparateFullScript) {
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
    state.fullScriptBlob = fullScriptBlob;
    state.projectExport = {
      originalScript: scriptForSpeech,
      spokenScript: spokenScriptForExport,
      presetId: elements.creatorPreset.value,
      voice: selectedVoice,
      speed,
      outputFormat,
      audioProcessing: {
        normalize: elements.normalizeAudio.checked,
        trimSilence: elements.trimSilence.checked,
        normalizationMethod: "RMS target -18 dBFS, peak-limited to -1 dBFS"
      },
      createdAt: new Date().toISOString()
    };
    addAudioResult({
      title: "Full script voiceover",
      subtitle: validation.paragraphs.length + " paragraph(s) · " + engineSubtitle + " · " + speed.toFixed(2) +
        "× · studio defaults",
      filename: "full_script." + extension, blob: fullScriptBlob, kind: "full", outputFormat
    });

    setStatus("Preparing estimated SRT and VTT captions from the finished audio…");
    try {
      await createSubtitleExports();
    } catch (subtitleError) {
      console.warn("Subtitle export could not be prepared.", subtitleError);
      state.projectExport.subtitleTiming = "Subtitle timing could not be measured in this browser.";
      elements.subtitleStatus.textContent = "Audio is ready, but caption timing could not be measured: " +
        (subtitleError?.message || String(subtitleError));
      elements.subtitleDownloads.hidden = true;
    }
    setStatus("Packaging audio, captions and script files into the creator project ZIP…");
    setProgress(96);
    await refreshZipDownload();
    elements.resultsPanel.hidden = false;
    elements.resultsSummary.textContent =
      "Full script voiceover + " + validation.paragraphs.length + " paragraph " +
      formatLabel(outputFormat) + " file(s) · " + engineSubtitle + " · " + speed.toFixed(2) + "×" +
      (state.subtitleSrtBlob && state.subtitleVttBlob ? " · SRT + VTT captions ready" : "");
    setProgress(100);
    setStatus("English voiceover complete. Preview the audio, " +
      (state.subtitleSrtBlob && state.subtitleVttBlob ? "download SRT/VTT captions, " : "") +
      "or export the complete creator project ZIP.", "good");
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
    setCreatorExportControlsDisabled(false);
    elements.loadButton.disabled = Boolean(state.tts);
    elements.generateButton.disabled = !state.tts || !state.voiceCatalog.length;
    setParagraphEditorBusy(false);
    updatePreviewButtonState();
    updateBenchmarkButtonState();
    resumeVoicePreviewPreparation();
  }
}

elements.scriptInput.addEventListener("input", () => {
  syncParagraphsFromScript();
  updateScriptCounts();
  saveDraftLocally();
  updateSpokenTextPreview();
  clearResults();
});

elements.voiceSelect.addEventListener("change", () => {
  rememberRecentVoice(elements.voiceSelect.value);
  clearResults();
  renderParagraphEditor();
  updatePreviewButtonState();
});
elements.favoriteVoiceButton.addEventListener("click", toggleFavoriteVoice);
elements.paragraphEditorList.addEventListener("input", handleParagraphEditorInput);
elements.paragraphEditorList.addEventListener("change", handleParagraphEditorChange);
elements.paragraphEditorList.addEventListener("click", handleParagraphEditorAction);
elements.voiceFilterSelect.addEventListener("change", () => {
  renderVoiceSelector();
  clearResults();
});
elements.pronunciationRules.addEventListener("input", () => {
  savePronunciationRules();
  updateSpokenTextPreview();
  clearResults();
});
elements.enhanceSpokenText.addEventListener("change", () => {
  saveSpokenTextPreference();
  updateSpokenTextPreview();
});
elements.runBenchmarkButton.addEventListener("click", () => {
  void runVoiceBenchmark({ retryFailures: true });
});
elements.stopBenchmarkButton.addEventListener("click", () => {
  state.voicePreviewUserPaused = true;
  state.voicePreviewPrepareController?.abort();
  elements.stopBenchmarkButton.disabled = true;
  setBenchmarkStatus("Pausing preview preparation. Completed previews stay ready.");
});
elements.previewVoiceButton.addEventListener("click", previewSelectedVoice);
elements.cancelButton.addEventListener("click", () => {
  if (!state.activeAbortController) return;
  state.activeAbortController.abort();
  elements.cancelButton.disabled = true;
  setStatus("Stopping after the current speech chunk…");
});

elements.outputFormat.addEventListener("change", () => clearResults());
elements.creatorPreset.addEventListener("change", () => {
  persistCreatorExportSettings();
  clearResults();
});
elements.normalizeAudio.addEventListener("change", () => {
  persistCreatorExportSettings();
  clearResults();
});
elements.trimSilence.addEventListener("change", () => {
  persistCreatorExportSettings();
  clearResults();
});

elements.speedInput.addEventListener("input", () => setSpeed(elements.speedInput.value));
for (const button of document.querySelectorAll("[data-speed-preset]")) {
  button.addEventListener("click", () => setSpeed(button.dataset.speedPreset));
}

elements.loadButton.addEventListener("click", loadModel);
elements.generateButton.addEventListener("click", generateAudio);

elements.clearButton.addEventListener("click", () => {
  elements.scriptInput.value = "";
  state.paragraphs = [];
  persistParagraphSettings();
  renderParagraphEditor();
  saveDraftLocally();
  updateScriptCounts();
  clearResults();
  setStatus("Script cleared. The loaded voice model remains ready in this tab.");
  setProgress(0);
});

restoreDraftLocally();
restorePronunciationRules();
restoreSpokenTextPreference();
restoreVoicePreferences();
restoreParagraphSettings();
restoreCreatorExportSettings();
state.voiceCatalog = getCompleteVoiceCatalog();
state.supportedVoiceIds = new Set(state.voiceCatalog.map(voice => voice.id));
renderVoiceSelector();
renderVoicePreviewCards();
state.voicePreviewLibraryPromise = loadStaticVoicePreviewLibrary();
updateScriptCounts();
renderParagraphEditor();
updateSpokenTextPreview();
setSpeed(elements.speedInput.value);

window.addEventListener("beforeunload", () => {
  revokeObjectUrls();
  for (const url of state.voicePreviewObjectUrls.values()) URL.revokeObjectURL(url);
  state.voicePreviewObjectUrls.clear();
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
