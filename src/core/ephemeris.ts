import * as Astronomy from 'astronomy-engine';

export interface GeoPoint {
  /** 纬度，北为正，单位度 */
  latitude: number;
  /** 经度，东为正，单位度 */
  longitude: number;
  /** 海拔，单位米 */
  elevation: number;
}

export interface BodyPosition {
  id: string;
  name: string;
  /** 赤经（赤道坐标，当日），单位小时 */
  rightAscension: number;
  /** 赤纬（赤道坐标，当日），单位度 */
  declination: number;
  /** 地平高度，单位度 */
  altitude: number;
  /** 方位角，从北顺时针，单位度 */
  azimuth: number;
  magnitude: number | null;
  aboveHorizon: boolean;
}

export interface MoonState {
  /** 月相角，0 = 新月，180 = 满月 */
  phaseDegrees: number;
  /** 被照亮的比例，0-1 */
  illumination: number;
  phaseName: string;
}

export interface SkySnapshot {
  utc: string;
  geo: GeoPoint;
  bodies: BodyPosition[];
  sunAltitude: number;
  moon: MoonState;
  /** 太阳低于民用暮光（-6°）时视为夜间 */
  daylight: boolean;
}

const BODIES: Array<{ body: Astronomy.Body; id: string; name: string }> = [
  { body: Astronomy.Body.Sun, id: 'sun', name: '太阳' },
  { body: Astronomy.Body.Moon, id: 'moon', name: '月亮' },
  { body: Astronomy.Body.Mercury, id: 'mercury', name: '水星' },
  { body: Astronomy.Body.Venus, id: 'venus', name: '金星' },
  { body: Astronomy.Body.Mars, id: 'mars', name: '火星' },
  { body: Astronomy.Body.Jupiter, id: 'jupiter', name: '木星' },
  { body: Astronomy.Body.Saturn, id: 'saturn', name: '土星' },
  { body: Astronomy.Body.Uranus, id: 'uranus', name: '天王星' },
  { body: Astronomy.Body.Neptune, id: 'neptune', name: '海王星' },
];

/** 校验地理坐标是否在合法范围。 */
export function assertGeo(geo: GeoPoint): void {
  if (!Number.isFinite(geo.latitude) || geo.latitude < -90 || geo.latitude > 90) {
    throw new Error('纬度必须在 -90 到 90 之间');
  }
  if (!Number.isFinite(geo.longitude) || geo.longitude < -180 || geo.longitude > 180) {
    throw new Error('经度必须在 -180 到 180 之间');
  }
  if (!Number.isFinite(geo.elevation) || geo.elevation < -500 || geo.elevation > 10_000) {
    throw new Error('海拔必须在 -500 到 10000 米之间');
  }
}

export function moonPhaseName(degrees: number): string {
  const angle = ((degrees % 360) + 360) % 360;
  if (angle < 11.25 || angle >= 348.75) return '新月';
  if (angle < 78.75) return '蛾眉月';
  if (angle < 101.25) return '上弦月';
  if (angle < 168.75) return '盈凸月';
  if (angle < 191.25) return '满月';
  if (angle < 258.75) return '亏凸月';
  if (angle < 281.25) return '下弦月';
  return '残月';
}

/**
 * 计算某一 UTC 时刻、某一地点可见的太阳系天体位置。
 *
 * 赤道坐标取「当日」坐标系（of-date），并做了光行差修正；
 * 地平坐标使用标准大气折射（refraction = 'normal'）。
 */
export function computeSnapshot(utc: Date, geo: GeoPoint): SkySnapshot {
  assertGeo(geo);
  if (Number.isNaN(utc.getTime())) throw new Error('无效的时间');

  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const time = Astronomy.MakeTime(utc);

  const bodies: BodyPosition[] = BODIES.map(({ body, id, name }) => {
    const equatorial = Astronomy.Equator(body, time, observer, true, true);
    const horizontal = Astronomy.Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal');

    let magnitude: number | null = null;
    try {
      magnitude = Astronomy.Illumination(body, time).mag;
    } catch {
      magnitude = null;
    }

    return {
      id,
      name,
      rightAscension: equatorial.ra,
      declination: equatorial.dec,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude,
      aboveHorizon: horizontal.altitude > 0,
    };
  });

  const sun = bodies.find((item) => item.id === 'sun');
  if (!sun) throw new Error('太阳缺失，计算异常');

  const phaseDegrees = Astronomy.MoonPhase(time);
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, time).phase_fraction;

  return {
    utc: utc.toISOString(),
    geo,
    bodies,
    sunAltitude: sun.altitude,
    moon: {
      phaseDegrees,
      illumination,
      phaseName: moonPhaseName(phaseDegrees),
    },
    daylight: sun.altitude > -6,
  };
}
