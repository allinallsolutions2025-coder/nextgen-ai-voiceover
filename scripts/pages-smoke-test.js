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
    return status.startsWith("Generating paragraph") ||
      status.startsWith("Generating one continuous voiceover") ||
      status.startsWith("Generation failed:");
  }, null, { timeout: 30000 });
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
      validWav: ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WAVE"
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
  const largeModelResponsesBeforeReload = report.network.filter(item => /cdn\\.hf\\.co/.test(item.url) && Number(item.contentLength || 0) > 10000000).length;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => {
    const badge = document.querySelector("#modelBadge")?.textContent || "";
    return badge.includes("Model ready") || badge.includes("Model load failed");
  }, null, { timeout: 8 * 60 * 1000 });
  assert((await page.locator("#modelBadge").innerText()).includes("Model ready"), "Cached model failed to restore after reload.");
  const largeModelResponsesAfterReload = report.network.filter(item => /cdn\\.hf\\.co/.test(item.url) && Number(item.contentLength || 0) > 10000000).length;
  report.checks.modelWeightsReusedAfterReload = largeModelResponsesAfterReload === largeModelResponsesBeforeReload;
  assert.equal(report.checks.modelWeightsReusedAfterReload, true, "The large ONNX model was downloaded again after reload.");

  const voiceOptions = await page.locator("#voiceSelect option").evaluateAll(options => options.map(option => ({
    id: option.value, label: option.textContent.trim()
  })));
  const voices = voiceOptions.map(option => option.id);
  report.voiceCount = voices.length;
  report.voiceSample = voiceOptions.slice(0, 12);
  report.requiredVoicesPresent = ["am_adam", "af_heart", "bf_emma", "bm_george"].every(id => voices.includes(id));
  assert.equal(voices.length, 28, "Expected 28 active English voices, found " + voices.length + ".");
  assert.equal(report.requiredVoicesPresent, true, "One or more expected voice IDs are missing.");
  report.checks.multipleVoicesDiscovered = true;

  temporaryDirectory = await mkdtemp(join(tmpdir(), "nextgen-pages-test-"));

  // Two paragraphs verify the individual WAVs and one continuous full-script WAV.
  await page.locator("#voiceSelect").selectOption("am_adam");
  const firstParagraph = "This is the first short paragraph for the voiceover export test.";
  const secondParagraph = "This is the second paragraph. The full script should also be generated as one continuous voiceover.";
  await page.locator("#scriptInput").fill(firstParagraph + "\n\n" + secondParagraph);
  report.scriptParagraphCharacterCounts = [firstParagraph.length, secondParagraph.length];
  assert.equal(await page.locator("#paragraphCount").innerText(), "2 paragraphs");
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

  // Exercise one voice from each remaining English voice group without synthesizing all 28 in CI.
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