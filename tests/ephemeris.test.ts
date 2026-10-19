import { describe, expect, it } from 'vitest';
import { computeSnapshot, moonPhaseName, type GeoPoint } from '../src/core/ephemeris';

const SHANGHAI: GeoPoint = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };
const OBSERVED_AT = new Date('2026-10-19T12:00:00Z');

/** 两个赤道坐标之间的角距离，单位度。 */
function angularSeparation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const toRad = Math.PI / 180;
  const a1 = ra1 * 15 * toRad;
  const d1 = dec1 * toRad;
  const a2 = ra2 * 15 * toRad;
  const d2 = dec2 * toRad;
  const cosine = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / toRad;
}

/**
 * 参考值来自 JPL Horizons（2026-10-19 12:00 UTC，上海 121.4737E / 31.2304N，
 * 视赤经 / 视赤纬，含光行差，地平视差已计入）。
 * 容差 0.05° ≈ 3′，约为 astronomy-engine 标称精度的三倍。
 */
const HORIZONS = {
  mars: { ra: 8.9968056, dec: 18.46225 },
  jupiter: { ra: 9.6801639, dec: 14.5831667 },
  venus: { ra: 13.9140083, dec: -19.4133333 },
  moon: { ra: 20.5147972, dec: -21.6111389 },
} as const;

describe('computeSnapshot 对照 JPL Horizons', () => {
  const snapshot = computeSnapshot(OBSERVED_AT, SHANGHAI);

  for (const [id, reference] of Object.entries(HORIZONS)) {
    it(`${id} 与 Horizons 的角距离 < 0.05°`, () => {
      const body = snapshot.bodies.find((item) => item.id === id);
      expect(body).toBeDefined();
      const separation = angularSeparation(body!.rightAscension, body!.declination, reference.ra, reference.dec);
      expect(separation).toBeLessThan(0.05);
    });
  }
});

describe('computeSnapshot 物理合理性', () => {
  const snapshot = computeSnapshot(OBSERVED_AT, SHANGHAI);

  it('所有天体的高度与方位在合法区间', () => {
    for (const body of snapshot.bodies) {
      expect(body.altitude).toBeGreaterThanOrEqual(-90);
      expect(body.altitude).toBeLessThanOrEqual(90);
      expect(body.azimuth).toBeGreaterThanOrEqual(0);
      expect(body.azimuth).toBeLessThan(360);
    }
  });

  it('上海 20:00 判定为夜间，正午判定为白昼', () => {
    expect(snapshot.daylight).toBe(false);

    const noon = computeSnapshot(new Date('2026-10-19T04:00:00Z'), SHANGHAI);
    expect(noon.daylight).toBe(true);
    expect(noon.sunAltitude).toBeGreaterThan(40);
  });

  it('太阳赤纬在夏至附近等于黄赤交角', () => {
    const solstice = computeSnapshot(new Date('2024-06-20T20:51:00Z'), SHANGHAI);
    const sun = solstice.bodies.find((item) => item.id === 'sun');
    expect(Math.abs(sun!.declination - 23.44)).toBeLessThan(0.02);
  });

  it('2024-04-08 日全食时刻月相接近新月', () => {
    const eclipse = computeSnapshot(new Date('2024-04-08T18:17:00Z'), { latitude: 32.7, longitude: -96.8, elevation: 0 });
    const distance = Math.min(eclipse.moon.phaseDegrees, 360 - eclipse.moon.phaseDegrees);
    expect(distance).toBeLessThan(1);
    expect(eclipse.moon.illumination).toBeLessThan(0.01);
  });

  it('同一输入两次计算完全一致', () => {
    const first = computeSnapshot(OBSERVED_AT, SHANGHAI);
    const second = computeSnapshot(OBSERVED_AT, SHANGHAI);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('非法坐标被拒绝', () => {
    expect(() => computeSnapshot(OBSERVED_AT, { latitude: 91, longitude: 0, elevation: 0 })).toThrow();
    expect(() => computeSnapshot(OBSERVED_AT, { latitude: 0, longitude: 181, elevation: 0 })).toThrow();
    expect(() => computeSnapshot(new Date('invalid'), SHANGHAI)).toThrow();
  });
});

describe('moonPhaseName', () => {
  it('按相位角映射到中文月相', () => {
    expect(moonPhaseName(0)).toBe('新月');
    expect(moonPhaseName(90)).toBe('上弦月');
    expect(moonPhaseName(180)).toBe('满月');
    expect(moonPhaseName(270)).toBe('下弦月');
    expect(moonPhaseName(360)).toBe('新月');
    expect(moonPhaseName(-90)).toBe('下弦月');
  });
});
