/**
 * 构建离线城市库：GeoNames cities15000 → src/data/cities.json
 *
 * 用法：node scripts/build-cities.mjs
 * 输入：data-raw/cities15000.txt（GeoNames，CC BY 4.0）
 * 输出：紧凑 JSON，时区与国家去重后按索引引用
 *
 * 中文名取自 alternatenames 字段：只保留全中文候选，去掉一字名与「市」后缀，
 * 取最短的一个；歧义时保留原顺序的第一个（通常是简体）。
 */
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const MIN_POPULATION = 100_000;
const INPUT = 'data-raw/cities15000.txt';
const OVERRIDES = 'data/zh-overrides.json';
const OUTPUT = 'public/data/cities.json';

const CJK_ONLY = /^[\u4e00-\u9fff]{2,}$/;

/** 去掉重音并小写，用于覆盖表匹配。 */
function fold(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const overrideTable = new Map();
if (existsSync(OVERRIDES)) {
  for (const [latin, zh] of Object.entries(JSON.parse(readFileSync(OVERRIDES, 'utf8')))) {
    if (latin.startsWith('_')) continue;
    overrideTable.set(fold(latin), zh);
  }
}

function pickChineseName(alternates) {
  if (!alternates) return null;
  const candidates = alternates
    .split(',')
    .map((name) => name.trim())
    .filter((name) => CJK_ONLY.test(name));

  const cleaned = candidates.map((name) => (name.length > 2 && name.endsWith('市') ? name.slice(0, -1) : name));
  const unique = [...new Set(cleaned)];
  unique.sort((a, b) => a.length - b.length); // 稳定排序：同长度保留原顺序
  return unique[0] ?? null;
}

async function main() {
  const reader = createInterface({ input: createReadStream(INPUT, 'utf8'), crlfDelay: Infinity });
  const cities = [];
  let total = 0;
  let skipped = 0;

  for await (const line of reader) {
    if (!line.trim()) continue;
    const columns = line.split('\t');
    if (columns.length < 19) continue;
    total += 1;

    const population = Number(columns[14]) || 0;
    if (population < MIN_POPULATION) continue;

    const timezone = columns[17];
    if (!timezone) {
      skipped += 1;
      continue;
    }

    const latin = columns[1];
    const ascii = columns[2];
    const override = overrideTable.get(fold(latin));
    const heuristic = override ? null : pickChineseName(columns[3]);
    cities.push({
      id: Number(columns[0]),
      name: latin,
      ascii,
      zh: override ?? heuristic,
      latitude: Number(Number(columns[4]).toFixed(4)),
      longitude: Number(Number(columns[5]).toFixed(4)),
      timezone,
      country: columns[8],
      population,
      zhSource: override ? 'override' : heuristic ? 'alternate' : 'none',
    });
  }

  cities.sort((a, b) => b.population - a.population);

  const timezones = [...new Set(cities.map((city) => city.timezone))].sort();
  const countries = [...new Set(cities.map((city) => city.country))].sort();
  const tzIndex = new Map(timezones.map((zone, index) => [zone, index]));
  const countryIndex = new Map(countries.map((code, index) => [code, index]));

  const payload = {
    version: 1,
    source: 'GeoNames cities15000',
    license: 'CC BY 4.0',
    timezones,
    countries,
    cities: cities.map((city) => [
      city.id,
      city.name,
      city.zh,
      city.latitude,
      city.longitude,
      tzIndex.get(city.timezone),
      countryIndex.get(city.country),
      city.population,
    ]),
  };

  const json = JSON.stringify(payload);
  writeFileSync(OUTPUT, json);

  const withZh = cities.filter((city) => city.zh).length;
  const fromOverride = cities.filter((city) => city.zhSource === 'override').length;
  const fromAlternate = cities.filter((city) => city.zhSource === 'alternate').length;
  console.log(`GeoNames 行数        ${total}`);
  console.log(`保留（人口 ≥ ${MIN_POPULATION / 1000}k） ${cities.length}（跳过无时区 ${skipped}）`);
  console.log(`中文名               ${withZh}（覆盖表 ${fromOverride} + 自动提取 ${fromAlternate}）`);
  console.log(`时区 / 国家          ${timezones.length} / ${countries.length}`);
  console.log(`cities.json         ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`样例                ${cities.slice(0, 3).map((city) => `${city.zh ?? city.name}(${city.timezone})`).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
