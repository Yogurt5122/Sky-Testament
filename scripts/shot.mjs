/**
 * 端到端截图：用本机 Chrome 打开页面、点击计算、截全页图。
 * 依赖 playwright（channel: 'chrome'，不下载内核）。
 *
 * 用法：npm run shot
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SHOT_URL ?? 'http://localhost:5173/';
const out = process.env.SHOT_OUT ?? '.tmp/m1.png';

await mkdir('.tmp', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(url, { waitUntil: 'networkidle' });
if (process.env.SHOT_TIME) {
  await page.locator('input[type="time"]').fill(process.env.SHOT_TIME);
}
await page.getByPlaceholder('上海 / Tokyo / New York').fill('成都');
await page.getByRole('button', { name: /成都/ }).first().click();
await page.getByRole('button', { name: '计算这一刻的天空' }).click();
await page.waitForSelector('table');
// 等主题切换的 320ms 过渡结束
await page.waitForTimeout(700);
if (process.env.SHOT_MODAL) {
  await page.locator('.chart-trigger').click();
  await page.waitForSelector('.chart-modal');
  const zoomTimes = Number(process.env.SHOT_ZOOM ?? 0);
  const zoomIn = page.locator('.chart-modal-controls button[aria-label="放大"]');
  for (let index = 0; index < zoomTimes; index += 1) {
    await zoomIn.click();
  }
  await page.waitForTimeout(500);
}
await page.screenshot({ path: out, fullPage: !process.env.SHOT_MODAL });

console.log(`screenshot -> ${out}`);
if (errors.length > 0) {
  console.error('页面报错：');
  for (const error of errors) console.error('  -', error);
  process.exitCode = 1;
}

await browser.close();
