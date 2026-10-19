export interface WallClock {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** IANA 时区，例如 Asia/Shanghai */
  timeZone: string;
}

export interface ZonedInstant {
  utc: Date;
  /** 该时刻当地的 UTC 偏移，单位秒 */
  offsetSeconds: number;
  /** 本地时间在该时区出现两次（夏令时回拨） */
  ambiguous: boolean;
  /** 本地时间不存在（夏令时前拨），已按惯例向后顺延 */
  skipped: boolean;
}

const MS_PER_DAY = 86_400_000;

function parsePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const part = parts.find((item) => item.type === type);
  if (!part) throw new Error(`Intl 输出缺少字段: ${type}`);
  return Number(part.value);
}

/**
 * 某一 UTC 时刻在指定时区的偏移（秒）。
 *
 * 依赖运行环境的 IANA 数据（浏览器 Intl / Node ICU），不同版本可能对
 * 1970 年之前的规则有差异。因此项目把确定性锚定在 UTC 时刻，而不是本地时间。
 */
export function offsetSecondsAt(utcMs: number, timeZone: string): number {
  const base = Math.floor(utcMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(base));

  // 部分 ICU 在午夜返回 24 时
  const hour = parsePart(parts, 'hour') % 24;
  const asUtc = Date.UTC(
    parsePart(parts, 'year'),
    parsePart(parts, 'month') - 1,
    parsePart(parts, 'day'),
    hour,
    parsePart(parts, 'minute'),
    parsePart(parts, 'second'),
  );

  return Math.round((asUtc - base) / 1000);
}

/** 把「某时区的墙上时间」解析为 UTC 时刻。 */
export function resolveLocalTime(clock: WallClock): ZonedInstant {
  const guess = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, 0);

  // 前后各取两天，覆盖所有可能出现的历史偏移
  const probes = [-2, -1, 0, 1, 2].map((day) => guess + day * MS_PER_DAY);
  const offsets = [...new Set(probes.map((probe) => offsetSecondsAt(probe, clock.timeZone)))];

  const candidates: number[] = [];
  for (const offset of offsets) {
    const instant = guess - offset * 1000;
    if (offsetSecondsAt(instant, clock.timeZone) === offset) candidates.push(instant);
  }
  candidates.sort((a, b) => a - b);

  if (candidates.length > 0) {
    const instant = candidates[0];
    return {
      utc: new Date(instant),
      offsetSeconds: offsetSecondsAt(instant, clock.timeZone),
      ambiguous: candidates.length > 1,
      skipped: false,
    };
  }

  // 夏令时前拨导致该本地时间不存在：用跳变前的偏移，结果落到跳变之后
  const before = offsetSecondsAt(guess - MS_PER_DAY, clock.timeZone);
  const instant = guess - before * 1000;
  return {
    utc: new Date(instant),
    offsetSeconds: offsetSecondsAt(instant, clock.timeZone),
    ambiguous: false,
    skipped: true,
  };
}

export function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const totalMinutes = Math.round(Math.abs(offsetSeconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface LocalDateTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** 便于展示的 HH:mm */
  label: string;
}

/** 把 UTC 时刻换算成某时区的日期与时间，用于回填输入框。 */
export function localDateTimeOf(instant: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);

  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = pick('hour') === '24' ? '00' : pick('hour');

  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${hour}:${pick('minute')}`,
    label: `${hour}:${pick('minute')}`,
  };
}
