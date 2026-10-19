import * as Astronomy from 'astronomy-engine';
import type { GeoPoint } from './ephemeris';

export interface NightWindow {
  /** 日落（太阳上缘触及地平线附近的几何日落） */
  sunset: Date;
  /** 次日日出 */
  sunrise: Date;
  /** 民用暮光结束（太阳降至 −6°） */
  dusk: Date;
  /** 民用晨光开始（太阳升至 −6°） */
  dawn: Date;
}

function sunAltitude(utc: Date, geo: GeoPoint): number {
  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const time = Astronomy.MakeTime(utc);
  const equatorial = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
  return Astronomy.Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal').altitude;
}

/**
 * 找出包含（或紧接着）给定时刻的那个夜晚。
 *
 * 白天输入时返回"今晚"；夜里输入时返回"昨夜到今晨"。
 * 极昼 / 极夜情况下返回 null。
 */
export function computeNightWindow(utc: Date, geo: GeoPoint): NightWindow | null {
  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const start = Astronomy.MakeTime(utc);
  const daytime = sunAltitude(utc, geo) > 0;

  let sunsetTime: Astronomy.AstroTime | null;
  let sunriseTime: Astronomy.AstroTime | null;

  if (daytime) {
    sunsetTime = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, start, 2);
    sunriseTime = sunsetTime
      ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, sunsetTime, 2)
      : null;
  } else {
    sunriseTime = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, start, 2);
    // 从日出前 24 小时开始向前找，得到的是同一个夜晚的日落
    sunsetTime = sunriseTime
      ? Astronomy.SearchRiseSet(
          Astronomy.Body.Sun,
          observer,
          -1,
          Astronomy.MakeTime(new Date(sunriseTime.date.getTime() - 24 * 3600 * 1000)),
          2,
        )
      : null;
  }

  if (!sunsetTime || !sunriseTime) return null;

  const duskTime = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, sunsetTime, 1, -6);
  const dawnTime = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    +1,
    duskTime ?? sunsetTime,
    1,
    -6,
  );

  return {
    sunset: sunsetTime.date,
    sunrise: sunriseTime.date,
    dusk: duskTime?.date ?? sunsetTime.date,
    dawn: dawnTime?.date ?? sunriseTime.date,
  };
}
