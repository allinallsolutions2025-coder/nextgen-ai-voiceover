import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const reportPath = resolve(root, "artifacts/offline-smoke-test.json");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".bin": "application/octet-stream"
};

const report = {
  test: "Packaged Kokoro model with external network blocked",
  startedAt: new Date().toISOString(),
  externalRequests: [],
  localModelRequests: [],
  checks: {},
  errors: []
};
let browser;
let server;

async function writeReport() {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
}

try {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(dist, "." + relative);
      if (filePath !== dist && !filePath.startsWith(dist + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mime[extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Length": info.size,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "no-store"
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(404).end("Not found");
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  report.origin = origin;

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      if (parsed.origin !== origin) {
        report.externalRequests.push(url);
        await route.abort("internetdisconnected");
        return;
      }
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("request", request => {
    const url = request.url();
    if (url.startsWith(origin) && (url.includes("/models/") || url.includes("/ort/"))) {
      report.localModelRequests.push(url.replace(origin, ""));
    }
  });

  const navigation = await page.goto(origin + "/?offline-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  assert.equal(navigation.status(), 200);
  report.checks.appShellLoaded = await page.locator("#scriptInput").count() === 1;
  assert.equal(report.checks.appShellLoaded, true);

  await page.waitForFunction(() => {
    const badge = document.querySelector("#modelBadge")?.textContent || "";
    return badge.includes("Model ready") || badge.includes("Model load failed");
  }, null, { timeout: 8 * 60 * 1000 });
  const badge = (await page.locator("#modelBadge").innerText()).trim();
  report.modelBadge = badge;
  report.checks.modelLoadedWithoutNetwork = badge.includes("Model ready");
  assert.equal(report.checks.modelLoadedWithoutNetwork, true, "Local Kokoro model did not load with internet blocked.");

  const voiceCount = await page.locator("#voiceSelect option").count();
  report.voiceCount = voiceCount;
  report.checks.all28EnglishVoicesAvailable = voiceCount === 28;
  assert.equal(voiceCount, 28);

  await page.locator("#scriptInput").fill("This is a fully offline NextGen AI Voiceover test.");
  await page.locator("#generateButton").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusMessage")?.textContent || "";
    return status.startsWith("English voiceover complete.") ||
      status.startsWith("Voiceover complete.") ||
      status.startsWith("Generation failed:");
  }, null, { timeout: 8 * 60 * 1000 });
  const finalStatus = (await page.locator("#statusMessage").innerText()).trim();
  report.generationStatus = finalStatus;
  assert(
    finalStatus.startsWith("English voiceover complete.") || finalStatus.startsWith("Voiceover complete."),
    "Offline speech generation failed: " + finalStatus
  );

  const audio = await page.locator("#fullScriptAudio audio").evaluate(async element => {
    const response = await fetch(element.currentSrc || element.src);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const ascii = Array.from(bytes, value => String.fromCharCode(value)).join("");
    return {
      sizeBytes: blob.size,
      validWav: ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WAVE"
    };
  });
  report.audio = audio;
  report.checks.offlineWavGenerated = audio.validWav && audio.sizeBytes > 44;
  assert.equal(report.checks.offlineWavGenerated, true);

  report.checks.localModelAssetsRequested = report.localModelRequests.some(url => url.includes("model_quantized.onnx")) &&
    report.localModelRequests.some(url => url.includes("/ort/"));
  assert.equal(report.checks.localModelAssetsRequested, true);
  report.checks.noExternalNetworkRequests = report.externalRequests.length === 0;
  assert.equal(report.checks.noExternalNetworkRequests, true, "The app attempted to access an external host.");

  report.checks.passed = true;
  console.log("OFFLINE_KOKORO_END_TO_END_TEST_PASSED");
} catch (error) {
  report.checks.passed = false;
  report.failure = error?.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  try { await writeReport(); } catch (error) {
    console.error("Could not write offline test report:", error.message);
    process.exitCode = 1;
  }
  if (browser) await browser.close();
  if (server) await new Promise(resolvePromise => server.close(resolvePromise));
}
