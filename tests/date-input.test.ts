import { describe, expect, it } from 'vitest';
import { isValidCalendarDate, parseDateInput } from '../src/core/date-input';

describe('parseDateInput', () => {
  it('接受常见的年月日写法', () => {
    expect(parseDateInput('1998-05-12')).toBe('1998-05-12');
    expect(parseDateInput('1998-5-12')).toBe('1998-05-12');
    expect(parseDateInput('1998/5/12')).toBe('1998-05-12');
    expect(parseDateInput('1998.5.12')).toBe('1998-05-12');
    expect(parseDateInput('1998 5 12')).toBe('1998-05-12');
    expect(parseDateInput('1998年5月12日')).toBe('1998-05-12');
    expect(parseDateInput('19980512')).toBe('1998-05-12');
  });

  it('归一化全角数字与分隔符', () => {
    expect(parseDateInput('１９９８－５－１２')).toBe('1998-05-12');
    expect(parseDateInput('１９９８年５月１２日')).toBe('1998-05-12');
  });

  it('拒绝不存在的日期', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('2025-02-29')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull();
    expect(parseDateInput('2026-00-10')).toBeNull();
    expect(parseDateInput('1998-05')).toBeNull();
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('明天')).toBeNull();
  });

  it('接受闰年 2 月 29 日', () => {
    expect(parseDateInput('2024-02-29')).toBe('2024-02-29');
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
    expect(isValidCalendarDate(2025, 2, 29)).toBe(false);
  });
});
