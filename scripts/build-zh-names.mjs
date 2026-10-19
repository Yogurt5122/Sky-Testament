/**
 * 从 GeoNames alternateNamesV2 提取"官方首选中文名"，产出 data/zh-names.json。
 *
 * 这是一次性脚本：输入 195MB 的 alternateNamesV2.txt，只保留 cities15000 中
 * 人口 ≥ 10 万的城市的 zh / zh-Hans / zh-Hant 名称，并挑出最优的一条。
 *
 * 产物 data/zh-names.json 会提交进仓库，因此后续 build-cities.mjs 不再需要大文件。
 *
 * 用法：
 *   node scripts/build-zh-names.mjs
 */
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const CITIES = 'data-raw/cities15000.txt';
const ALTERNATES = 'data-raw/alternateNamesV2.txt';
const OUTPUT = 'data/zh-names.json';
const MIN_POPULATION = 100_000;

const WANTED_LANGUAGES = new Set(['zh', 'zh-Hans', 'zh-Hant']);
const ONLY_CJK = /^[\u4e00-\u9fff]{2,}$/;

function score(candidate) {
  let value = 0;
  if (candidate.language === 'zh-Hans') value += 4;
  else if (candidate.language === 'zh') value += 2;
  if (candidate.preferred) value += 20;
  if (candidate.short) value += 6;
  // 同分时偏好较短的名称，但不让它压过"首选"标记
  value -= candidate.name.length * 0.1;
  return value;
}

async function loadWantedIds() {
  const ids = new Set();
  const reader = createInterface({ input: createReadStream(CITIES, 'utf8'), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    const columns = line.split('\t');
    if (columns.length < 19) continue;
    if ((Number(columns[14]) || 0) < MIN_POPULATION) continue;
    ids.add(columns[0]);
  }
  return ids;
}

async function main() {
  if (!existsSync(ALTERNATES)) {
    console.error(`缺少 ${ALTERNATES}，请先运行 scripts/fetch-data.mjs`);
    process.exit(1);
  }

  const wanted = await loadWantedIds();
  console.log(`目标城市 ${wanted.size} 个，开始扫描 alternateNamesV2…`);

  const best = new Map();
  let scanned = 0;
  let matched = 0;

  const reader = createInterface({ input: createReadStream(ALTERNATES, 'utf8'), crlfDelay: Infinity });
  for await (const line of reader) {
    scanned += 1;
    const columns = line.split('\t');
    if (columns.length < 4) continue;

    const geonameId = columns[1];
    if (!wanted.has(geonameId)) continue;

    const language = columns[2];
    if (!WANTED_LANGUAGES.has(language)) continue;

    const name = columns[3];
    if (!ONLY_CJK.test(name)) continue;

    matched += 1;
    const candidate = {
      name,
      language,
      preferred: columns[4] === '1',
      short: columns[5] === '1',
    };
    const current = best.get(geonameId);
    if (!current || score(candidate) > score(current)) best.set(geonameId, candidate);
  }

  const output = {};
  for (const id of [...best.keys()].sort((a, b) => Number(a) - Number(b))) {
    output[id] = best.get(id).name;
  }

  writeFileSync(OUTPUT, JSON.stringify(output));

  const size = JSON.stringify(output).length;
  console.log(`扫描行数      ${scanned}`);
  console.log(`命中中文候选  ${matched}`);
  console.log(`覆盖城市      ${Object.keys(output).length} / ${wanted.size}`);
  console.log(`zh-names.json ${(size / 1024).toFixed(1)} KB`);
  const sample = ['1816670', '1850147', '5128581', '2643743', '2988507', '2147714'];
  for (const id of sample) {
    if (output[id]) console.log(`  示例 ${id} → ${output[id]}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
