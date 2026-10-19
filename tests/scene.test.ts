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

  it('地平线以上的行星都会出现，月亮单独成盘', () => {
    const visible = night.bodies.filter(
      (body) =>
        body.altitude > 0.5 &&
        !(body.id === 'sun' && !night.daylight) &&
        body.id !== 'moon',
    );
    expect(scene.planets.length).toBe(visible.length);
    expect(scene.moon).not.toBeNull();
    expect(scene.moon!.illumination).toBeGreaterThan(0);
    expect(scene.moon!.waxing).toBe(true);
  });

  it('极限星等会减少星数', () => {
    const city = buildChartScene(night, stars, names, { limitingMagnitude: 4.0 });
    expect(city.starCount).toBeLessThan(scene.starCount);
    expect(city.limitingMagnitude).toBe(4.0);
  });

  it('恒星按颜色分箱落在 0–3', () => {
    for (const bucket of scene.buckets) {
      expect(bucket.colorBin).toBeGreaterThanOrEqual(0);
      expect(bucket.colorBin).toBeLessThanOrEqual(3);
    }
  });

  it('纯净档不画标注、星座与参考线', () => {
    const minimal = buildChartScene(night, stars, names, { detail: 'minimal' });
    expect(minimal.detail).toBe('minimal');
    expect(minimal.labels).toHaveLength(0);
    expect(minimal.constellations).toHaveLength(0);
    expect(minimal.ecliptic).toBe('');
    expect(minimal.equator).toBe('');
    // 星星本身不受影响
    expect(minimal.starCount).toBe(scene.starCount);
  });

  it('图谱档叠加黄道、天赤道与更多标注', () => {
    const atlas = buildChartScene(night, stars, names, { detail: 'atlas' });
    expect(atlas.detail).toBe('atlas');
    expect(atlas.ecliptic.length).toBeGreaterThan(100);
    expect(atlas.equator.length).toBeGreaterThan(100);
    expect(atlas.labels.some((label) => label.text === '黄道')).toBe(true);
    expect(atlas.labels.some((label) => label.text === '天赤道')).toBe(true);
    expect(atlas.labels.length).toBeGreaterThan(scene.labels.length);
    expect(atlas.labels.some((label) => label.text.includes('等'))).toBe(true);
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
