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
await page.getByRole('button', { name: '计算这一刻的天空' }).click();
await page.waitForSelector('table');
await page.screenshot({ path: out, fullPage: true });

console.log(`screenshot -> ${out}`);
if (errors.length > 0) {
  console.error('页面报错：');
  for (const error of errors) console.error('  -', error);
  process.exitCode = 1;
}

await browser.close();
