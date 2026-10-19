import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyProperMotion, J2000_MS, parseStarCatalog, starHorizontal } from '../src/core/starcatalog';

const fileBuffer = readFileSync('public/data/stars.bin');
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
const stars = parseStarCatalog(arrayBuffer);

const SHANGHAI = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };

describe('parseStarCatalog', () => {
  it('数量与星等在合理范围', () => {
    expect(stars.length).toBeGreaterThan(8000);
    expect(stars.length).toBeLessThan(12000);
    for (const star of stars) {
      expect(star.mag).toBeLessThanOrEqual(6.5);
      expect(star.ra).toBeGreaterThanOrEqual(0);
      expect(star.ra).toBeLessThan(24);
      expect(star.dec).toBeGreaterThanOrEqual(-90);
      expect(star.dec).toBeLessThanOrEqual(90);
    }
  });

  it('按星等升序排列', () => {
    for (let i = 1; i < stars.length; i += 1) {
      expect(stars[i].mag).toBeGreaterThanOrEqual(stars[i - 1].mag);
    }
  });

  it('包含天狼星且 J2000 坐标正确', () => {
    const sirius = stars.find((star) => star.hip === 32349);
    expect(sirius).toBeDefined();
    expect(sirius!.mag).toBeCloseTo(-1.44, 1);
    expect(sirius!.ra).toBeCloseTo(6.752, 2);
    expect(sirius!.dec).toBeCloseTo(-16.716, 2);
  });

  it('拒绝损坏的文件', () => {
    expect(() => parseStarCatalog(new ArrayBuffer(4))).toThrow();
    const bad = arrayBuffer.slice(0, 100);
    expect(() => parseStarCatalog(bad)).toThrow();
  });
});

describe('applyProperMotion', () => {
  it('天狼星 100 年后赤纬下降约 0.034°', () => {
    const sirius = stars.find((star) => star.hip === 32349)!;
    const later = applyProperMotion(sirius, J2000_MS + 100 * 365.25 * 86_400_000);
    expect(sirius.dec - later.dec).toBeCloseTo(0.03397, 3);
  });

  it('J2000 时刻不改变坐标', () => {
    const sirius = stars.find((star) => star.hip === 32349)!;
    const same = applyProperMotion(sirius, J2000_MS);
    expect(same.ra).toBeCloseTo(sirius.ra, 6);
    expect(same.dec).toBeCloseTo(sirius.dec, 6);
  });
});

describe('starHorizontal', () => {
  it('北极星的高度约等于纬度', () => {
    const polaris = stars.find((star) => star.hip === 11767);
    expect(polaris).toBeDefined();
    const position = starHorizontal(applyProperMotion(polaris!, Date.UTC(2026, 9, 19, 12)), new Date(Date.UTC(2026, 9, 19, 12)), SHANGHAI);
    expect(Math.abs(position.altitude - SHANGHAI.latitude)).toBeLessThan(1.5);
  });

  it('天狼星在上海某一时刻位于地平线以下', () => {
    const sirius = stars.find((star) => star.hip === 32349)!;
    const when = new Date(Date.UTC(2026, 9, 19, 12));
    const position = starHorizontal(applyProperMotion(sirius, when.getTime()), when, SHANGHAI);
    expect(position.altitude).toBeLessThan(0);
    expect(position.azimuth).toBeGreaterThanOrEqual(0);
    expect(position.azimuth).toBeLessThan(360);
  });
});
