import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/lib/text.js",
  "src/lib/voice-catalog.js",
  "src/lib/pronunciation.js",
  "src/lib/narration.js",
  "src/lib/paragraph-editor.js",
  "src/lib/subtitles.js",
  "src/lib/audio-processing.js",
  "src/lib/audio-metadata.js",
  "tests/subtitles.test.js",
  "tests/audio-processing.test.js",
  "backend/app.py",
  "backend/voice_catalog.py",
  "backend/Dockerfile",
  "backend/requirements.txt",
  "backend/test_voice_catalog.py",
  "backend/README.md",
  "tests/voice-catalog.test.js",
  "tests/pronunciation.test.js",
  "tests/narration.test.js",
  "tests/paragraph-editor.test.js",
  "package.json",
  "vite.config.js",
  "capacitor.config.json",
  "electron/main.cjs",
  "public/manifest.webmanifest",
  "public/sw.js",
  "public/icon.svg",
  "scripts/download-model.js",
  "scripts/copy-ort-assets.js"
];

for (const file of requiredFiles) await access(new URL("../" + file, import.meta.url));

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

const requiredHtmlMarkers = [
  'id="scriptInput"',
  'id="paragraphEditorDetails"',
  'id="paragraphEditorStatus"',
  'id="paragraphEditorList"',
  'id="voiceFilterSelect"',
  'id="pronunciationRules"',
  'id="pronunciationStatus"',
  'id="speedInput"',
  'id="paragraphCount"',
  'id="loadButton"',
  'id="generateButton"',
  'id="fullScriptAudio"',
  'id="fullScriptDownload"',
  'id="zipDownload"',
  'id="creatorPreset"',
  'id="normalizeAudio"',
  'id="trimSilence"',
  'id="subtitleDownloads"',
  'id="srtDownload"',
  'id="vttDownload"',
  'id="subtitleStatus"',
  'id="draftStatus"',
  'id="previewVoiceButton"',
  'id="voicePreviewAudio"',
  'id="cancelButton"',
  'id="enhanceSpokenText"',
  'id="runBenchmarkButton"',
  'id="stopBenchmarkButton"',
  'id="benchmarkStatus"',
  'id="benchmarkResults"',
  'src="./src/main.js"',
  'href="./src/styles.css"',
  'rel="manifest"'
];

for (const marker of requiredHtmlMarkers) {
  // Generated audio elements are created at runtime, so their IDs are checked in the script.
  if (marker === 'id="fullScriptAudio"' || marker === 'id="fullScriptDownload"') continue;
  if (!html.includes(marker)) throw new Error("Missing required HTML marker: " + marker);
}

if (!main.includes("Kokoro-82M-v1.0-ONNX")) throw new Error("The browser runtime model ID is missing.");
if (!main.includes('const KOKORO_PACKAGE = "kokoro-js@1.2.1"') || !main.includes('import("kokoro-js")')) throw new Error("The Kokoro.js runtime must be pinned and bundled from npm.");
if (!main.includes('device: "wasm"')) throw new Error("The baseline browser test must explicitly use WASM.");
if (!html.includes('min="0.50" max="2.00" step="0.05"')) throw new Error("The speed control must support 0.50×–2.00×.");
if (!main.includes("useBrowserCache = true") || !main.includes("useWasmCache = true")) throw new Error("Persistent browser model and WASM caching must remain enabled.");
if (!main.includes("saveDraftLocally") || !main.includes("restoreDraftLocally") || !main.includes("nextgen-voiceover-draft-v1")) throw new Error("Local script draft save and recovery are required.");
if (!main.includes("previewSelectedVoice") || !main.includes("PREVIEW_TEXT")) throw new Error("Selected voice audition is required.");
if (!main.includes("applyPronunciationRules") || !main.includes("parsePronunciationRules") ||
    !main.includes("nextgen-voiceover-pronunciation-v1")) {
  throw new Error("Local English pronunciation rules and browser persistence are required.");
}
if (/supertonic|onnxruntime-web|speechEngineSelect|multilingual/.test(main) ||
    /supertonic|speechEngineSelect|multilingual|OpenRAIL-M/.test(html)) {
  throw new Error("The published app must remain focused on the English-only Kokoro engine.");
}
if (/MediaPipe|multilingualVoiceIds|loadMultilingualButton|kokoro_int8_fp16/.test(main)) {
  throw new Error("The failed local Kokoro multilingual implementation must remain removed.");
}
if (!main.includes("activeAbortController") || !main.includes("Generation stopped.")) throw new Error("Generation cancellation is required.");
if (!main.includes("await loadModel();") || !main.includes("navigator.storage.persist")) throw new Error("The model must restore automatically and request persistent browser storage.");
if (!main.includes("normalizeVoiceCatalog(tts?.voices ?? [])")) throw new Error("The app must enable only voices reported by a real runtime.");
if (!main.includes("state.supportedVoiceIds.has(selectedVoice)") ||
    !main.includes("state.voiceCatalog") || !main.includes("renderVoiceSelector")) {
  throw new Error("Selected voices must map to the filtered 28-voice English catalogue.");
}
if (!main.includes("data-speed-preset") || !html.includes('data-speed-preset="1.00"')) {
  throw new Error("The English speaking-pace presets are missing.");
}
if (!html.includes('value="american"') || !html.includes('value="british"') ||
    !html.includes('value="female"') || !html.includes('value="male"')) {
  throw new Error("Accent and gender voice filters are required.");
}
if (!main.includes('import("lamejs")') || !main.includes('import("jszip")') || !main.includes("createMp3BlobFromSamples")) throw new Error("Bundled MP3 and ZIP export support is missing.");
if (!html.includes('id="outputFormat"') || !html.includes('value="mp3"')) throw new Error("A user-selectable output format is required.");
const backendApp = await readFile(new URL("../backend/app.py", import.meta.url), "utf8");
const backendCatalog = await readFile(new URL("../backend/voice_catalog.py", import.meta.url), "utf8");
if (!backendApp.includes("KPipeline(lang_code=code") || !backendApp.includes("KModel(repo_id=MODEL_REPO_ID)")) throw new Error("The server must use the Kokoro Python multilingual pipeline.");
if (!backendApp.includes('"/v1/audio/speech"') || !backendApp.includes('"/v1/voices"') || !backendApp.includes("LANGUAGE_TEST_TEXT")) throw new Error("The multilingual API endpoints and per-language checks are required.");
if (!backendCatalog.includes('"zf_xiaoyi"') || !backendCatalog.includes('"ff_siwis"') || !backendCatalog.includes('"hm_psi"')) throw new Error("The 54-voice server catalogue is incomplete.");
const voiceCatalog = await readFile(new URL("../src/lib/voice-catalog.js", import.meta.url), "utf8");
if (!voiceCatalog.includes("af_heart") || !voiceCatalog.includes("bf_emma") ||
    /zf_xiaoyi|ff_siwis|hf_alpha|pf_dora/.test(voiceCatalog) ||
    !voiceCatalog.includes("^[ab][fm]_")) {
  throw new Error("The published voice catalogue must contain only American and British English IDs.");
}
if (!main.includes('filter === "american"') || !main.includes('filter === "british"') ||
    !main.includes('filter === "female"') || !main.includes('filter === "male"')) {
  throw new Error("English accent and voice-type filters are incomplete.");
}
if (main.includes("tts.list_voices()")) throw new Error("Do not use list_voices() as a catalogue return value.");
if (!main.includes('id = "fullScriptAudio"') || !main.includes('download.id = "fullScriptDownload"')) {
  throw new Error("The app must provide a whole-script audio preview and WAV download.");
}
if (html.includes("Performance diagnostics") || html.includes("modelLoadMetric") || html.includes("synthesisMetric")) {
  throw new Error("Performance diagnostics must not be part of the public app UI.");
}
if (!main.includes("validateParagraphInput") ||
    !main.includes("generateSelectedSpeechBlob(") ||
    !main.includes("renderSpeech(scriptForSpeech)") ||
    !main.includes("transformTextForSpeech(speechText, pronunciation.rules)") ||
    !main.includes("prepareNarrationText") || !main.includes("splitNarrationSections")) {
  throw new Error("English paragraph generation, smart spoken-text preparation and paragraph-aware synthesis are required.");
}
if (!main.includes("tts.stream(") || !main.includes("createWavBlobFromSamples")) {
  throw new Error("Long narration must use streamed audio chunks joined into one WAV.");
}
if (!main.includes("rate * 0.38") || !main.includes("rate * 0.12")) {
  throw new Error("Distinct paragraph and stream-chunk pauses are required.");
}
if (!main.includes("runVoiceBenchmark") || !main.includes("renderVoicePreviewCards") ||
    !main.includes("setPreviewReady") || !main.includes("getVoicePreviewDatabase") ||
    !main.includes("saveVoicePreviewCache") || !html.includes('id="voiceBenchmark"')) {
  throw new Error("The automatically prepared and locally cached 28-voice English preview library is required.");
}

if (!main.includes("processAudioSamples") || !main.includes("getAudioDurationSeconds") ||
    !main.includes("buildSubtitleCues") || !main.includes("serializeSrt") ||
    !main.includes("serializeVtt") || !main.includes("createSubtitleExports")) {
  throw new Error("Creator audio finishing and SRT/VTT subtitle exports are required.");
}
if (!main.includes("original_script.txt") || !main.includes("spoken_script.txt") ||
    !main.includes("project.json") || !main.includes("full_script.srt") ||
    !main.includes("full_script.vtt")) {
  throw new Error("The project ZIP must include audio, captions, original script and prepared spoken text.");
}
if (!html.includes('value="shorts"') || !html.includes('value="longform"') ||
    !html.includes('value="podcast"') || !html.includes('value="narration"') ||
    !html.includes('id="normalizeAudio"') || !html.includes('id="trimSilence"')) {
  throw new Error("Creator presets and optional audio finishing controls are required.");
}
if (!main.includes("reconcileParagraphs") || !main.includes("serializeParagraphs") ||
    !main.includes("moveParagraph") || !main.includes("splitParagraph") ||
    !main.includes("mergeParagraphWithNext") || !main.includes("regenerateParagraph") ||
    !main.includes("refreshZipDownload")) {
  throw new Error("Paragraph editing, ordering, per-section overrides and regeneration are required.");
}
if (!main.includes("paragraph.voice || selectedVoice") ||
    !main.includes("paragraph.speed || speed") ||
    !main.includes("state.generatedParagraphBlobs[index]")) {
  throw new Error("Per-paragraph voice and speaking-pace overrides must apply to the section exports.");
}



const pwaManifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const capacitorConfig = JSON.parse(await readFile(new URL("../capacitor.config.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (pwaManifest.name !== "NextGen AI Voiceover" || pwaManifest.display !== "standalone" ||
    !pwaManifest.icons?.length || !serviceWorker.includes("caches.open") ||
    !serviceWorker.includes("huggingface.co")) {
  throw new Error("Installable PWA metadata and offline runtime caching are required.");
}
if (capacitorConfig.webDir !== "dist" || !packageJson.dependencies?.["@capacitor/android"] ||
    packageJson.dependencies?.["@capacitor/ios"]) {
  throw new Error("Android packaging must be configured without adding iOS distribution.");
}
if (!main.includes("PACKAGED_RUNTIME") || !main.includes("allowRemoteModels = false") ||
    !main.includes('localModelPath = new URL("../models/", import.meta.url).href') ||
    !main.includes('new URL("../ort/", import.meta.url).href')) {
  throw new Error("Packaged native apps must load the local Kokoro model and local ONNX Runtime WASM.");
}
if (!packageJson.scripts?.["build:offline"] || !packageJson.scripts?.["desktop:package"] ||
    !packageJson.scripts?.["android:sync"] || !packageJson.build?.win ||
    !packageJson.build?.mac || !packageJson.build?.linux) {
  throw new Error("Cross-platform desktop and Android build scripts are incomplete.");
}

console.log("Static application validation passed.");
console.log("English-only voice catalogue, pronunciation tools, speed presets, paragraph controls and full-script exports verified.");
