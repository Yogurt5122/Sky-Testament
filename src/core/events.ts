import * as Astronomy from 'astronomy-engine';
import type { GeoPoint } from './ephemeris';
import type { NightWindow } from './night';

export type NightEventKind = 'eclipse' | 'conjunction' | 'meteor';

export interface NightEvent {
  kind: NightEventKind;
  /** 例如「月全食」「月合木星」「英仙座流星雨」 */
  title: string;
  detail: string;
  at: Date | null;
}

/** 北半球主要流星雨（IMO 的峰值日期，取常见年份的近似值）。 */
const METEOR_SHOWERS: Array<{ month: number; day: number; name: string; zhr: number }> = [
  { month: 1, day: 3, name: '象限仪座流星雨', zhr: 110 },
  { month: 4, day: 22, name: '天琴座流星雨', zhr: 18 },
  { month: 5, day: 6, name: '宝瓶座 η 流星雨', zhr: 50 },
  { month: 8, day: 12, name: '英仙座流星雨', zhr: 100 },
  { month: 10, day: 21, name: '猎户座流星雨', zhr: 20 },
  { month: 11, day: 17, name: '狮子座流星雨', zhr: 15 },
  { month: 12, day: 14, name: '双子座流星雨', zhr: 150 },
  { month: 12, day: 22, name: '小熊座流星雨', zhr: 10 },
];

const CONJUNCTION_BODIES: Array<{ body: Astronomy.Body; name: string }> = [
  { body: Astronomy.Body.Mercury, name: '水星' },
  { body: Astronomy.Body.Venus, name: '金星' },
  { body: Astronomy.Body.Mars, name: '火星' },
  { body: Astronomy.Body.Jupiter, name: '木星' },
  { body: Astronomy.Body.Saturn, name: '土星' },
];

function angularSeparation(
  ra1: number,
  dec1: number,
  ra2: number,
  dec2: number,
): number {
  const toRad = Math.PI / 180;
  const a1 = ra1 * 15 * toRad;
  const d1 = dec1 * toRad;
  const a2 = ra2 * 15 * toRad;
  const d2 = dec2 * toRad;
  const cosine = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / toRad;
}

function lunarEclipse(window: NightWindow, geo: GeoPoint): NightEvent | null {
  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const start = new Date(window.sunset.getTime() - 60 * 86400e3);

  let eclipse = Astronomy.SearchLunarEclipse(start);
  for (let index = 0; index < 10; index += 1) {
    const peak = eclipse.peak.date;
    if (peak.getTime() > window.sunrise.getTime()) return null;

    if (peak.getTime() >= window.sunset.getTime() - 30 * 60000) {
      const time = Astronomy.MakeTime(peak);
      const eq = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true);
      const altitude = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude;
      if (altitude <= 0) return null;

      const title =
        eclipse.kind === Astronomy.EclipseKind.Total
          ? '月全食'
          : eclipse.kind === Astronomy.EclipseKind.Partial
            ? '月偏食'
            : '半影月食';
      return {
        kind: 'eclipse',
        title,
        detail:
          eclipse.kind === Astronomy.EclipseKind.Partial
            ? `食分 ${(eclipse.obscuration * 100).toFixed(0)}%`
            : '月球进入地球影子',
        at: peak,
      };
    }
    eclipse = Astronomy.NextLunarEclipse(eclipse.peak);
  }
  return null;
}

function conjunction(window: NightWindow, geo: GeoPoint): NightEvent | null {
  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const start = window.sunset.getTime();
  const end = window.sunrise.getTime();
  const step = 10 * 60000;

  let best: { separation: number; at: Date; name: string } | null = null;

  for (const target of CONJUNCTION_BODIES) {
    for (let time = start; time <= end; time += step) {
      const date = new Date(time);
      const astroTime = Astronomy.MakeTime(date);
      const moon = Astronomy.Equator(Astronomy.Body.Moon, astroTime, observer, true, true);
      const planet = Astronomy.Equator(target.body, astroTime, observer, true, true);
      const separation = angularSeparation(moon.ra, moon.dec, planet.ra, planet.dec);

      if (separation < 5 && (!best || separation < best.separation)) {
        best = { separation, at: date, name: target.name };
      }
    }
  }

  if (!best) return null;
  return {
    kind: 'conjunction',
    title: `月合${best.name}`,
    detail: `角距 ${best.separation.toFixed(1)}°`,
    at: best.at,
  };
}

function meteorShower(window: NightWindow): NightEvent | null {
  // 用日落与日出所在的 UTC 日期去匹配峰值日
  const dates = [window.sunset, window.sunrise].map(
    (date) => `${date.getUTCMonth() + 1}-${date.getUTCDate()}`,
  );

  for (const shower of METEOR_SHOWERS) {
    const key = `${shower.month}-${shower.day}`;
    if (dates.includes(key)) {
      return {
        kind: 'meteor',
        title: shower.name,
        detail: `极大期 · 天顶每小时约 ${shower.zhr} 颗`,
        at: null,
      };
    }
  }
  return null;
}

/** 这一夜值得记住的天象：月食、月合行星、流星雨极大。 */
export function findNightEvents(window: NightWindow | null, geo: GeoPoint): NightEvent[] {
  if (!window) return [];

  const events: NightEvent[] = [];
  const eclipse = lunarEclipse(window, geo);
  if (eclipse) events.push(eclipse);

  const meet = conjunction(window, geo);
  if (meet) events.push(meet);

  const meteor = meteorShower(window);
  if (meteor) events.push(meteor);

  return events;
}
