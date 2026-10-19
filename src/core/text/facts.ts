import type { SkySnapshot } from '../ephemeris';

export type Season = '春' | '夏' | '秋' | '冬';

export interface SkyFacts {
  moonPhaseName: string;
  moonIllumination: number;
  /** 亮度排序后最多两个可见行星 */
  planets: Array<{ name: string; direction: string }>;
  brightestStar: string | null;
  season: Season;
  daylight: boolean;
  /** 这一夜值得写进文案的天象，例如「月全食」 */
  events: string[];
}

const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

/** 方位角（北起顺时针）→ 八方位中文。 */
export function directionOf(azimuth: number): string {
  const normalized = ((azimuth % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 45) % 8];
}

function seasonOf(monthIndex: number): Season {
  if (monthIndex >= 2 && monthIndex <= 4) return '春';
  if (monthIndex >= 5 && monthIndex <= 7) return '夏';
  if (monthIndex >= 8 && monthIndex <= 10) return '秋';
  return '冬';
}

/**
 * 从一次观测提取文案需要的事实。
 *
 * 行星只取地平线以上、亮度最高的两颗；恒星由调用方传入场景中可见的最亮星名。
 */
export function deriveFacts(
  snapshot: SkySnapshot,
  brightestStar: string | null,
  events: string[] = [],
): SkyFacts {
  const planets = snapshot.bodies
    .filter((body) => body.altitude > 10 && body.id !== 'sun' && body.id !== 'moon')
    .sort((a, b) => (a.magnitude ?? 9) - (b.magnitude ?? 9))
    .slice(0, 2)
    .map((body) => ({ name: body.name, direction: directionOf(body.azimuth) }));

  return {
    moonPhaseName: snapshot.moon.phaseName,
    moonIllumination: snapshot.moon.illumination,
    planets,
    brightestStar,
    season: seasonOf(new Date(snapshot.utc).getUTCMonth()),
    daylight: snapshot.daylight,
    events,
  };
}
