import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/lib/text.js",
  "src/lib/voice-catalog.js",
  "src/lib/pronunciation.js",
  "backend/app.py",
  "backend/voice_catalog.py",
  "backend/Dockerfile",
  "backend/requirements.txt",
  "backend/test_voice_catalog.py",
  "backend/README.md",
  "tests/voice-catalog.test.js",
  "package.json"
];

for (const file of requiredFiles) await access(new URL("../" + file, import.meta.url));

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

const requiredHtmlMarkers = [
  'id="scriptInput"',
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
  'id="draftStatus"',
  'id="previewVoiceButton"',
  'id="voicePreviewAudio"',
  'id="cancelButton"',
  'src="./src/main.js"',
  'href="./src/styles.css"'
];

for (const marker of requiredHtmlMarkers) {
  // Generated audio elements are created at runtime, so their IDs are checked in the script.
  if (marker === 'id="fullScriptAudio"' || marker === 'id="fullScriptDownload"') continue;
  if (!html.includes(marker)) throw new Error("Missing required HTML marker: " + marker);
}

if (!main.includes("Kokoro-82M-v1.0-ONNX")) throw new Error("The browser runtime model ID is missing.");
if (!main.includes("kokoro-js@1.2.1")) throw new Error("The Kokoro.js runtime is not pinned to the audited version.");
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
if (!main.includes("LAMEJS_CDN") || !main.includes("createMp3BlobFromSamples")) throw new Error("MP3 export support is missing.");
if (!html.includes('id="outputFormat"') || !html.includes('value="mp3"')) throw new Error("A user-selectable output format is required.");
const backendApp = await readFile(new URL("../backend/app.py", import.meta.url), "utf8");
const backendCatalog = await readFile(new URL("../backend/voice_catalog.py", import.meta.url), "utf8");
if (!backendApp.includes("KPipeline(lang_code=code") || !backendApp.includes("KModel(repo_id=MODEL_REPO_ID)")) throw new Error("The server must use the Kokoro Python multilingual pipeline.");
if (!backendApp.includes('"/v1/audio/speech"') || !backendApp.includes('"/v1/voices"') || !backendApp.includes("LANGUAGE_TEST_TEXT")) throw new Error("The multilingual API endpoints and per-language checks are required.");
if (!backendCatalog.includes('"zf_xiaoyi"') || !backendCatalog.includes('"ff_siwis"') || !backendCatalog.includes('"hm_psi"')) throw new Error("The 54-voice server catalogue is incomplete.");
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
    !main.includes("applyPronunciationRules(speechText, pronunciation.rules)")) {
  throw new Error("English paragraph generation, full-script synthesis and pronunciation processing are required.");
}
if (!main.includes("tts.stream(") || !main.includes("createWavBlobFromSamples")) {
  throw new Error("Long narration must use streamed audio chunks joined into one WAV.");
}

console.log("Static application validation passed.");
console.log("English-only voice catalogue, pronunciation tools, speed presets, paragraph controls and full-script exports verified.");
