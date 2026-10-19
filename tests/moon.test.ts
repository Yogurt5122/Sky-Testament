import { describe, expect, it } from 'vitest';
import { moonPhasePath } from '../src/render/Chart';
import type { MoonDisc } from '../src/render/scene';

const base: MoonDisc = {
  x: 100,
  y: 100,
  r: 10,
  illumination: 0.5,
  waxing: true,
  phaseName: '上弦月',
};

describe('moonPhasePath', () => {
  it('新月不画亮区', () => {
    expect(moonPhasePath({ ...base, illumination: 0 })).toBe('');
  });

  it('满月是一个完整圆', () => {
    const path = moonPhasePath({ ...base, illumination: 1 });
    expect(path).toContain('a10,10');
    expect(path).not.toContain('A0,10');
  });

  it('半月亮区是半圆（内弧退化为直线）', () => {
    const path = moonPhasePath({ ...base, illumination: 0.5 });
    expect(path).toContain('A0,10');
  });

  it('盈与亏的弧线方向相反', () => {
    const waxing = moonPhasePath({ ...base, waxing: true });
    const waning = moonPhasePath({ ...base, waxing: false });
    expect(waxing).not.toBe(waning);
  });

  it('内弧半轴随照亮比例变化', () => {
    expect(moonPhasePath({ ...base, illumination: 0.1 })).toContain('A8,10');
    expect(moonPhasePath({ ...base, illumination: 0.4 })).toContain('A2,10');
    expect(moonPhasePath({ ...base, illumination: 0.5 })).toContain('A0,10');
  });

  it('起点在月亮正上方', () => {
    expect(moonPhasePath(base).startsWith('M100,90')).toBe(true);
  });
});
