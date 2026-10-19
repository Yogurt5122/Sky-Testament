import * as Astronomy from 'astronomy-engine';
import type { SkySnapshot } from './ephemeris';
import { applyProperMotion, starHorizontal, type Star } from './starcatalog';
import { localDateTimeOf } from './time';

export interface DetailRow {
  label: string;
  value: string;
}

export interface ObjectDetails {
  title: string;
  subtitle: string;
  rows: DetailRow[];
}

const BODY_BY_ID: Record<string, Astronomy.Body> = {
  sun: Astronomy.Body.Sun,
  moon: Astronomy.Body.Moon,
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
};

/** 恒星下一次中天的时刻：用恒星时解算，比逐分钟搜索快得多。 */
export function nextStarTransit(raHours: number, from: Date, longitude: number): Date {
  const gmst = Astronomy.SiderealTime(from);
  const lst = (((gmst + longitude / 15) % 24) + 24) % 24;
  const delta = (((raHours - lst) % 24) + 24) % 24;
  const hours = delta / 1.00273790935;
  return new Date(from.getTime() + hours * 3600e3);
}

function formatTime(date: Date | null, timeZone: string): string {
  if (!date) return '—';
  return localDateTimeOf(date, timeZone).label;
}

function formatRa(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatDec(degrees: number): string {
  return `${degrees >= 0 ? '+' : ''}${degrees.toFixed(1)}°`;
}

function sign(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}°`;
}

export function starDetails(
  star: Star,
  name: string | null,
  snapshot: SkySnapshot,
  timeZone: string,
): ObjectDetails {
  const utc = new Date(snapshot.utc);
  const moved = applyProperMotion(star, utc.getTime());
  const horizontal = starHorizontal(moved, utc, snapshot.geo);
  const transit = nextStarTransit(moved.ra, utc, snapshot.geo.longitude);

  return {
    title: name ?? `HIP ${star.hip}`,
    subtitle: '恒星',
    rows: [
      { label: '星等', value: star.mag.toFixed(2) },
      { label: '色指数 B−V', value: star.ci.toFixed(2) },
      { label: '赤经 / 赤纬', value: `${formatRa(moved.ra)} ${formatDec(moved.dec)}` },
      { label: '高度 / 方位', value: `${sign(horizontal.altitude)} ${horizontal.azimuth.toFixed(0)}°` },
      { label: '今夜中天', value: formatTime(transit, timeZone) },
    ],
  };
}

export function bodyDetails(
  bodyId: string,
  name: string,
  snapshot: SkySnapshot,
  timeZone: string,
): ObjectDetails {
  const body = BODY_BY_ID[bodyId];
  const utc = new Date(snapshot.utc);
  const observer = new Astronomy.Observer(
    snapshot.geo.latitude,
    snapshot.geo.longitude,
    snapshot.geo.elevation,
  );

  const position = snapshot.bodies.find((item) => item.id === bodyId);

  const rows: DetailRow[] = [
    { label: '星等', value: position?.magnitude !== null && position?.magnitude !== undefined ? position.magnitude.toFixed(1) : '—' },
    { label: '高度 / 方位', value: position ? `${sign(position.altitude)} ${position.azimuth.toFixed(0)}°` : '—' },
  ];

  if (bodyId === 'moon') {
    rows.push({ label: '月相', value: `${snapshot.moon.phaseName} · ${(snapshot.moon.illumination * 100).toFixed(0)}%` });
  }

  const rise = body
    ? Astronomy.SearchRiseSet(body, observer, +1, Astronomy.MakeTime(utc), 2)
    : null;
  const set = body
    ? Astronomy.SearchRiseSet(body, observer, -1, Astronomy.MakeTime(utc), 2)
    : null;
  const transit = body
    ? Astronomy.SearchHourAngle(body, observer, 0, Astronomy.MakeTime(utc))
    : null;

  rows.push(
    { label: '升起', value: formatTime(rise?.date ?? null, timeZone) },
    { label: '落下', value: formatTime(set?.date ?? null, timeZone) },
    { label: '中天', value: formatTime(transit?.time.date ?? null, timeZone) },
  );

  return { title: name, subtitle: '太阳系天体', rows };
}
