/**
 * 命令行验证工具：打印某一时刻、某一地点的天体位置。
 *
 * 用法：
 *   npm run ephem
 *   npm run ephem -- 1990-01-01 20:00 Asia/Shanghai 31.2304 121.4737 0
 */
import { computeSnapshot } from '../src/core/ephemeris';
import { formatOffset, isValidTimeZone, resolveLocalTime } from '../src/core/time';

const [dateArg, timeArg, timeZoneArg, latitudeArg, longitudeArg, elevationArg] = process.argv.slice(2);

const date = dateArg ?? '2026-10-19';
const time = timeArg ?? '20:00';
const timeZone = timeZoneArg ?? 'Asia/Shanghai';
const latitude = Number(latitudeArg ?? 31.2304);
const longitude = Number(longitudeArg ?? 121.4737);
const elevation = Number(elevationArg ?? 0);

if (!isValidTimeZone(timeZone)) {
  console.error(`无法识别的时区：${timeZone}`);
  process.exit(1);
}

const [year, month, day] = date.split('-').map(Number);
const [hour, minute] = time.split(':').map(Number);

const local = resolveLocalTime({ year, month, day, hour, minute, timeZone });
const snapshot = computeSnapshot(local.utc, { latitude, longitude, elevation });

const pad = (value: string, width: number): string => value.padEnd(width, ' ');
const signed = (value: number, digits = 2): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}°`;

console.log('');
console.log(`  本地时间   ${date} ${time}  ${timeZone}  (UTC${formatOffset(local.offsetSeconds)})`);
console.log(`  UTC        ${snapshot.utc.replace('.000Z', 'Z')}`);
console.log(`  坐标       ${latitude}°, ${longitude}°, ${elevation}m`);
console.log(`  天空       ${snapshot.daylight ? '白昼' : '夜间'}   太阳高度 ${signed(snapshot.sunAltitude)}`);
console.log(
  `  月相       ${snapshot.moon.phaseName}  ${snapshot.moon.phaseDegrees.toFixed(1)}°  照亮 ${(snapshot.moon.illumination * 100).toFixed(1)}%`,
);
if (local.skipped) console.log('  ⚠ 该本地时间不存在（夏令时前拨），已顺延');
if (local.ambiguous) console.log('  ⚠ 该本地时间出现两次（夏令时回拨），取较早的一次');

console.log('');
console.log(`  ${pad('天体', 6)}${pad('高度', 12)}${pad('方位', 10)}${pad('星等', 8)}位置`);
console.log(`  ${'-'.repeat(52)}`);
for (const body of [...snapshot.bodies].sort((a, b) => b.altitude - a.altitude)) {
  const magnitude = body.magnitude === null ? '—' : body.magnitude.toFixed(1);
  console.log(
    `  ${pad(body.name, 6)}${pad(signed(body.altitude), 12)}${pad(`${body.azimuth.toFixed(1)}°`, 10)}${pad(magnitude, 8)}${
      body.aboveHorizon ? '地平线以上' : '地平线以下'
    }`,
  );
}
console.log('');
