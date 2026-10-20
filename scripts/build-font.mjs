/**
 * 字体子集：从 Noto Serif SC 可变字体生成两个静态子集（400 / 500）。
 *
 * 字符集来自仓库里的实际文本：src 下的 ts/tsx/css，加上城市中文名覆盖表。
 * 这样新增文案时会自动纳入，不需要手工维护字符清单。
 *
 * 用法：
 *   node scripts/build-font.mjs
 * 输入：data-raw/NotoSerifSC.ttf（Noto Serif SC，SIL OFL 1.1）
 * 输出：src/assets/fonts/noto-serif-sc-{400,500}.woff2
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import subsetFont from 'subset-font';

const SOURCE_FONT = 'data-raw/NotoSerifSC.ttf';
const OUT_DIR = 'src/assets/fonts';
const ROOTS = ['src', 'index.html', 'data/zh-overrides.json', 'public/data/cities.json'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.json', '.html']);

const PUNCTUATION = '，。、；：？！「」『』（）〔〕【】《》〈〉—…·～￥％＃＠＆＊＋－＝｜＼／';
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

function collectFiles(path, files = []) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) collectFiles(join(path, entry), files);
  } else if (EXTENSIONS.has(extname(path))) {
    files.push(path);
  }
  return files;
}

function main() {
  const files = ROOTS.flatMap((root) => collectFiles(root));
  const text = files.map((file) => readFileSync(file, 'utf8')).join('');

  const characters = new Set([...ASCII, ...PUNCTUATION, ...text]);
  for (const character of [...characters]) {
    const code = character.codePointAt(0);
    // 去掉控制字符
    if (code < 0x20 || code === 0x7f) characters.delete(character);
  }

  const charset = [...characters].sort().join('');
  const fontBuffer = readFileSync(SOURCE_FONT);

  mkdirSync(OUT_DIR, { recursive: true });

  const weights = [400, 500];
  for (const weight of weights) {
    subsetFont(fontBuffer, charset, {
      targetFormat: 'woff2',
      variationAxes: { wght: weight },
    })
      .then((subset) => {
        const out = join(OUT_DIR, `noto-serif-sc-${weight}.woff2`);
        writeFileSync(out, subset);
        console.log(`${out}  ${(subset.length / 1024).toFixed(1)} KB  (${charset.length} 字符, wght ${weight})`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}

main();
