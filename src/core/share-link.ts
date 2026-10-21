/**
 * 分享链接：把一次观星的所有参数编码进 URL，打开即可复现同一张星图与同一段文案。
 *
 * 参数：
 *   d   日期 YYYY-MM-DD      t  时间 HH:mm
 *   lat 纬度                 lon 经度
 *   tz  时区                 el  海拔（米，可选）
 *   p   地点名（可选，仅用于显示）
 *   s   文案风格 classical / modern
 *   v   第几版文案（默认 0）
 *   th  主题 night / paper
 *   q   光污染 dark / suburb / city
 *   m   信息密度 minimal / standard / atlas
 */

export type ShareStyle = 'classical' | 'modern';
export type ShareTheme = 'night' | 'paper';
export type ShareQuality = 'dark' | 'suburb' | 'city';
export type ShareDetail = 'minimal' | 'standard' | 'atlas';

export interface ShareLinkState {
  date: string;
  time: string;
  timeZone: string;
  latitude: string;
  longitude: string;
  elevation: string;
  place: string;
  style: ShareStyle;
  variant: number;
  theme: ShareTheme;
  quality: ShareQuality;
  detail: ShareDetail;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** 日期必须是日历上真实存在的一天（拒绝 13 月、2 月 30 日这类） */
function isValidDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isValidTime(value: string): boolean {
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

export function buildShareQuery(state: ShareLinkState): string {
  const params = new URLSearchParams();
  params.set('d', state.date);
  params.set('t', state.time);
  params.set('lat', state.latitude);
  params.set('lon', state.longitude);
  params.set('tz', state.timeZone);
  if (state.elevation && state.elevation !== '0') params.set('el', state.elevation);
  if (state.place) params.set('p', state.place);
  params.set('s', state.style);
  if (state.variant > 0) params.set('v', String(state.variant));
  params.set('th', state.theme);
  params.set('q', state.quality);
  params.set('m', state.detail);
  return params.toString();
}

export function parseShareQuery(search: string): ShareLinkState | null {
  const params = new URLSearchParams(search);

  const date = params.get('d');
  const time = params.get('t');
  if (!date || !time || !DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;
  if (!isValidDate(date) || !isValidTime(time)) return null;

  const latRaw = params.get('lat');
  const lonRaw = params.get('lon');
  const timeZone = params.get('tz');
  if (latRaw === null || lonRaw === null || !timeZone) return null;

  const latitude = Number(latRaw);
  const longitude = Number(lonRaw);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;

  const style = params.get('s') === 'modern' ? 'modern' : 'classical';
  const theme = params.get('th') === 'paper' ? 'paper' : 'night';
  const quality = params.get('q');
  const detail = params.get('m');
  const variant = Number(params.get('v') ?? '0');

  return {
    date,
    time,
    timeZone,
    latitude: String(latitude),
    longitude: String(longitude),
    elevation: params.get('el') ?? '0',
    place: params.get('p') ?? '',
    style,
    variant: Number.isFinite(variant) && variant > 0 ? Math.floor(variant) : 0,
    theme,
    quality:
      quality === 'dark' || quality === 'city' || quality === 'suburb' ? quality : 'suburb',
    detail:
      detail === 'minimal' || detail === 'atlas' || detail === 'standard' ? detail : 'standard',
  };
}
