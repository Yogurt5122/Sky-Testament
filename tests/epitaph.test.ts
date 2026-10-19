import { describe, expect, it } from 'vitest';
import { canonicalKey, FORBIDDEN_WORDS, generateEpitaph, type EpitaphInput } from '../src/core/text/epitaph';
import type { SkyFacts } from '../src/core/text/facts';
import { Rng } from '../src/core/text/prng';
import { encodeUtf8, sha256Hex } from '../src/core/text/sha256';

const facts: SkyFacts = {
  moonPhaseName: '上弦月',
  moonIllumination: 0.58,
  planets: [{ name: '木星', direction: '东' }],
  brightestStar: '天狼星',
  season: '秋',
  daylight: false,
};

const base: EpitaphInput = {
  facts,
  utc: '2026-10-19T12:00:00.000Z',
  latitude: 30.6667,
  longitude: 104.0667,
  style: 'classical',
  variant: 0,
};

describe('sha256', () => {
  it('匹配标准测试向量', () => {
    expect(sha256Hex(encodeUtf8('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(encodeUtf8(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('中文输入按 UTF-8 编码', () => {
    expect(sha256Hex(encodeUtf8('天穹'))).toHaveLength(64);
  });
});

describe('Rng', () => {
  const seedBytes = Uint8Array.from({ length: 16 }, (_, index) => (index * 37 + 11) & 0xff);

  it('同一种子产生同一序列', () => {
    const a = new Rng(seedBytes);
    const b = new Rng(seedBytes);
    const sequenceA = Array.from({ length: 8 }, () => a.next());
    const sequenceB = Array.from({ length: 8 }, () => b.next());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('不同种子产生不同序列', () => {
    const other = Uint8Array.from({ length: 16 }, (_, index) => (index * 53 + 3) & 0xff);
    expect(new Rng(seedBytes).next()).not.toBe(new Rng(other).next());
  });
});

describe('generateEpitaph', () => {
  it('同一输入逐字一致', () => {
    expect(generateEpitaph(base).text).toBe(generateEpitaph(base).text);
    expect(generateEpitaph(base).seed).toBe(generateEpitaph(base).seed);
  });

  it('种子只由输入决定，不含语料内容', () => {
    const otherFacts = { ...facts, moonPhaseName: '满月', brightestStar: '织女星' };
    expect(generateEpitaph({ ...base, facts: otherFacts }).seed).toBe(generateEpitaph(base).seed);
  });

  it('换一版会得到不同文字', () => {
    const texts = new Set(Array.from({ length: 8 }, (_, index) => generateEpitaph({ ...base, variant: index }).text));
    expect(texts.size).toBeGreaterThan(4);
  });

  it('古典与现代的文体不同', () => {
    const classical = generateEpitaph(base).text;
    const modern = generateEpitaph({ ...base, style: 'modern' }).text;
    expect(classical).not.toBe(modern);
    expect(modern).toContain('。');
  });

  it('不出现预测性或命理词汇', () => {
    for (const style of ['classical', 'modern'] as const) {
      for (let variant = 0; variant < 40; variant += 1) {
        const text = generateEpitaph({ ...base, style, variant }).text;
        for (const word of FORBIDDEN_WORDS) {
          expect(text).not.toContain(word);
        }
      }
    }
  });

  it('月相描述与事实一致', () => {
    const fullMoon = generateEpitaph({
      ...base,
      facts: { ...facts, moonPhaseName: '满月', moonIllumination: 1 },
      variant: 3,
    }).text;
    expect(fullMoon).toMatch(/月正圆|满月当空|月明如昼/);
    expect(fullMoon).not.toMatch(/月如钩|一痕新月/);
  });

  it('长度在可读范围内', () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const classical = generateEpitaph({ ...base, variant }).text;
      expect(classical.length).toBeGreaterThanOrEqual(14);
      expect(classical.length).toBeLessThanOrEqual(90);
    }
  });

  it('canonicalKey 使用 UTC 与四位小数坐标', () => {
    const key = canonicalKey(base);
    expect(key).toContain('2026-10-19T12:00:00.000Z');
    expect(key).toContain('30.6667');
    expect(key).toContain('classical');
  });
});
