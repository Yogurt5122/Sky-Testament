import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeSnapshot } from '../src/core/ephemeris';
import { parseStarCatalog } from '../src/core/starcatalog';
import { buildChartScene } from '../src/render/scene';

const fileBuffer = readFileSync('public/data/stars.bin');
const stars = parseStarCatalog(
  fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
);
const SHANGHAI = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };
const names = new Map<number, string>([[32349, '天狼星']]);

describe('buildChartScene', () => {
  const night = computeSnapshot(new Date('2026-10-19T12:00:00Z'), SHANGHAI);
  const scene = buildChartScene(night, stars, names);

  it('夜间可见数千颗恒星', () => {
    expect(scene.starCount).toBeGreaterThan(3000);
    expect(scene.starCount).toBeLessThan(6000);
  });

  it('每个星等分桶都有路径数据', () => {
    for (const bucket of scene.buckets) {
      expect(bucket.d.length).toBeGreaterThan(0);
      expect(bucket.count).toBeGreaterThan(0);
    }
  });

  it('至少画出一半的星座', () => {
    expect(scene.constellations.length).toBeGreaterThanOrEqual(4);
    for (const figure of scene.constellations) {
      expect(figure.d).toContain('M');
      expect(figure.name.length).toBeGreaterThan(1);
    }
  });

  it('地平线以上的行星都会出现', () => {
    const visible = night.bodies.filter(
      (body) => body.altitude > 0.5 && !(body.id === 'sun' && !night.daylight),
    );
    expect(scene.planets.length).toBe(visible.length);
  });

  it('标签互不重叠且都在画布内', () => {
    for (let i = 0; i < scene.labels.length; i += 1) {
      const a = scene.labels[i];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(scene.size);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(scene.size);
    }
  });

  it('白天模式会被标记', () => {
    const noon = computeSnapshot(new Date('2026-10-19T04:00:00Z'), SHANGHAI);
    const dayScene = buildChartScene(noon, stars, names);
    expect(dayScene.daylight).toBe(true);
  });

  it('同一输入场景可复现', () => {
    const again = buildChartScene(night, stars, names);
    expect(JSON.stringify(again)).toBe(JSON.stringify(scene));
  });
});
