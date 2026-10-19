import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { bodyDetails, nextStarTransit, starDetails } from '../src/core/details';
import { computeSnapshot } from '../src/core/ephemeris';

const SHANGHAI = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };
const snapshot = computeSnapshot(new Date('2026-10-19T12:00:00Z'), SHANGHAI);
const TZ = 'Asia/Shanghai';

describe('nextStarTransit', () => {
  it('中天时刻的本地恒星时等于赤经', () => {
    const from = new Date('2026-10-19T12:00:00Z');
    const transit = nextStarTransit(6, from, SHANGHAI.longitude);
    const lst = Astronomy.SiderealTime(transit) + SHANGHAI.longitude / 15;
    const delta = (((6 - lst) % 24) + 24) % 24;
    expect(Math.min(delta, 24 - delta)).toBeLessThan(0.01);
  });

  it('中天总是发生在之后 24 小时内', () => {
    const from = new Date('2026-10-19T12:00:00Z');
    const transit = nextStarTransit(23.5, from, SHANGHAI.longitude);
    const hours = (transit.getTime() - from.getTime()) / 3600e3;
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThan(24);
  });
});

describe('starDetails', () => {
  it('包含星等、色指数、坐标与中天', () => {
    const star = {
      hip: 32349,
      ra: 6.752481,
      dec: -16.716116,
      mag: -1.44,
      ci: 0.009,
      pmra: -546.01,
      pmdec: -1223.08,
    };
    const details = starDetails(star, '天狼星', snapshot, TZ);
    expect(details.title).toBe('天狼星');
    expect(details.rows.map((row) => row.label)).toContain('色指数 B−V');
    expect(details.rows.map((row) => row.label)).toContain('今夜中天');
    expect(details.rows.find((row) => row.label === '星等')?.value).toBe('-1.44');
  });
});

describe('bodyDetails', () => {
  it('行星包含升落与中天', () => {
    const details = bodyDetails('jupiter', '木星', snapshot, TZ);
    const labels = details.rows.map((row) => row.label);
    expect(labels).toContain('升起');
    expect(labels).toContain('落下');
    expect(labels).toContain('中天');
  });

  it('月亮额外显示月相', () => {
    const details = bodyDetails('moon', '月亮', snapshot, TZ);
    expect(details.rows.some((row) => row.label === '月相')).toBe(true);
  });
});
