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
    return status.startsWith("Generating WAV") || status.startsWith("Generation failed:");
  }, { timeout: 30000 });
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusMessage")?.textContent || "";
    return status.startsWith("Completed.") || status.startsWith("Generation failed:");
  }, { timeout: 5 * 60 * 1000 });
  const status = (await page.locator("#statusMessage").innerText()).trim();
  assert(status.startsWith("Completed."), "Speech generation failed: " + status);
}

async function inspectFirstWav(page) {
  return page.locator("#audioResults audio").first().evaluate(async audio => {
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
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on("pageerror", error => report.errors.push("pageerror: " + error.message));
  page.on("requestfailed", request => {
    report.errors.push("requestfailed: " + safeUrl(request.url()) + " — " + (request.failure()?.errorText || "unknown"));
  });
  page.on("response", response => {
    const request = response.request();
    const url = safeUrl(response.url());
    if (/huggingface|hf\.co|jsdelivr|onnx|kokoro/i.test(url)) {
      report.network.push({
        url,
        status: response.status(),
        resourceType: request.resourceType(),
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

  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    secureContext: window.isSecureContext
  }));
  assert.equal(report.environment.secureContext, true, "Pages should be served over HTTPS.");

  const modelLoadStarted = Date.now();
  await page.locator("#loadButton").click();
  await page.waitForFunction(() => {
    const badge = document.querySelector("#modelBadge")?.textContent || "";
    return badge.includes("Model ready") || badge.includes("Model load failed");
  }, { timeout: 8 * 60 * 1000 });

  const modelBadge = (await page.locator("#modelBadge").innerText()).trim();
  report.timings.modelLoadSecondsWallClock = Number(((Date.now() - modelLoadStarted) / 1000).toFixed(2));
  report.timings.modelLoadMetric = (await page.locator("#modelLoadMetric").innerText()).trim();
  report.checks.modelLoaded = modelBadge.includes("Model ready");
  assert.equal(report.checks.modelLoaded, true, "Kokoro model failed to load: " + await page.locator("#statusMessage").innerText());

  const voiceOptions = await page.locator("#voiceSelect option").evaluateAll(options => options.map(option => ({
    id: option.value,
    label: option.textContent.trim()
  })));
  const voices = voiceOptions.map(option => option.id);
  report.voiceCount = voices.length;
  report.voiceSample = voiceOptions.slice(0, 12);
  report.requiredVoicesPresent = ["am_adam", "af_heart", "bf_emma"].every(id => voices.includes(id));
  assert(voices.length >= 20, "Expected the registered Kokoro English voice catalogue, but found only " + voices.length + ".");
  assert.equal(report.requiredVoicesPresent, true, "One or more expected voice IDs are missing.");
  report.checks.multipleVoicesDiscovered = true;

  temporaryDirectory = await mkdtemp(join(tmpdir(), "nextgen-pages-test-"));

  await page.locator("#voiceSelect").selectOption("am_adam");
  await page.locator("#scriptInput").fill("This is an automated NextGen AI Voiceover browser test. Kokoro should create a WAV file and a ZIP archive.");
  await page.locator("#generateButton").click();
  await waitForGeneration(page);

  const adamWav = await inspectFirstWav(page);
  report.voiceTests.push({ voice: "am_adam", sentenceCount: 2, wav: adamWav });
  report.audioFileCount = await page.locator("#audioResults .audio-row").count();
  assert.equal(report.audioFileCount, 2, "The two-sentence sample should create two WAV files.");
  assert(adamWav.sizeBytes > 44 && adamWav.validWav, "Adam output is not a valid WAV.");

  const zipCheck = await page.locator("#zipDownload").evaluate(async anchor => {
    const response = await fetch(anchor.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const signature = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return {
      status: response.status,
      sizeBytes: blob.size,
      signature,
      validZip: signature === "504b0304" || signature === "504b0506" || signature === "504b0708"
    };
  });
  report.zip = zipCheck;
  assert.equal(zipCheck.status, 200, "Generated ZIP blob could not be read.");
  assert(zipCheck.sizeBytes > 22, "Generated ZIP is unexpectedly empty.");
  assert.equal(zipCheck.validZip, true, "Generated ZIP signature is invalid.");
  report.checks.zipValid = true;

  const [zipDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#zipDownload").click()
  ]);
  const zipPath = join(temporaryDirectory, zipDownload.suggestedFilename());
  await zipDownload.saveAs(zipPath);
  const zipStats = await stat(zipPath);
  report.zip.downloadedFilename = zipDownload.suggestedFilename();
  report.zip.downloadedSizeBytes = zipStats.size;
  assert.equal(zipStats.size, zipCheck.sizeBytes, "ZIP download size differs from generated archive.");
  report.checks.zipDownloadWorks = true;

  const [wavDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#audioResults .audio-download").first().click()
  ]);
  const wavPath = join(temporaryDirectory, wavDownload.suggestedFilename());
  await wavDownload.saveAs(wavPath);
  const wavStats = await stat(wavPath);
  report.wavDownload = { filename: wavDownload.suggestedFilename(), sizeBytes: wavStats.size };
  assert.equal(wavStats.size, adamWav.sizeBytes, "Individual WAV download size mismatch.");
  report.checks.individualWavDownloadWorks = true;

  for (const voice of ["af_heart", "bf_emma"]) {
    await page.locator("#voiceSelect").selectOption(voice);
    await page.locator("#scriptInput").fill("This is a real voice-switching test for " + voice + ".");
    await page.locator("#generateButton").click();
    await waitForGeneration(page);
    const wav = await inspectFirstWav(page);
    assert(wav.sizeBytes > 44 && wav.validWav, voice + " did not produce a valid WAV.");
    report.voiceTests.push({ voice, sentenceCount: 1, wav });
  }
  report.checks.threeVoicesGenerated = report.voiceTests.length === 3;

  const expectedVoiceAssets = ["am_adam", "af_heart", "bf_emma"];
  report.voiceAssetsObserved = report.network.filter(item =>
    expectedVoiceAssets.some(id => item.url.includes("/" + id + ".bin"))
  );
  // Hugging Face resolves model/voice files through HTTP 302/307 redirects to Xet CDN.
  // The redirect response is expected; successful synthesis plus CDN byte responses
  // validates that the requested voice files were actually delivered.
  report.checks.voiceAssetRequestsObserved = expectedVoiceAssets.every(id =>
    report.voiceAssetsObserved.some(item =>
      item.url.includes("/" + id + ".bin") && [200, 302, 307].includes(item.status)
    )
  );
  report.resolvedVoiceAssetResponses = report.network.filter(item =>
    /cdn\\.hf\\.co/.test(item.url) &&
    item.status === 200 &&
    Number(item.contentLength || 0) >= 500000 &&
    Number(item.contentLength || 0) <= 550000
  );
  report.checks.voiceAssetsResolved = report.resolvedVoiceAssetResponses.length >= 3;
  assert.equal(report.checks.voiceAssetRequestsObserved, true, "One or more selected voice asset URLs were not requested.");
  assert.equal(report.checks.voiceAssetsResolved, true, "Expected three successful CDN voice-asset responses.");

  report.timings.synthesisMetric = (await page.locator("#synthesisMetric").innerText()).trim();
  report.timings.totalGenerationMetric = (await page.locator("#totalMetric").innerText()).trim();
  report.checks.diagnosticsVisible = Boolean(report.timings.modelLoadMetric && report.timings.synthesisMetric && report.timings.totalGenerationMetric);
  assert.equal(report.checks.diagnosticsVisible, true, "Performance diagnostics were not populated.");

  report.checks.passed = true;
  console.log("PAGES_MULTI_VOICE_SMOKE_TEST_PASSED");
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
