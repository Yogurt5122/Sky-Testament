import { describe, expect, it } from 'vitest';
import { computeNightWindow } from '../src/core/night';

const SHANGHAI = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };

describe('computeNightWindow', () => {
  it('夜间输入落在日落到日出之间', () => {
    const instant = new Date('2026-10-19T12:00:00Z'); // 上海 20:00
    const window = computeNightWindow(instant, SHANGHAI);
    expect(window).not.toBeNull();
    expect(window!.sunset.getTime()).toBeLessThan(instant.getTime());
    expect(window!.sunrise.getTime()).toBeGreaterThan(instant.getTime());
  });

  it('十月的上海夜长在 9–13 小时之间', () => {
    const window = computeNightWindow(new Date('2026-10-19T12:00:00Z'), SHANGHAI)!;
    const hours = (window.sunrise.getTime() - window.sunset.getTime()) / 3600e3;
    expect(hours).toBeGreaterThan(9);
    expect(hours).toBeLessThan(13);
  });

  it('暮光与晨光包住夜晚', () => {
    const window = computeNightWindow(new Date('2026-10-19T12:00:00Z'), SHANGHAI)!;
    expect(window.dusk.getTime()).toBeGreaterThanOrEqual(window.sunset.getTime());
    expect(window.dawn.getTime()).toBeLessThanOrEqual(window.sunrise.getTime());
    expect(window.dusk.getTime()).toBeLessThan(window.dawn.getTime());
  });

  it('白天输入时返回的是今晚', () => {
    const noon = new Date('2026-10-19T04:00:00Z'); // 上海 12:00
    const window = computeNightWindow(noon, SHANGHAI)!;
    expect(window.sunset.getTime()).toBeGreaterThan(noon.getTime());
    expect(window.sunrise.getTime()).toBeGreaterThan(window.sunset.getTime());
  });

  it('极昼地点返回 null', () => {
    const window = computeNightWindow(new Date('2026-06-21T12:00:00Z'), {
      latitude: 78.2,
      longitude: 15.6,
      elevation: 0,
    });
    expect(window).toBeNull();
  });
});
