import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.PAGES_URL || "https://allinallsolutions2025-coder.github.io/nextgen-ai-voiceover/";
const reportDir = process.env.REPORT_DIR || "artifacts";
const reportPath = join(reportDir, "pages-browser-smoke-test.json");
const report = {
  targetUrl,
  startedAt: new Date().toISOString(),
  browser: "Chromium (Playwright)",
  checks: {},
  timings: {},
  environment: {},
  network: [],
  voiceTests: [],
  errors: []
};
let browser;
let temporaryDirectory;

function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin + url.pathname;
  } catch {
    return String(raw).slice(0, 180);
  }
}

async function saveReport() {
  await mkdir(reportDir, { recursive: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function waitForGeneration(page) {
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusMessage")?.textContent || "";
    return status.startsWith("Preparing the MP3 encoder") ||
      status.startsWith("Generating paragraph") ||
      status.startsWith("Generating one continuous voiceover") ||
      status.startsWith("Generation failed:");
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusMessage")?.textContent || "";
    return status.startsWith("Voiceover complete.") || status.startsWith("Generation failed:");
  }, null, { timeout: 8 * 60 * 1000 });
  const status = (await page.locator("#statusMessage").innerText()).trim();
  assert(status.startsWith("Voiceover complete."), "Speech generation failed: " + status);
}

async function inspectAudio(page, selector, index = null) {
  const locator = index === null ? page.locator(selector) : page.locator(selector).nth(index);
  return locator.evaluate(async audio => {
    const response = await fetch(audio.currentSrc || audio.src);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const ascii = Array.from(bytes, value => String.fromCharCode(value)).join("");
    return {
      status: response.status,
      sizeBytes: blob.size,
      riff: ascii.slice(0, 4),
      wave: ascii.slice(8, 12),
      validWav: ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WAVE",
      validMp3: ascii.slice(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    };
  });
}

try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on("pageerror", error => report.errors.push("pageerror: " + error.message));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push("console: " + message.text());
  });
  page.on("requestfailed", request => {
    report.errors.push("requestfailed: " + safeUrl(request.url()) + " — " + (request.failure()?.errorText || "unknown"));
  });
  page.on("response", response => {
    const request = response.request();
    const url = safeUrl(response.url());
    if (/huggingface|hf\.co|jsdelivr|onnx|kokoro/i.test(url)) {
      report.network.push({
        url, status: response.status(), resourceType: request.resourceType(),
        contentLength: response.headers()["content-length"] || null
      });
    }
  });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  assert(response, "Pages navigation did not return an HTTP response.");
  assert.equal(response.status(), 200, "Published page should return HTTP 200.");
  report.checks.pagesHttp200 = true;
  report.checks.pageTitle = await page.title();
  assert.match(report.checks.pageTitle, /NextGen AI Voiceover/i);
  report.checks.applicationShellLoaded = await page.locator("#scriptInput").count() === 1;
  assert.equal(report.checks.applicationShellLoaded, true, "Application shell was not found.");
  report.checks.elevenLabsInspiredWorkspace = await page.locator(".sidebar .main-nav .nav-item.active").count() === 1;
  assert.equal(report.checks.elevenLabsInspiredWorkspace, true, "Studio sidebar navigation did not render.");
  report.checks.diagnosticsRemoved =
    await page.locator("#metricsHeading, #modelLoadMetric, #synthesisMetric, #totalMetric").count() === 0;
  assert.equal(report.checks.diagnosticsRemoved, true, "Performance diagnostics should be absent.");
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    secureContext: window.isSecureContext
  }));
  assert.equal(report.environment.secureContext, true, "Pages should be served over HTTPS.");

  const modelLoadStarted = Date.now();
  await page.waitForFunction(() => {
    const badge = document.querySelector("#modelBadge")?.textContent || "";
    return badge.includes("Model ready") || badge.includes("Model load failed");
  }, null, { timeout: 8 * 60 * 1000 });
  const modelBadge = (await page.locator("#modelBadge").innerText()).trim();
  report.timings.modelLoadSecondsWallClock = Number(((Date.now() - modelLoadStarted) / 1000).toFixed(2));
  report.checks.modelLoaded = modelBadge.includes("Model ready");
  assert.equal(report.checks.modelLoaded, true, "Kokoro model failed to load: " + await page.locator("#statusMessage").innerText());
  assert.equal(await page.locator("#loadButton").isDisabled(), true, "Model should restore automatically without a manual load click.");
  report.cacheStorageKeys = await page.evaluate(() => window.caches ? caches.keys() : []);
  report.checks.browserModelCacheAvailable = report.cacheStorageKeys.includes("transformers-cache");
  assert.equal(report.checks.browserModelCacheAvailable, true, "Transformers.js browser model cache was not created.");
  const largeModelResponsesBeforeReload = report.network.filter(item => item.url.includes("cdn.hf.co") && Number(item.contentLength || 0) > 10000000).length;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => {
    const badge = document.querySelector("#modelBadge")?.textContent || "";
    return badge.includes("Model ready") || badge.includes("Model load failed");
  }, null, { timeout: 8 * 60 * 1000 });
  assert((await page.locator("#modelBadge").innerText()).includes("Model ready"), "Cached model failed to restore after reload.");
  const largeModelResponsesAfterReload = report.network.filter(item => item.url.includes("cdn.hf.co") && Number(item.contentLength || 0) > 10000000).length;
  report.checks.modelWeightsReusedAfterReload = largeModelResponsesAfterReload === largeModelResponsesBeforeReload;
  assert.equal(report.checks.modelWeightsReusedAfterReload, true, "The large ONNX model was downloaded again after reload.");
  report.checks.voicePreviewControlsPresent =
    await page.locator("#previewVoiceButton, #voicePreviewAudio").count() === 2;
  assert.equal(report.checks.voicePreviewControlsPresent, true, "Voice preview controls are missing.");
  report.checks.cancelControlPresent = await page.locator("#cancelButton").count() === 1;
  assert.equal(report.checks.cancelControlPresent, true, "Generation stop control is missing.");
  report.checks.localDraftStatusPresent = await page.locator("#draftStatus").count() === 1;
  assert.equal(report.checks.localDraftStatusPresent, true, "Local draft status is missing.");

  const voiceOptions = await page.locator("#voiceSelect option").evaluateAll(options => options.map(option => ({
    id: option.value, label: option.textContent.trim(), disabled: option.disabled
  })));
  const voices = voiceOptions.filter(option => !option.disabled).map(option => option.id);
  const unavailableVoices = voiceOptions.filter(option => option.disabled);
  report.voiceCount = voiceOptions.length;
  report.runtimeVoiceCount = voices.length;
  report.multilingualVoicesRequireServer = unavailableVoices.length;
  report.voiceSample = voiceOptions.slice(0, 12);
  report.requiredVoicesPresent = ["am_adam", "af_heart", "bf_emma", "bm_george"].every(id => voices.includes(id));
  assert.equal(voiceOptions.length, 54, "Expected the full 54-entry Kokoro catalogue to remain visible.");
  assert.equal(voices.length, 28, "Expected only 28 browser-supported English voices to be selectable.");
  assert.equal(unavailableVoices.length, 26, "Expected 26 multilingual voices to be disabled until a server engine is connected.");
  assert.equal(report.requiredVoicesPresent, true, "One or more expected browser voices are missing.");
  assert(unavailableVoices.every(option => option.label.includes("load locally")), "Disabled multilingual options must explain that they can be loaded on this device.");
  assert(unavailableVoices.some(option => option.id === "zf_xiaoyi" && option.disabled), "zf_xiaoyi must not be selectable in the English-only browser engine.");
  report.checks.multipleVoicesDiscovered = true;
  report.checks.onlyRuntimeSupportedVoicesSelectable = true;
  report.checks.multilingualVoicesClearlyDisabled = true;
  assert.equal(await page.locator("#outputFormat option").count(), 2, "Expected WAV and MP3 output choices.");

  temporaryDirectory = await mkdtemp(join(tmpdir(), "nextgen-pages-test-"));

  // Two paragraphs verify the individual WAVs and one continuous full-script WAV.
  await page.locator("#voiceSelect").selectOption("am_adam");
  const firstParagraph = "This is the first short paragraph for the voiceover export test.";
  const secondParagraph = "This is the second paragraph. The full script should also be generated as one continuous voiceover.";
  const draftText = firstParagraph + "\n\n" + secondParagraph;
  await page.locator("#scriptInput").fill(draftText);
  report.scriptParagraphCharacterCounts = [firstParagraph.length, secondParagraph.length];
  assert.equal(await page.locator("#paragraphCount").innerText(), "2 paragraphs");
  assert.equal(await page.evaluate(() => localStorage.getItem("nextgen-voiceover-draft-v1")), draftText,
    "The script draft was not saved locally.");
  report.checks.localDraftAutosave = true;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (document.querySelector("#modelBadge")?.textContent || "").includes("Model ready"),
    null, { timeout: 8 * 60 * 1000 });
  assert.equal(await page.locator("#scriptInput").inputValue(), draftText, "The local script draft was not restored after reload.");
  report.checks.localDraftRecovery = true;
  await page.locator("#voiceSelect").selectOption("am_adam");
  await page.locator("#previewVoiceButton").click();
  await page.waitForFunction(() => {
    const player = document.querySelector("#voicePreviewAudio");
    return player && !player.hidden && player.src.startsWith("blob:");
  }, null, { timeout: 120000 });
  const voicePreview = await inspectAudio(page, "#voicePreviewAudio");
  assert(voicePreview.validWav && voicePreview.sizeBytes > 44, "Voice preview did not generate a valid WAV.");
  report.voicePreview = voicePreview;
  report.checks.selectedVoicePreview = true;
  await page.locator("#generateButton").click();
  await waitForGeneration(page);

  const fullWav = await inspectAudio(page, "#fullScriptAudio audio");
  const paragraphWavs = [];
  const paragraphCount = await page.locator(".paragraph-audio-card").count();
  assert.equal(paragraphCount, 2, "Expected a separate audio output for each paragraph.");
  for (let i = 0; i < paragraphCount; i += 1) {
    paragraphWavs.push(await inspectAudio(page, ".paragraph-audio-card audio", i));
  }
  report.paragraphWavs = paragraphWavs;
  report.fullScriptWav = fullWav;
  assert(fullWav.sizeBytes > 44 && fullWav.validWav, "Full-script output is not a valid WAV.");
  assert(fullWav.sizeBytes > paragraphWavs[0].sizeBytes, "Full-script audio should contain both paragraphs.");
  assert.equal(fullWav.status, 200, "Full-script audio blob could not be read.");
  assert(paragraphWavs.every(item => item.validWav && item.sizeBytes > 44), "One or more paragraph outputs are invalid.");
  assert((await page.locator("#fullScriptDownload").getAttribute("download")).endsWith(".wav"), "WAV selection did not produce a WAV filename.");
  report.checks.paragraphWavOutputs = true;
  report.checks.fullScriptWavOutput = true;

  const zipCheck = await page.locator("#zipDownload").evaluate(async anchor => {
    const response = await fetch(anchor.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const signature = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return {
      status: response.status, sizeBytes: blob.size, signature,
      validZip: signature === "504b0304" || signature === "504b0506" || signature === "504b0708"
    };
  });
  report.zip = zipCheck;
  assert.equal(zipCheck.status, 200, "Generated ZIP blob could not be read.");
  assert(zipCheck.sizeBytes > 22, "Generated ZIP is unexpectedly empty.");
  assert.equal(zipCheck.validZip, true, "Generated ZIP signature is invalid.");
  report.checks.zipValid = true;

  const [zipDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#zipDownload").click()]);
  const zipPath = join(temporaryDirectory, zipDownload.suggestedFilename());
  await zipDownload.saveAs(zipPath);
  const zipStats = await stat(zipPath);
  report.zip.downloadedFilename = zipDownload.suggestedFilename();
  report.zip.downloadedSizeBytes = zipStats.size;
  assert.equal(zipStats.size, zipCheck.sizeBytes, "ZIP download size differs from generated archive.");
  report.checks.zipDownloadWorks = true;

  const [fullDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#fullScriptDownload").click()]);
  const fullPath = join(temporaryDirectory, fullDownload.suggestedFilename());
  await fullDownload.saveAs(fullPath);
  const fullStats = await stat(fullPath);
  report.fullScriptDownload = { filename: fullDownload.suggestedFilename(), sizeBytes: fullStats.size };
  assert.equal(fullStats.size, fullWav.sizeBytes, "Full-script WAV download size mismatch.");
  report.checks.fullScriptWavDownloadWorks = true;

  const [paragraphDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(".paragraph-audio-card .audio-download").first().click()
  ]);
  const paragraphPath = join(temporaryDirectory, paragraphDownload.suggestedFilename());
  await paragraphDownload.saveAs(paragraphPath);
  const paragraphStats = await stat(paragraphPath);
  assert.equal(paragraphStats.size, paragraphWavs[0].sizeBytes, "Paragraph WAV download size mismatch.");
  report.paragraphDownload = { filename: paragraphDownload.suggestedFilename(), sizeBytes: paragraphStats.size };
  report.checks.paragraphWavDownloadWorks = true;

  // Verify MP3 encoding, preview MIME type, and download extension.
  await page.locator("#outputFormat").selectOption("mp3");
  await page.locator("#scriptInput").fill("This is a short MP3 export test.");
  await page.locator("#generateButton").click();
  await waitForGeneration(page);
  const mp3 = await inspectAudio(page, "#fullScriptAudio audio");
  assert(mp3.validMp3 && mp3.sizeBytes > 100, "MP3 export did not produce a valid MP3 stream.");
  report.mp3Output = mp3;
  assert((await page.locator("#fullScriptDownload").getAttribute("download")).endsWith(".mp3"), "MP3 selection did not produce an MP3 filename.");
  assert.equal(await page.locator("#fullScriptAudio .format-tag").innerText(), "MP3");
  report.checks.mp3Output = true;

  // Test the multilingual client path with a deterministic in-browser API mock.
  const mockEngineUrl = "https://mock-multilingual-engine.local";
  const sampleCount = 12000;
  const mockWav = Buffer.alloc(44 + sampleCount * 2);
  mockWav.write("RIFF", 0);
  mockWav.writeUInt32LE(36 + sampleCount * 2, 4);
  mockWav.write("WAVE", 8);
  mockWav.write("fmt ", 12);
  mockWav.writeUInt32LE(16, 16);
  mockWav.writeUInt16LE(1, 20);
  mockWav.writeUInt16LE(1, 22);
  mockWav.writeUInt32LE(24000, 24);
  mockWav.writeUInt32LE(48000, 28);
  mockWav.writeUInt16LE(2, 32);
  mockWav.writeUInt16LE(16, 34);
  mockWav.write("data", 36);
  mockWav.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i += 1) {
    mockWav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 24000) * 8000), 44 + i * 2);
  }
  const allowedOrigin = new URL(targetUrl).origin;
  let remoteCalls = 0;
  await page.route(mockEngineUrl + "/**", async route => {
    const request = route.request();
    const common = {
      "access-control-allow-origin": allowedOrigin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-API-Key"
    };
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: common });
    } else if (pathname === "/health") {
      await route.fulfill({ status: 200, headers: { ...common, "content-type": "application/json" },
        body: JSON.stringify({ status: "ready", device: "mock", voice_count: 26 }) });
    } else if (pathname === "/v1/voices") {
      await route.fulfill({ status: 200, headers: { ...common, "content-type": "application/json" },
        body: JSON.stringify({ voices: unavailableVoices.map(option => ({ id: option.id })) }) });
    } else if (pathname === "/v1/audio/speech" && request.method() === "POST") {
      const body = request.postDataJSON();
      assert.equal(body.voice, "zf_xiaoyi");
      assert(body.input && body.input.length > 0);
      assert(body.speed >= 0.5 && body.speed <= 2);
      remoteCalls += 1;
      await route.fulfill({ status: 200, headers: { ...common, "content-type": "audio/wav" }, body: mockWav });
    } else {
      await route.fulfill({ status: 404, headers: common, body: "not found" });
    }
  });

  await page.locator("#serverApiUrl").fill(mockEngineUrl);
  await page.locator("#connectServerButton").click();
  await page.waitForFunction(() => (document.querySelector("#serverConnectionStatus")?.textContent || "").startsWith("Connected"));
  assert.equal(await page.locator("#voiceSelect option[value='zf_xiaoyi']").isDisabled(), false);
  await page.locator("#voiceSelect").selectOption("zf_xiaoyi");
  await page.locator("#outputFormat").selectOption("wav");
  await page.locator("#scriptInput").fill("你好，这是多语言语音测试。");
  await page.locator("#generateButton").click();
  await waitForGeneration(page);
  const remoteWav = await inspectAudio(page, "#fullScriptAudio audio");
  assert(remoteWav.validWav && remoteWav.sizeBytes > 44);
  assert.equal(remoteCalls, 1);
  report.remoteWavOutput = remoteWav;
  report.checks.multilingualVoiceEnabledByServerCatalogue = true;
  report.checks.multilingualRemoteWavOutput = true;

  await page.locator("#outputFormat").selectOption("mp3");
  await page.locator("#scriptInput").fill("你好，这是 MP3 格式测试。");
  await page.locator("#generateButton").click();
  await waitForGeneration(page);
  const remoteMp3 = await inspectAudio(page, "#fullScriptAudio audio");
  assert(remoteMp3.validMp3 && remoteMp3.sizeBytes > 100);
  assert.equal(remoteCalls, 2);
  report.remoteMp3Output = remoteMp3;
  report.checks.multilingualRemoteMp3Output = true;

  await page.locator("#serverApiUrl").fill("");
  await page.locator("#connectServerButton").click();
  assert.equal(await page.locator("#voiceSelect option[value='zf_xiaoyi']").isDisabled(), true);
  report.checks.multilingualServerDisconnectWorks = true;
  await page.locator("#outputFormat").selectOption("wav");

  // Load all remaining Kokoro voices directly in the browser, without a server.
  await page.locator("#loadMultilingualButton").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#multilingualModelStatus")?.textContent || "";
    return status.startsWith("Ready · all 54") || status.startsWith("Could not load");
  }, null, { timeout: 12 * 60 * 1000 });
  const multilingualStatus = await page.locator("#multilingualModelStatus").innerText();
  assert(multilingualStatus.startsWith("Ready · all 54"), "Local 54-voice model failed: " + multilingualStatus);
  report.checks.localMultilingualModelLoaded = true;

  const localVoiceOptions = await page.locator("#voiceSelect option").evaluateAll(options => options.map(option => ({
    id: option.value, disabled: option.disabled, label: option.textContent.trim()
  })));
  const localVoiceIds = localVoiceOptions.filter(option => !option.disabled).map(option => option.id);
  assert.equal(localVoiceIds.length, 54, "Expected all 54 Kokoro voices to be selectable after local model load.");
  assert(localVoiceOptions.some(option => option.id === "zf_xiaoyi" && !option.disabled && option.label.includes("local")),
    "A previously server-only Chinese voice was not enabled locally.");
  report.localVoiceCount = localVoiceIds.length;
  report.checks.all54VoicesAvailableWithoutServer = true;

  const multilingualSamples = [
    { voice: "ef_dora", text: "La síntesis de voz funciona directamente en este dispositivo." },
    { voice: "ff_siwis", text: "Bonjour, cette voix française fonctionne directement dans votre navigateur." },
    { voice: "hf_alpha", text: "नमस्ते, यह आवाज़ सीधे आपके डिवाइस पर तैयार होती है।" },
    { voice: "if_sara", text: "Ciao, questa voce italiana viene generata direttamente sul dispositivo." },
    { voice: "jf_alpha", text: "こんにちは。この音声はブラウザー内で生成されます。" },
    { voice: "pf_dora", text: "Olá, esta voz em português funciona diretamente no seu dispositivo." },
    { voice: "zf_xiaobei", text: "你好，这段语音直接在你的设备上生成。" }
  ];
  report.multilingualVoiceTests = [];
  for (const sample of multilingualSamples) {
    await page.locator("#voiceSelect").selectOption(sample.voice);
    await page.locator("#scriptInput").fill(sample.text);
    await page.locator("#generateButton").click();
    await waitForGeneration(page);
    const wav = await inspectAudio(page, "#fullScriptAudio audio");
    assert(wav.validWav && wav.sizeBytes > 44, sample.voice + " did not produce a valid local WAV.");
    report.multilingualVoiceTests.push({ voice: sample.voice, wav });
  }
  report.checks.nonEnglishLocalSynthesis = true;

  // Exercise one voice from each available English voice group.
  const representativeVoices = ["af_heart", "bf_emma", "bm_george"];
  for (const voice of representativeVoices) {
    await page.locator("#voiceSelect").selectOption(voice);
    await page.locator("#scriptInput").fill("This is a short voice switching test for " + voice + ".");
    await page.locator("#generateButton").click();
    await waitForGeneration(page);
    const wav = await inspectAudio(page, "#fullScriptAudio audio");
    assert(wav.sizeBytes > 44 && wav.validWav, voice + " did not produce a valid full-script WAV.");
    report.voiceTests.push({ voice, wav });
  }
  report.voiceTests.push({ voice: "am_adam", wav: paragraphWavs[0] });
  report.checks.representativeVoicesGenerated = report.voiceTests.length === representativeVoices.length + 1;
  assert.equal(report.checks.representativeVoicesGenerated, true, "One or more representative voice groups failed to generate.");

  const expectedVoiceAssets = ["am_adam", ...representativeVoices];
  report.voiceAssetsObserved = report.network.filter(item =>
    expectedVoiceAssets.some(id => item.url.includes("/" + id + ".bin"))
  );
  report.checks.voiceAssetRequestsObserved = expectedVoiceAssets.every(id =>
    report.voiceAssetsObserved.some(item => item.url.includes("/" + id + ".bin") && [200, 302, 307].includes(item.status))
  );
  report.resolvedVoiceAssetResponses = report.network.filter(item =>
    /cdn\.hf\.co/.test(item.url) && item.status === 200 &&
    Number(item.contentLength || 0) >= 500000 && Number(item.contentLength || 0) <= 550000
  );
  report.checks.voiceAssetsResolved = report.resolvedVoiceAssetResponses.length >= expectedVoiceAssets.length;
  assert.equal(report.checks.voiceAssetRequestsObserved, true, "One or more voice asset URLs were not requested.");
  assert.equal(report.checks.voiceAssetsResolved, true, "Expected successful CDN responses for all 28 voice assets.");

  report.checks.passed = true;
  console.log("PAGES_FULL_SCRIPT_PARAGRAPH_WAV_SMOKE_TEST_PASSED");
} catch (error) {
  report.checks.passed = false;
  report.failure = error?.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  try {
    await saveReport();
    console.log("REPORT_PATH=" + reportPath);
  } catch (error) {
    console.error("Could not save report: " + error.message);
    process.exitCode = 1;
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  if (browser) await browser.close();
}