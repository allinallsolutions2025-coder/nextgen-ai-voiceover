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
    return status.startsWith("English voiceover complete.") ||
      status.startsWith("Voiceover complete.") ||
      status.startsWith("Generation failed:");
  }, null, { timeout: 8 * 60 * 1000 });
  const status = (await page.locator("#statusMessage").innerText()).trim();
  const completed = status.startsWith("English voiceover complete.") || status.startsWith("Voiceover complete.");
  assert(completed, "Speech generation failed: " + status);
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
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
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
  report.checks.professionalHeaderNavigation = await page.locator(".app-header .main-nav .nav-item.active").count() === 1;
  assert.equal(report.checks.professionalHeaderNavigation, true, "Compact studio header navigation did not render.");
  report.checks.legacySidebarRemoved =
    await page.locator(".sidebar, .nav-item-muted, .nav-soon, .sidebar-footer").count() === 0;
  assert.equal(report.checks.legacySidebarRemoved, true, "Legacy sidebar and placeholder navigation should be removed.");
  const desktopLayout = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const editor = document.querySelector(".editor-column").getBoundingClientRect();
    const settings = document.querySelector(".settings-column").getBoundingClientRect();
    return {
      viewport,
      editorWidth: Math.round(editor.width),
      settingsWidth: Math.round(settings.width),
      horizontalOverflow: document.documentElement.scrollWidth > viewport.width,
      sideBySide: settings.left > editor.left && settings.left >= editor.right - 2
    };
  });
  report.desktopLayout1366x768 = desktopLayout;
  assert.equal(desktopLayout.viewport.width, 1366, "Desktop check should run at 1366px width.");
  assert.equal(desktopLayout.viewport.height, 768, "Desktop check should run at 768px height.");
  assert.equal(desktopLayout.horizontalOverflow, false, "Studio should not overflow horizontally at a Windows desktop size.");
  assert.equal(desktopLayout.sideBySide, true, "Editor and settings should fit side by side on a desktop.");
  assert.ok(desktopLayout.editorWidth >= 650, "The script editor should have adequate desktop width.");
  await page.setViewportSize({ width: 1920, height: 1080 });
  const wideLayout = await page.evaluate(() => ({
    width: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    sideBySide: document.querySelector(".settings-column").getBoundingClientRect().left >
      document.querySelector(".editor-column").getBoundingClientRect().left
  }));
  report.desktopLayout1920x1080 = wideLayout;
  assert.equal(wideLayout.width, 1920);
  assert.equal(wideLayout.horizontalOverflow, false);
  assert.equal(wideLayout.sideBySide, true);
  await page.setViewportSize({ width: 1366, height: 768 });
  report.checks.windowsDesktopLayoutFits = true;
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
  report.checks.smartSpokenTextControlPresent = await page.locator("#enhanceSpokenText").count() === 1;
  assert.equal(report.checks.smartSpokenTextControlPresent, true, "Smart spoken-text control is missing.");
  report.checks.smartSpokenTextEnabledByDefault = await page.locator("#enhanceSpokenText").isChecked();
  assert.equal(report.checks.smartSpokenTextEnabledByDefault, true, "Smart spoken-text cleanup should be enabled by default.");
  report.checks.voiceBenchmarkControlsPresent =
    await page.locator("#benchmarkPreset, #benchmarkScript, #runBenchmarkButton, #benchmarkResults").count() === 4;
  assert.equal(report.checks.voiceBenchmarkControlsPresent, true, "The 28-voice benchmark controls are missing.");
  report.checks.favoriteVoiceControlPresent = await page.locator("#favoriteVoiceButton").count() === 1;
  assert.equal(report.checks.favoriteVoiceControlPresent, true, "Voice favourite control is missing.");
  report.checks.spokenTextPreviewPresent = await page.locator("#spokenPreviewText").count() === 1;
  assert.equal(report.checks.spokenTextPreviewPresent, true, "Prepared spoken-text preview is missing.");
  report.checks.recentVoiceStatusPresent = await page.locator("#recentVoiceHelp").count() === 1;
  assert.equal(report.checks.recentVoiceStatusPresent, true, "Recently used voice indicator is missing.");
  report.checks.paragraphEditorPresent =
    await page.locator("#paragraphEditorDetails, #paragraphEditorStatus, #paragraphEditorList").count() === 3;
  assert.equal(report.checks.paragraphEditorPresent, true, "Paragraph editor controls are missing.");

  const voiceOptions = await page.locator("#voiceSelect option").evaluateAll(options => options.map(option => ({
    id: option.value, label: option.textContent.trim(), disabled: option.disabled
  })));
  const voices = voiceOptions.filter(option => !option.disabled).map(option => option.id);
  const unavailableVoices = voiceOptions.filter(option => option.disabled);
  report.voiceCount = voiceOptions.length;
  report.runtimeVoiceCount = voices.length;
  report.removedNonEnglishKokoroVoices = 26;
  report.voiceSample = voiceOptions.slice(0, 12);
  report.requiredVoicesPresent = ["am_adam", "af_heart", "bf_emma", "bm_george"].every(id => voices.includes(id));
  assert.equal(voiceOptions.length, 28, "Expected exactly 28 English Kokoro voices in the product catalogue.");
  assert.equal(voices.length, 28, "All 28 English Kokoro voices should be selectable.");
  assert.equal(unavailableVoices.length, 0, "Non-English Kokoro entries must be removed, not shown as disabled voices.");
  assert.equal(report.requiredVoicesPresent, true, "One or more expected English Kokoro voices are missing.");
  assert(voiceOptions.every(option => /^[ab][fm]_/.test(option.id)), "The Kokoro menu must contain English IDs only.");
  assert.equal(await page.locator("#voiceSelect option[value='zf_xiaoyi']").count(), 0, "Non-English Kokoro voice IDs must not appear.");
  assert.equal(await page.locator("#voiceSelect option[value='ff_siwis']").count(), 0, "Non-English Kokoro voice IDs must not appear.");
  report.checks.only28EnglishKokoroVoicesVisible = true;
  report.checks.nonEnglishKokoroRemoved = true;
  assert.equal(await page.locator("#outputFormat option").count(), 2, "Expected WAV and MP3 output choices.");
  report.checks.creatorExportControlsPresent =
    await page.locator("#creatorPreset, #normalizeAudio, #trimSilence, #srtDownload, #vttDownload").count() === 5;
  assert.equal(report.checks.creatorExportControlsPresent, true, "Creator export controls are missing.");
  await page.locator("#advancedSettings summary").click();
  assert.equal(await page.locator("#creatorPreset option").count(), 4, "Expected four creator caption presets.");
  await page.locator("#creatorPreset").selectOption("shorts");
  await page.locator("#normalizeAudio").check();
  await page.locator("#trimSilence").check();
  const savedCreatorSettings = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nextgen-voiceover-creator-export-v1") || "{}")
  );
  assert.equal(savedCreatorSettings.preset, "shorts");
  assert.equal(savedCreatorSettings.normalize, true);
  assert.equal(savedCreatorSettings.trimSilence, true);
  report.checks.creatorSettingsSavedLocally = true;

  temporaryDirectory = await mkdtemp(join(tmpdir(), "nextgen-pages-test-"));

  // Two paragraphs verify the individual WAVs and one continuous full-script WAV.
  await page.locator("#voiceSelect").selectOption("am_adam");
  assert.match(await page.locator("#recentVoiceHelp").innerText(), /Adam/, "Recently used voice was not shown.");
  await page.locator("#favoriteVoiceButton").click();
  assert.equal(await page.locator("#favoriteVoiceButton").getAttribute("aria-pressed"), "true");
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("nextgen-voiceover-favorite-voices-v1") || "[]")),
    ["am_adam"],
    "Favourite voice was not saved locally."
  );
  const firstParagraph = "This is the first short paragraph for the voiceover export test.";
  const secondParagraph = "This is the second paragraph. The full script should also be generated in 2026 as one continuous voiceover.";
  const draftText = firstParagraph + "\n\n" + secondParagraph;
  await page.locator("#scriptInput").fill(draftText);
  report.scriptParagraphCharacterCounts = [firstParagraph.length, secondParagraph.length];
  assert.equal(await page.locator("#paragraphCount").innerText(), "2 paragraphs");
  assert.equal(await page.evaluate(() => localStorage.getItem("nextgen-voiceover-draft-v1")), draftText,
    "The script draft was not saved locally.");
  report.checks.localDraftAutosave = true;

  await page.locator("#paragraphEditorDetails summary").click();
  assert.equal(await page.locator(".paragraph-editor-card").count(), 2, "Expected two editable paragraph cards.");
  await page.locator(".paragraph-editor-voice").nth(0).selectOption("af_heart");
  await page.locator(".paragraph-editor-speed").nth(0).selectOption("1.15");
  const savedParagraphSettings = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nextgen-voiceover-paragraph-settings-v1") || "[]")
  );
  assert.equal(savedParagraphSettings[0].voice, "af_heart");
  assert.equal(savedParagraphSettings[0].speed, "1.15");

  await page.locator(".paragraph-action-move-down").first().click();
  assert.equal(await page.locator("#scriptInput").inputValue(), secondParagraph + "\n\n" + firstParagraph,
    "Moving a paragraph down did not update the script order.");
  await page.locator(".paragraph-action-move-up").last().click();
  assert.equal(await page.locator("#scriptInput").inputValue(), draftText,
    "Moving a paragraph back up did not restore the script order.");

  const splitCursor = firstParagraph.indexOf("for");
  await page.locator(".paragraph-editor-text").first().evaluate((textarea, cursor) => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  }, splitCursor);
  await page.locator(".paragraph-action-split").first().click();
  assert.equal(await page.locator(".paragraph-editor-card").count(), 3, "Split action did not create another paragraph.");
  await page.locator(".paragraph-action-merge").first().click();
  assert.equal(await page.locator(".paragraph-editor-card").count(), 2, "Merge action did not restore the paragraph count.");
  assert.equal(await page.locator("#scriptInput").inputValue(), draftText,
    "Split and merge did not preserve paragraph content.");
  report.checks.paragraphOrderingSplitMerge = true;
  report.checks.paragraphVoiceAndPaceOverridesSaved = true;

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (document.querySelector("#modelBadge")?.textContent || "").includes("Model ready"),
    null, { timeout: 8 * 60 * 1000 });
  assert.equal(await page.locator("#scriptInput").inputValue(), draftText, "The local script draft was not restored after reload.");
  report.checks.localDraftRecovery = true;
  await page.locator("#paragraphEditorDetails summary").click();
  assert.equal(await page.locator(".paragraph-editor-card").count(), 2);
  assert.equal(await page.locator(".paragraph-editor-voice").nth(0).inputValue(), "af_heart",
    "Paragraph voice override was not restored after reload.");
  assert.equal(await page.locator(".paragraph-editor-speed").nth(0).inputValue(), "1.15",
    "Paragraph pace override was not restored after reload.");
  report.checks.paragraphOverridesRestored = true;
  await page.locator("#advancedSettings summary").click();
  assert.equal(await page.locator("#creatorPreset").inputValue(), "shorts",
    "Creator preset was not restored after reload.");
  assert.equal(await page.locator("#normalizeAudio").isChecked(), true,
    "Audio level matching preference was not restored after reload.");
  assert.equal(await page.locator("#trimSilence").isChecked(), true,
    "Edge-silence trimming preference was not restored after reload.");
  report.checks.creatorSettingsRestored = true;
  await page.locator("#voiceSelect").selectOption("am_adam");
  assert.equal(await page.locator("#favoriteVoiceButton").getAttribute("aria-pressed"), "true",
    "Favourite voice was not restored after reload.");
  assert.match(await page.locator("#recentVoiceHelp").innerText(), /Adam/, "Recent voice was not restored after reload.");
  await page.locator("#voiceFilterSelect").selectOption("favorites");
  assert.equal(await page.locator("#voiceSelect option").count(), 1, "Favourite voice filter should show the saved voice.");
  assert.equal(await page.locator("#voiceSelect").inputValue(), "am_adam");
  await page.locator("#voiceFilterSelect").selectOption("all");
  const spokenPreview = await page.locator("#spokenPreviewText").textContent();
  report.spokenPreviewSample = spokenPreview?.slice(0, 240) || "";
  assert.match(spokenPreview || "", /twenty twenty six/, "Prepared spoken-text preview did not reflect the narration cleanup.");
  report.checks.favoriteVoicePersistenceAndFilter = true;
  report.checks.spokenTextPreviewReflectsTransform = true;
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
  // Wait for previewSelectedVoice() to finish its finally block, not merely for
  // the audio element to receive a blob URL. Generate is intentionally available
  // during preview, so its enabled state alone is not a sufficient synchronization point.
  await page.waitForFunction(() => {
    const previewButton = document.querySelector("#previewVoiceButton");
    const status = document.querySelector("#statusMessage")?.textContent || "";
    return previewButton &&
      !previewButton.disabled &&
      previewButton.textContent.trim() === "Preview voice" &&
      status.startsWith("English voice preview ready:");
  }, null, { timeout: 30000 });
  report.checks.previewFinishedBeforeGenerate = true;
  const generateButton = page.locator("#generateButton");
  assert.equal(await generateButton.isDisabled(), false, "Generate must be enabled after voice preview finishes.");
  report.checks.generateEnabledAfterPreview = true;
  await generateButton.click();
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
  assert.equal(await page.locator(".paragraph-editor-card").first().locator(".paragraph-editor-voice").inputValue(), "af_heart");
  assert.match(await page.locator(".paragraph-audio-card").first().locator(".audio-card-subtitle").innerText(), /af_heart/,
    "Paragraph audio did not use its per-section voice override.");
  assert(fullWav.sizeBytes > 44 && fullWav.validWav, "Full-script output is not a valid WAV.");
  assert(fullWav.sizeBytes > paragraphWavs[0].sizeBytes, "Full-script audio should contain both paragraphs.");
  assert.equal(fullWav.status, 200, "Full-script audio blob could not be read.");
  assert(paragraphWavs.every(item => item.validWav && item.sizeBytes > 44), "One or more paragraph outputs are invalid.");
  assert((await page.locator("#fullScriptDownload").getAttribute("download")).endsWith(".wav"), "WAV selection did not produce a WAV filename.");
  report.checks.paragraphWavOutputs = true;
  report.checks.fullScriptWavOutput = true;

  assert.equal(await page.locator("#subtitleDownloads").isVisible(), true,
    "SRT and VTT download links were not shown after generation.");
  const subtitleFiles = await page.evaluate(async () => {
    const srtAnchor = document.querySelector("#srtDownload");
    const vttAnchor = document.querySelector("#vttDownload");
    const [srt, vtt] = await Promise.all([
      fetch(srtAnchor.href).then(response => response.text()),
      fetch(vttAnchor.href).then(response => response.text())
    ]);
    return { srt, vtt, srtName:srtAnchor.download, vttName:vttAnchor.download };
  });
  assert.match(subtitleFiles.srt, /^1\n\d{2}:\d{2}:\d{2},\d{3} --> /,
    "SRT output does not contain numbered cues and SRT timestamps.");
  assert.match(subtitleFiles.vtt, /^WEBVTT\n\n\d{2}:\d{2}:\d{2}\.\d{3} --> /,
    "VTT output does not contain the WEBVTT header and VTT timestamps.");
  assert.equal(subtitleFiles.srtName, "full_script.srt");
  assert.equal(subtitleFiles.vttName, "full_script.vtt");
  assert.match(await page.locator("#subtitleStatus").innerText(), /estimated cues/);
  report.subtitleFiles = {
    srtBytes: subtitleFiles.srt.length,
    vttBytes: subtitleFiles.vtt.length,
    sample: subtitleFiles.srt.slice(0, 180)
  };
  report.checks.srtExport = true;
  report.checks.vttExport = true;
  report.checks.captionTimingNoteVisible = true;

  const zipHrefBeforeRegeneration = await page.locator("#zipDownload").getAttribute("href");
  await page.locator(".paragraph-action-regenerate").first().click();
  await page.waitForFunction(() =>
    (document.querySelector("#statusMessage")?.textContent || "").startsWith("Paragraph 1 regenerated."),
    null, { timeout: 8 * 60 * 1000 }
  );
  const regeneratedParagraph = await inspectAudio(page, ".paragraph-audio-card audio", 0);
  assert(regeneratedParagraph.validWav && regeneratedParagraph.sizeBytes > 44,
    "Regenerating a single paragraph did not produce a valid WAV.");
  assert.notEqual(await page.locator("#zipDownload").getAttribute("href"), zipHrefBeforeRegeneration,
    "Regenerating a paragraph did not refresh the ZIP bundle.");
  report.regeneratedParagraphWav = regeneratedParagraph;
  report.checks.singleParagraphRegeneration = true;
  report.checks.zipRefreshAfterParagraphRegeneration = true;

  const zipCheck = await page.locator("#zipDownload").evaluate(async anchor => {
    const response = await fetch(anchor.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const signature = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    const archiveText = new TextDecoder().decode(await blob.arrayBuffer());
    const requiredFiles = [
      "paragraph_001.wav", "paragraph_002.wav", "full_script.wav",
      "full_script.srt", "full_script.vtt", "original_script.txt",
      "spoken_script.txt", "project.json", "README.txt"
    ];
    return {
      status: response.status, sizeBytes: blob.size, signature,
      validZip: signature === "504b0304" || signature === "504b0506" || signature === "504b0708",
      requiredFiles,
      missingProjectFiles: requiredFiles.filter(name => !archiveText.includes(name))
    };
  });
  report.zip = zipCheck;
  assert.equal(zipCheck.status, 200, "Generated ZIP blob could not be read.");
  assert(zipCheck.sizeBytes > 22, "Generated ZIP is unexpectedly empty.");
  assert.equal(zipCheck.validZip, true, "Generated ZIP signature is invalid.");
  assert.deepEqual(zipCheck.missingProjectFiles, [], "Creator ZIP is missing one or more expected project assets.");
  report.checks.zipValid = true;
  report.checks.creatorProjectZipContents = true;

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

  // Exercise the English voice filters and preset speaking speeds.
  assert.equal(await page.locator("#voiceFilterSelect option").count(), 6, "Expected all, accent, gender and favorites filters.");
  await page.locator("#voiceFilterSelect").selectOption("american");
  const americanCount = await page.locator("#voiceSelect option").count();
  assert.equal(americanCount, 20, "Expected 20 American English voices.");
  await page.locator("#voiceFilterSelect").selectOption("british");
  const britishCount = await page.locator("#voiceSelect option").count();
  assert.equal(britishCount, 8, "Expected 8 British English voices.");
  await page.locator("#voiceFilterSelect").selectOption("female");
  const femaleCount = await page.locator("#voiceSelect option").count();
  assert.equal(femaleCount, 15, "Expected 15 female voices.");
  await page.locator("#voiceFilterSelect").selectOption("male");
  const maleCount = await page.locator("#voiceSelect option").count();
  assert.equal(maleCount, 13, "Expected 13 male voices.");
  await page.locator("#voiceFilterSelect").selectOption("all");
  assert.equal(await page.locator("#voiceSelect option").count(), 28);
  report.voiceFilters = { americanCount, britishCount, femaleCount, maleCount };
  report.checks.englishVoiceFilters = true;

  await page.locator('[data-speed-preset="1.15"]').click();
  assert.equal(Number(await page.locator("#speedInput").inputValue()).toFixed(2), "1.15");
  assert.equal(await page.locator('[data-speed-preset="1.15"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-speed-preset="1.00"]').click();
  assert.equal(Number(await page.locator("#speedInput").inputValue()).toFixed(2), "1.00");
  report.checks.speakingPacePresets = true;

  // The preceding MP3 test intentionally changed the output format. Restore
  // WAV before verifying representative English voice outputs.
  await page.locator("#outputFormat").selectOption("wav");

  // Exercise one voice from each available English voice group.
  const representativeVoices = ["af_heart", "bf_emma", "bm_george"];
  for (const voice of representativeVoices) {
    await page.locator("#voiceSelect").selectOption(voice);
    await page.locator("#scriptInput").fill("This is a short voice switching test for " + voice + ".");
    await page.locator("#generateButton").click();
    await waitForGeneration(page);
    const wav = await inspectAudio(page, "#fullScriptAudio audio");
    report.voiceTests.push({ voice, wav });
    assert(wav.sizeBytes > 44 && wav.validWav, voice + " did not produce a valid full-script WAV.");
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

  // Pronunciation guidance is saved locally and applied to English speech.
  await page.locator(".pronunciation-tools > summary").click();
  const pronunciationRules = ["OpenAI = Open A I", "YouTube = You Tube", "SQL = sequel"].join(String.fromCharCode(10));
  await page.locator("#pronunciationRules").fill(pronunciationRules);
  assert.equal(await page.evaluate(() => localStorage.getItem("nextgen-voiceover-pronunciation-v1")), pronunciationRules,
    "Pronunciation rules were not saved locally.");
  assert.match(await page.locator("#pronunciationStatus").innerText(), /3 pronunciation rule/);
  report.checks.pronunciationRulesAutosave = true;
  await page.locator("#scriptInput").fill("OpenAI and YouTube are tools for creators. SQL is a database language.");
  await page.locator("#outputFormat").selectOption("wav");
  await page.locator("#generateButton").click();
  await waitForGeneration(page);
  const pronunciationWav = await inspectAudio(page, "#fullScriptAudio audio");
  assert(pronunciationWav.validWav && pronunciationWav.sizeBytes > 44,
    "English synthesis with pronunciation rules did not produce a valid WAV.");
  report.pronunciationWav = pronunciationWav;
  report.checks.pronunciationRuleSynthesis = true;

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