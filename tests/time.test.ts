import { describe, expect, it } from 'vitest';
import { formatOffset, isValidTimeZone, resolveLocalTime } from '../src/core/time';

describe('resolveLocalTime', () => {
  it('上海常规时间：+08:00', () => {
    const resolved = resolveLocalTime({
      year: 2026,
      month: 10,
      day: 19,
      hour: 20,
      minute: 0,
      timeZone: 'Asia/Shanghai',
    });

    expect(resolved.utc.toISOString()).toBe('2026-10-19T12:00:00.000Z');
    expect(resolved.offsetSeconds).toBe(8 * 3600);
    expect(resolved.ambiguous).toBe(false);
    expect(resolved.skipped).toBe(false);
  });

  it('中国 1988 年夏令时：+09:00', () => {
    const resolved = resolveLocalTime({
      year: 1988,
      month: 7,
      day: 1,
      hour: 12,
      minute: 0,
      timeZone: 'Asia/Shanghai',
    });

    expect(resolved.offsetSeconds).toBe(9 * 3600);
    expect(resolved.utc.toISOString()).toBe('1988-07-01T03:00:00.000Z');
  });

  it('纽约回拨：01:30 出现两次，取较早的一次', () => {
    const resolved = resolveLocalTime({
      year: 2023,
      month: 11,
      day: 5,
      hour: 1,
      minute: 30,
      timeZone: 'America/New_York',
    });

    expect(resolved.ambiguous).toBe(true);
    expect(resolved.utc.toISOString()).toBe('2023-11-05T05:30:00.000Z');
    expect(resolved.offsetSeconds).toBe(-4 * 3600);
  });

  it('纽约前拨：02:30 不存在，向后顺延为 03:30', () => {
    const resolved = resolveLocalTime({
      year: 2023,
      month: 3,
      day: 12,
      hour: 2,
      minute: 30,
      timeZone: 'America/New_York',
    });

    expect(resolved.skipped).toBe(true);
    expect(resolved.utc.toISOString()).toBe('2023-03-12T07:30:00.000Z');
  });

  it('UTC 时区偏移为零', () => {
    const resolved = resolveLocalTime({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      timeZone: 'UTC',
    });

    expect(resolved.offsetSeconds).toBe(0);
    expect(resolved.utc.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('formatOffset', () => {
  it('格式化正负偏移', () => {
    expect(formatOffset(8 * 3600)).toBe('+08:00');
    expect(formatOffset(-4 * 3600)).toBe('-04:00');
    expect(formatOffset(5 * 3600 + 30 * 60)).toBe('+05:30');
    expect(formatOffset(0)).toBe('+00:00');
  });
});

describe('isValidTimeZone', () => {
  it('识别合法与非法时区', () => {
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
