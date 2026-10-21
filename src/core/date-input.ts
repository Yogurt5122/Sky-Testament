/**
 * 日期输入解析：允许用户直接敲年月日，不依赖系统日期选择器。
 *
 * 接受：
 *   1998-05-12 / 1998-5-12
 *   1998/5/12、1998.5.12、1998 5 12
 *   1998年5月12日
 *   19980512
 * 全角数字与全角分隔符会先归一化。
 * 返回 YYYY-MM-DD；不合法或不存在的一天（如 2 月 30 日）返回 null。
 */

const FULL_WIDTH_DIGITS = /[０-９]/g;
const FULL_WIDTH_SEPARATORS = /[／．－—–]/g;

function normalize(input: string): string {
  return input
    .trim()
    .replace(FULL_WIDTH_DIGITS, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(FULL_WIDTH_SEPARATORS, (char) => {
      if (char === '／') return '/';
      if (char === '．') return '.';
      return '-';
    });
}

/** 日期必须是日历上真实存在的一天 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function parseDateInput(input: string): string | null {
  const value = normalize(input);
  if (!value) return null;

  let year: number;
  let month: number;
  let day: number;

  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    year = Number(compact[1]);
    month = Number(compact[2]);
    day = Number(compact[3]);
  } else {
    const separated =
      value.match(/^(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})$/) ??
      value.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
    if (!separated) return null;
    year = Number(separated[1]);
    month = Number(separated[2]);
    day = Number(separated[3]);
  }

  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 把 YYYY-MM-DD 显示成 1998.05.12，用于提示 */
export function formatDateLabel(value: string): string {
  return value.replace(/-/g, '.');
}
