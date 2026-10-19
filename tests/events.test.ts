import { describe, expect, it } from 'vitest';
import { findNightEvents } from '../src/core/events';
import type { NightWindow } from '../src/core/night';

const SHANGHAI = { latitude: 31.2304, longitude: 121.4737, elevation: 0 };

function windowOn(year: number, month: number, day: number): NightWindow {
  const sunset = new Date(Date.UTC(year, month - 1, day, 10, 30));
  const sunrise = new Date(Date.UTC(year, month - 1, day, 22, 0));
  return { sunset, sunrise, dusk: sunset, dawn: sunrise };
}

describe('findNightEvents', () => {
  it('没有夜晚窗口时返回空数组', () => {
    expect(findNightEvents(null, SHANGHAI)).toEqual([]);
  });

  it('识别流星雨极大日期', () => {
    const events = findNightEvents(windowOn(2026, 10, 21), SHANGHAI);
    expect(events.some((event) => event.title === '猎户座流星雨')).toBe(true);
  });

  it('普通夜晚没有流星雨', () => {
    const events = findNightEvents(windowOn(2026, 10, 19), SHANGHAI);
    expect(events.some((event) => event.kind === 'meteor')).toBe(false);
  });

  it('事件带有标题与说明', () => {
    for (const event of findNightEvents(windowOn(2026, 10, 21), SHANGHAI)) {
      expect(event.title.length).toBeGreaterThan(1);
      expect(event.detail.length).toBeGreaterThan(1);
    }
  });
});
