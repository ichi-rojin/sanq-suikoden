// 責務: Viewerの機械的目視検証（headless Chromiumで起動→描画→スクリーンショット保存）。D-8型の証跡ツール
// 使い方: docker compose exec dev node packages/slice/viewer/screenshot.mjs [待ち秒数] [出力名]
import { chromium } from "playwright-core";

const waitSec = Number(process.argv[2] ?? "10");
const outName = process.argv[3] ?? "viewer-shot";
const executablePath =
  "/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell";

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on("console", (m) => {
  if (m.type() === "error") {
    errors += 1;
    console.log("[console.error]", m.text().slice(0, 300));
  }
});
page.on("pageerror", (e) => {
  errors += 1;
  console.log("[pageerror]", String(e).slice(0, 300));
});
await page.goto("http://localhost:5173/", { waitUntil: "load" });
await page.waitForTimeout(waitSec * 1000);
await page.screenshot({ path: `/app/${outName}.png` });
const date = await page.locator("#date").textContent();
const logCount = await page.locator("#log .line").count();
console.log(`saved /app/${outName}.png  date=${date}  log=${logCount}  errors=${errors}`);
await browser.close();
process.exit(errors > 0 ? 1 : 0);
