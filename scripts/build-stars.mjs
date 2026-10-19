/**
 * 构建恒星二进制目录：HYG v4.2 CSV → src/data/stars.bin + src/data/star-names.json
 *
 * 用法：node scripts/build-stars.mjs
 * 输入：data-raw/hygdata_v42.csv（HYG v4.2，CC BY-SA 4.0）
 * 输出：二进制（小端），表头 12 字节 + 7 个并列数组，每星 20 字节
 *
 *   偏移 0  magic "STAR"
 *   偏移 4  uint16 版本 = 1
 *   偏移 6  uint16 保留
 *   偏移 8  uint32 恒星数 N
 *   之后依次：hip(N×u32) ra(N×f32, 小时, J2000) dec(N×f32, 度)
 *             mag(N×i16, 毫等) ci(N×i16, ×1000) pmra(N×i16, mas/yr) pmdec(N×i16, mas/yr)
 *
 * 注意：HYG 的 pmra 是 μ_α·cosδ（已乘 cosδ），与 Hipparcos 一致。
 */
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Buffer } from 'node:buffer';

const LIMIT_MAG = 6.5;
const INPUT = 'data-raw/hygdata_v42.csv';
const OUT_BIN = 'public/data/stars.bin';
const OUT_NAMES = 'public/data/star-names.json';

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const clampInt16 = (value) => Math.max(-32767, Math.min(32767, Math.round(value)));

async function main() {
  const reader = createInterface({ input: createReadStream(INPUT, 'utf8'), crlfDelay: Infinity });
  let header = null;
  const stars = [];
  let total = 0;

  for await (const line of reader) {
    if (!header) {
      header = parseCsvLine(line).map((name) => name.replace(/^"|"$/g, ''));
      continue;
    }
    if (!line.trim()) continue;
    total += 1;

    const fields = parseCsvLine(line);
    const get = (name) => fields[header.indexOf(name)];

    const id = Number(get('id'));
    const hip = Number(get('hip')) || 0;
    const proper = get('proper') || '';
    if (id === 0 || proper === 'Sol') continue; // 太阳由星历层单独计算

    const mag = Number(get('mag'));
    const ra = Number(get('ra'));
    const dec = Number(get('dec'));
    if (!Number.isFinite(mag) || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    if (mag > LIMIT_MAG) continue;

    const ci = Number(get('ci'));
    const pmra = Number(get('pmra'));
    const pmdec = Number(get('pmdec'));

    stars.push({
      hip: hip > 0 ? hip : id,
      ra,
      dec,
      mag,
      ci: Number.isFinite(ci) ? ci : 0.65,
      pmra: Number.isFinite(pmra) ? pmra : 0,
      pmdec: Number.isFinite(pmdec) ? pmdec : 0,
      proper,
      bayer: get('bayer') || '',
      con: get('con') || '',
      flam: get('flam') || '',
    });
  }

  stars.sort((a, b) => a.mag - b.mag);

  const count = stars.length;
  const buffer = Buffer.alloc(12 + count * 20);
  buffer.write('STAR', 0, 'ascii');
  buffer.writeUInt16LE(1, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt32LE(count, 8);

  let offset = 12;
  for (const star of stars) {
    buffer.writeUInt32LE(star.hip >>> 0, offset);
    offset += 4;
  }
  for (const star of stars) {
    buffer.writeFloatLE(star.ra, offset);
    offset += 4;
  }
  for (const star of stars) {
    buffer.writeFloatLE(star.dec, offset);
    offset += 4;
  }
  for (const star of stars) {
    buffer.writeInt16LE(clampInt16(star.mag * 1000), offset);
    offset += 2;
  }
  for (const star of stars) {
    buffer.writeInt16LE(clampInt16(star.ci * 1000), offset);
    offset += 2;
  }
  for (const star of stars) {
    buffer.writeInt16LE(clampInt16(star.pmra), offset);
    offset += 2;
  }
  for (const star of stars) {
    buffer.writeInt16LE(clampInt16(star.pmdec), offset);
    offset += 2;
  }

  const names = {};
  for (const star of stars) {
    if (!star.proper && !(star.bayer && star.con)) continue;
    const entry = {};
    if (star.proper) entry.n = star.proper;
    if (star.bayer && star.con) {
      entry.b = star.bayer;
      entry.c = star.con;
    }
    if (star.flam) entry.f = star.flam;
    names[String(star.hip)] = entry;
  }

  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT_BIN, buffer);
  writeFileSync(OUT_NAMES, JSON.stringify(names));

  const bright = stars.filter((star) => star.mag <= 2).length;
  console.log(`HYG 原始行数        ${total}`);
  console.log(`保留（mag ≤ ${LIMIT_MAG}）  ${count}`);
  console.log(`其中 mag ≤ 2        ${bright}`);
  console.log(`stars.bin           ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`star-names.json     ${(JSON.stringify(names).length / 1024).toFixed(1)} KB（${Object.keys(names).length} 条）`);
  console.log(`最亮 5 颗           ${stars.slice(0, 5).map((s) => `${s.proper || s.hip}(${s.mag})`).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
