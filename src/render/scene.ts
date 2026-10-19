import * as Astronomy from 'astronomy-engine';
import { projectStereographic } from '../core/projection';
import { applyProperMotion, createStarProjector, type Star } from '../core/starcatalog';
import type { SkySnapshot } from '../core/ephemeris';
import { CONSTELLATIONS } from '../data/constellations';

/** 信息密度：minimal 只看星星，standard 主要标注，atlas 叠加参考线与更多数据 */
export type DetailLevel = 'minimal' | 'standard' | 'atlas';

export interface SceneLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end' | 'middle';
  size: number;
  kind: 'star' | 'planet' | 'constellation' | 'guide';
}

export interface StarBucket {
  radius: number;
  /** 色指数分箱（0 偏蓝 → 3 偏橙），颜色由渲染层按主题决定 */
  colorBin: number;
  d: string;
  count: number;
}

export interface PlanetDot {
  x: number;
  y: number;
  r: number;
  name: string;
  magnitude: number | null;
}

export interface MoonDisc {
  x: number;
  y: number;
  r: number;
  /** 被照亮比例 0–1 */
  illumination: number;
  /** true = 盈（右侧亮），false = 亏 */
  waxing: boolean;
  phaseName: string;
}

export interface ConstellationFigurePath {
  abbr: string;
  name: string;
  d: string;
  x: number;
  y: number;
}

export interface ChartScene {
  size: number;
  center: number;
  radius: number;
  daylight: boolean;
  detail: DetailLevel;
  buckets: StarBucket[];
  planets: PlanetDot[];
  moon: MoonDisc | null;
  constellations: ConstellationFigurePath[];
  labels: SceneLabel[];
  /** 黄道与天赤道（仅 atlas 档计算） */
  ecliptic: string;
  equator: string;
  starCount: number;
  limitingMagnitude: number;
}

export interface BuildSceneOptions {
  size?: number;
  margin?: number;
  maxStarLabels?: number;
  /** 极限星等：低于此亮度的星不画 */
  limitingMagnitude?: number;
  /** 信息密度 */
  detail?: DetailLevel;
}

/** 星等分桶：半径按印刷观感设定，单位为 viewBox 单位。 */
const BUCKETS = [
  { limit: 1.5, radius: 3.2 },
  { limit: 2.5, radius: 2.4 },
  { limit: 4.0, radius: 1.6 },
  { limit: 5.5, radius: 1.05 },
  { limit: 6.5, radius: 0.65 },
];

const COLOR_BIN_COUNT = 4;

/** B−V → 色温分箱。 */
function colorBinOf(ci: number): number {
  if (ci < 0.2) return 0; // 蓝白
  if (ci < 0.65) return 1; // 白
  if (ci < 1.15) return 2; // 黄白
  return 3; // 橙红
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function circlePath(x: number, y: number, r: number): string {
  const px = x.toFixed(1);
  const py = y.toFixed(1);
  const pr = r.toFixed(2);
  const d = (r * 2).toFixed(2);
  return `M${px},${py}m-${pr},0a${pr},${pr} 0 1,0 ${d},0a${pr},${pr} 0 1,0 -${d},0`;
}

/**
 * 把一串地平坐标连成路径；地平线以下的点会断开笔触。
 */
function greatCirclePath(
  points: Array<{ altitude: number; azimuth: number }>,
  radius: number,
  center: number,
): string {
  let d = '';
  let drawing = false;
  for (const point of points) {
    if (point.altitude <= 0.2) {
      drawing = false;
      continue;
    }
    const projected = projectStereographic(point.azimuth, point.altitude, radius);
    const x = center + projected.x;
    const y = center + projected.y;
    d += `${drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    drawing = true;
  }
  return d;
}

/**
 * 把一次观测构建成与框架无关的场景，React 组件只负责画。
 */
export function buildChartScene(
  snapshot: SkySnapshot,
  stars: Star[],
  names: Map<number, string>,
  options: BuildSceneOptions = {},
): ChartScene {
  const size = options.size ?? 1000;
  const margin = options.margin ?? 64;
  const radius = size / 2 - margin;
  const center = size / 2;
  const detail = options.detail ?? 'standard';
  const maxStarLabels =
    options.maxStarLabels ?? (detail === 'atlas' ? 30 : detail === 'minimal' ? 0 : 14);
  const limitingMagnitude = options.limitingMagnitude ?? 6.5;

  const utc = new Date(snapshot.utc);
  const utcMs = utc.getTime();
  const projector = createStarProjector(utc, snapshot.geo);

  const bucketPaths = BUCKETS.map(() =>
    Array.from({ length: COLOR_BIN_COUNT }, () => [] as string[]),
  );
  const bucketCounts = BUCKETS.map(() => Array.from({ length: COLOR_BIN_COUNT }, () => 0));
  const labelCandidates: Array<{ x: number; y: number; mag: number; text: string }> = [];
  let starCount = 0;

  for (const star of stars) {
    if (star.mag > limitingMagnitude) continue;

    const moved = applyProperMotion(star, utcMs);
    const horizontal = projector(moved.ra, moved.dec);
    if (horizontal.altitude < -0.5) continue;

    const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
    const x = center + point.x;
    const y = center + point.y;

    const index = BUCKETS.findIndex((bucket) => star.mag <= bucket.limit);
    const bucketIndex = index === -1 ? BUCKETS.length - 1 : index;
    const bin = colorBinOf(star.ci);

    bucketPaths[bucketIndex][bin].push(circlePath(x, y, BUCKETS[bucketIndex].radius));
    bucketCounts[bucketIndex][bin] += 1;
    starCount += 1;

    const name = names.get(star.hip);
    if (name && star.mag <= 2.2) {
      labelCandidates.push({ x, y, mag: star.mag, text: name });
    }
  }

  const buckets: StarBucket[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let bin = 0; bin < COLOR_BIN_COUNT; bin += 1) {
      if (bucketCounts[bucketIndex][bin] === 0) continue;
      buckets.push({
        radius: bucket.radius,
        colorBin: bin,
        d: bucketPaths[bucketIndex][bin].join(''),
        count: bucketCounts[bucketIndex][bin],
      });
    }
  });

  // 图谱档：黄道与天赤道，以及它们各自的标注锚点
  let ecliptic = '';
  let equator = '';
  let eclipticAnchor: { x: number; y: number } | null = null;
  let equatorAnchor: { x: number; y: number } | null = null;

  if (detail === 'atlas') {
    const time = Astronomy.MakeTime(utc);

    let bestEquator = -1;
    const equatorPoints: Array<{ altitude: number; azimuth: number }> = [];
    for (let ra = 0; ra <= 24; ra += 0.1) {
      const horizontal = projector(ra, 0);
      equatorPoints.push(horizontal);
      if (horizontal.altitude > bestEquator) {
        bestEquator = horizontal.altitude;
        const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
        equatorAnchor = { x: center + point.x, y: center + point.y };
      }
    }
    equator = greatCirclePath(equatorPoints, radius, center);

    let bestEcliptic = -1;
    const rotation = Astronomy.Rotation_ECL_EQJ();
    const eclipticPoints: Array<{ altitude: number; azimuth: number }> = [];
    for (let lon = 0; lon < 360; lon += 2) {
      const vector = Astronomy.VectorFromSphere(new Astronomy.Spherical(0, lon, 1), time);
      const spherical = Astronomy.SphereFromVector(Astronomy.RotateVector(rotation, vector));
      const horizontal = projector((((spherical.lon / 15) % 24) + 24) % 24, spherical.lat);
      eclipticPoints.push(horizontal);
      if (horizontal.altitude > bestEcliptic) {
        bestEcliptic = horizontal.altitude;
        const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
        eclipticAnchor = { x: center + point.x, y: center + point.y };
      }
    }
    ecliptic = greatCirclePath(eclipticPoints, radius, center);
  }

  const planets: PlanetDot[] = [];
  const planetLabels: Array<{ x: number; y: number; text: string }> = [];
  let moon: MoonDisc | null = null;

  for (const body of snapshot.bodies) {
    if (body.altitude < 0.5) continue;
    if (body.id === 'sun' && !snapshot.daylight) continue;

    const point = projectStereographic(body.azimuth, body.altitude, radius);
    const x = center + point.x;
    const y = center + point.y;

    if (body.id === 'moon') {
      // 真实角直径约 0.5°，那样画会小到看不见，这里做了艺术放大
      moon = {
        x,
        y,
        r: 9,
        illumination: snapshot.moon.illumination,
        waxing: snapshot.moon.phaseDegrees < 180,
        phaseName: snapshot.moon.phaseName,
      };
      if (detail !== 'minimal') {
        planetLabels.push({
          x,
          y,
          text:
            detail === 'atlas'
              ? `月亮 ${snapshot.moon.phaseName} ${Math.round(snapshot.moon.illumination * 100)}%`
              : '月亮',
        });
      }
      continue;
    }

    const magnitude = body.magnitude ?? 2;
    const dotRadius =
      body.id === 'sun' ? 9 : magnitude < 0 ? 5 : magnitude < 1 ? 4.2 : magnitude < 2.5 ? 3.4 : 2.8;

    planets.push({ x, y, r: dotRadius, name: body.name, magnitude: body.magnitude });
    if (detail !== 'minimal') {
      planetLabels.push({
        x,
        y,
        text:
          detail === 'atlas' && body.magnitude !== null
            ? `${body.name} ${body.magnitude.toFixed(1)} 等`
            : body.name,
      });
    }
  }

  const constellations: ConstellationFigurePath[] = [];
  const positions = new Map<number, { x: number; y: number }>();

  if (detail !== 'minimal') {
    // 星座连线需要恒星位置，单独再算一次可见星坐标
    for (const star of stars) {
      if (star.mag > 6.5) continue;
      const moved = applyProperMotion(star, utcMs);
      const horizontal = projector(moved.ra, moved.dec);
      if (horizontal.altitude < 0) continue;
      const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
      positions.set(star.hip, { x: center + point.x, y: center + point.y });
    }

    for (const figure of CONSTELLATIONS) {
      let d = '';
      let sumX = 0;
      let sumY = 0;
      let points = 0;

      for (const [from, to] of figure.segments) {
        const a = positions.get(from);
        const b = positions.get(to);
        if (!a || !b) continue;
        d += `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
        sumX += a.x + b.x;
        sumY += a.y + b.y;
        points += 2;
      }

      if (points === 0) continue;
      constellations.push({
        abbr: figure.abbr,
        name: figure.name,
        d,
        x: sumX / points,
        y: sumY / points,
      });
    }
  }

  // 标签避让：先行星，再星座名，最后按亮度取亮星
  const occupied: Rect[] = [];
  const labels: SceneLabel[] = [];

  const place = (x: number, y: number, text: string, kind: SceneLabel['kind']): void => {
    const textSize =
      kind === 'planet' ? 15 : kind === 'constellation' ? 11 : kind === 'guide' ? 12 : 13;
    const width = text.length * textSize * (kind === 'planet' ? 1.0 : 0.95);
    const height = textSize * 1.2;

    const radialX = x - center;
    const radialY = y - center;
    const distance = Math.hypot(radialX, radialY) || 1;
    const offset = 9;
    const anchor: 'start' | 'end' = radialX >= 0 ? 'start' : 'end';

    const anchorX = x + (radialX / distance) * offset + (anchor === 'start' ? 2 : -2);
    const anchorY = y + (radialY / distance) * offset;

    const box: Rect = {
      x: anchor === 'start' ? anchorX : anchorX - width,
      y: anchorY - height / 2,
      width,
      height,
    };

    if (occupied.some((rect) => overlaps(rect, box))) return;
    occupied.push(box);
    labels.push({ x: anchorX, y: anchorY, text, anchor, size: textSize, kind });
  };

  planetLabels.forEach((label) => place(label.x, label.y, label.text, 'planet'));

  if (detail === 'atlas') {
    if (equatorAnchor) place(equatorAnchor.x, equatorAnchor.y, '天赤道', 'guide');
    if (eclipticAnchor) place(eclipticAnchor.x, eclipticAnchor.y, '黄道', 'guide');
  }

  constellations.forEach((figure) =>
    place(
      figure.x,
      figure.y,
      detail === 'atlas' ? `${figure.name} ${figure.abbr}` : figure.name,
      'constellation',
    ),
  );

  labelCandidates
    .sort((a, b) => a.mag - b.mag)
    .slice(0, maxStarLabels)
    .forEach((label) => place(label.x, label.y, label.text, 'star'));

  return {
    size,
    center,
    radius,
    daylight: snapshot.daylight,
    detail,
    buckets,
    planets,
    moon,
    constellations,
    labels,
    ecliptic,
    equator,
    starCount,
    limitingMagnitude,
  };
}
