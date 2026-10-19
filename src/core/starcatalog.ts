import * as Astronomy from 'astronomy-engine';
import type { GeoPoint } from './ephemeris';

/** 一颗恒星在 J2000 时刻的目录数据。 */
export interface Star {
  /** HIP 编号；无 HIP 时退化为 HYG 的 id */
  hip: number;
  /** 赤经，小时，J2000 */
  ra: number;
  /** 赤纬，度，J2000 */
  dec: number;
  /** 视星等 */
  mag: number;
  /** B−V 色指数 */
  ci: number;
  /** 自行 μ_α·cosδ，mas/年（HYG 与 Hipparcos 一致，已乘 cosδ） */
  pmra: number;
  /** 自行 μ_δ，mas/年 */
  pmdec: number;
}

export interface HorizontalPosition {
  altitude: number;
  azimuth: number;
}

/** J2000.0 历元：2000-01-01 12:00 UTC */
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

const MAGIC = 'STAR';
const HEADER_SIZE = 12;
const RECORD_SIZE = 20;
const JULIAN_YEAR_MS = 365.25 * 86_400_000;
const MAS_PER_DEGREE = 3_600_000;
const DEGREES_PER_HOUR = 15;

/**
 * 解析 stars.bin（由 scripts/build-stars.mjs 生成）。
 *
 * 布局：12 字节表头 + 7 个并列数组，每星 20 字节。
 */
export function parseStarCatalog(buffer: ArrayBuffer): Star[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_SIZE) throw new Error('星表文件过短');

  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== MAGIC) throw new Error(`星表 magic 不匹配: ${magic}`);

  const version = view.getUint16(4, true);
  if (version !== 1) throw new Error(`不支持的星表版本: ${version}`);

  const count = view.getUint32(8, true);
  if (count === 0 || count > 200_000) throw new Error(`恒星数量异常: ${count}`);
  if (buffer.byteLength !== HEADER_SIZE + count * RECORD_SIZE) {
    throw new Error('星表长度与恒星数量不一致');
  }

  const hipOffset = HEADER_SIZE;
  const raOffset = hipOffset + count * 4;
  const decOffset = raOffset + count * 4;
  const magOffset = decOffset + count * 4;
  const ciOffset = magOffset + count * 2;
  const pmraOffset = ciOffset + count * 2;
  const pmdecOffset = pmraOffset + count * 2;

  const stars: Star[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    stars[i] = {
      hip: view.getUint32(hipOffset + i * 4, true),
      ra: view.getFloat32(raOffset + i * 4, true),
      dec: view.getFloat32(decOffset + i * 4, true),
      mag: view.getInt16(magOffset + i * 2, true) / 1000,
      ci: view.getInt16(ciOffset + i * 2, true) / 1000,
      pmra: view.getInt16(pmraOffset + i * 2, true),
      pmdec: view.getInt16(pmdecOffset + i * 2, true),
    };
  }

  return stars;
}

/**
 * 把 J2000 位置按自行外推到目标时刻。
 *
 * 只做线性外推（几十年的量级足够）；视差与径向加速度忽略。
 */
export function applyProperMotion(
  star: Pick<Star, 'ra' | 'dec' | 'pmra' | 'pmdec'>,
  utcMs: number,
  epochMs: number = J2000_MS,
): { ra: number; dec: number } {
  const years = (utcMs - epochMs) / JULIAN_YEAR_MS;
  const cosDec = Math.max(Math.cos((star.dec * Math.PI) / 180), 1e-6);

  // pmra 是 μ_α·cosδ，除以 cosδ 才是赤经方向的角度变化
  const deltaRaDegrees = ((star.pmra / cosDec) * years) / MAS_PER_DEGREE;
  const deltaDecDegrees = (star.pmdec * years) / MAS_PER_DEGREE;

  return {
    ra: star.ra + deltaRaDegrees / DEGREES_PER_HOUR,
    dec: star.dec + deltaDecDegrees,
  };
}

/** 把赤道坐标（J2000）转到观测者的地平坐标。 */
export function starHorizontal(
  star: { ra: number; dec: number },
  utc: Date,
  geo: GeoPoint,
): HorizontalPosition {
  return createStarProjector(utc, geo)(star.ra, star.dec);
}

/**
 * 批量转换用的投影器：时间、观测者与旋转矩阵只算一次。
 *
 * 渲染整片星空时逐星创建 Observer / AstroTime 会慢一个数量级，
 * 因此把公共部分提到外面。
 */
export function createStarProjector(
  utc: Date,
  geo: GeoPoint,
): (ra: number, dec: number) => HorizontalPosition {
  const observer = new Astronomy.Observer(geo.latitude, geo.longitude, geo.elevation);
  const time = Astronomy.MakeTime(utc);
  const rotation = Astronomy.Rotation_EQJ_HOR(time, observer);

  return (ra: number, dec: number) => {
    const vector = Astronomy.VectorFromSphere(new Astronomy.Spherical(dec, ra * 15, 1), time);
    const horizontal = Astronomy.HorizonFromVector(
      Astronomy.RotateVector(rotation, vector),
      'normal',
    );
    return { altitude: horizontal.lat, azimuth: horizontal.lon };
  };
}
