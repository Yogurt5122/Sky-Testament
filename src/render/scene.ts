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
  /** 星历层的天体 id，例如 jupiter */
  id: string;
  x: number;
  y: number;
  r: number;
  name: string;
  magnitude: number | null;
  /** 行星自身的色调，用于泛光 */
  color: string;
}

/** 行星色调：偏真实，同时保证在深色底上可读 */
const PLANET_COLORS: Record<string, string> = {
  sun: '#f7e7b8',
  mercury: '#cfc7b6',
  venus: '#f4e8c6',
  mars: '#e08a63',
  jupiter: '#e9d6ac',
  saturn: '#e8d18f',
  uranus: '#b6e0e2',
  neptune: '#a8c4f0',
};

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

/** 可点击的天体：用于详情面板 */
export interface SceneObject {
  id: string;
  kind: 'star' | 'planet' | 'moon';
  name: string;
  x: number;
  y: number;
  magnitude: number | null;
  hip?: number;
  bodyId?: string;
}

/** 亮星：单独画星芒，避免和合并路径绑死 */
export interface BrightStar {
  hip: number;
  x: number;
  y: number;
  mag: number;
  /** 星芒长度，已按 sizeScale 缩放 */
  spike: number;
  /** 偏转角，按 hip 稳定生成 */
  angle: number;
}

/** 星密度柔光：银河带一类的高密度区域 */
export interface DensityCell {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export interface ChartScene {
  size: number;
  center: number;
  radius: number;
  daylight: boolean;
  detail: DetailLevel;
  buckets: StarBucket[];
  brightStars: BrightStar[];
  density: DensityCell[];
  planets: PlanetDot[];
  moon: MoonDisc | null;
  constellations: ConstellationFigurePath[];
  objects: SceneObject[];
  labels: SceneLabel[];
  /** 黄道与天赤道（仅 atlas 档计算） */
  ecliptic: string;
  equator: string;
  /** 地平线以上、有中文名的最亮恒星 */
  brightestStar: string | null;
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
  /**
   * 标记尺寸系数：外层若按 zoom 放大，传入 1/zoom 可让星点、
   * 行星与月亮保持屏幕尺寸不变（真实天空里它们仍是点）。
   */
  sizeScale?: number;
}

/** 按编号生成稳定的偏转角，避免所有星芒同向 */
function hashAngle(seed: number): number {
  let hash = seed >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x27d4eb2d) >>> 0;
  hash ^= hash >>> 15;
  return (hash % 900) / 10;
}

/** Kasten–Young 大气质量，高度角单位：度 */
function airmassAt(altitude: number): number {
  const alt = Math.max(altitude, 1);
  return 1 / (Math.sin((alt * Math.PI) / 180) + 0.15 * Math.pow(alt + 3.885, -1.253));
}

/** 消光系数：每增加一个大气质量，星等暗多少 */
const EXTINCTION_K = 0.22;
/** 每增加一个大气质量，B−V 偏红多少 */
const REDDENING_BV = 0.1;
/** 星密度网格：用于银河带一类的高密度区柔光 */
const DENSITY_GRID = 26;

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
  const sizeScale = options.sizeScale ?? 1;
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
  const brightStars: BrightStar[] = [];
  const density = new Float32Array(DENSITY_GRID * DENSITY_GRID);
  const labelCandidates: Array<{ x: number; y: number; mag: number; text: string }> = [];
  const objects: SceneObject[] = [];
  let starCount = 0;
  let brightestStar: string | null = null;
  let brightestMagnitude = Number.POSITIVE_INFINITY;

  for (const star of stars) {
    if (star.mag > limitingMagnitude) continue;

    const moved = applyProperMotion(star, utcMs);
    const horizontal = projector(moved.ra, moved.dec);
    if (horizontal.altitude < -0.5) continue;

    const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
    const x = center + point.x;
    const y = center + point.y;

    // 大气消光：越靠近地平线越暗、越红
    const airmass = airmassAt(horizontal.altitude);
    const apparentMag = star.mag + EXTINCTION_K * (airmass - 1);
    if (apparentMag > limitingMagnitude) continue;

    const index = BUCKETS.findIndex((bucket) => apparentMag <= bucket.limit);
    const bucketIndex = index === -1 ? BUCKETS.length - 1 : index;
    const bin = colorBinOf(star.ci + REDDENING_BV * (airmass - 1));

    bucketPaths[bucketIndex][bin].push(
      circlePath(x, y, BUCKETS[bucketIndex].radius * sizeScale),
    );
    bucketCounts[bucketIndex][bin] += 1;
    starCount += 1;

    // 星密度：亮星权重更高，供银河带柔光使用
    if (horizontal.altitude > 0) {
      const gridX = Math.floor(((x - (center - radius)) / (2 * radius)) * DENSITY_GRID);
      const gridY = Math.floor(((y - (center - radius)) / (2 * radius)) * DENSITY_GRID);
      if (gridX >= 0 && gridX < DENSITY_GRID && gridY >= 0 && gridY < DENSITY_GRID) {
        density[gridY * DENSITY_GRID + gridX] += Math.max(0.15, 0.4 + (apparentMag - 1) * 0.3);
      }
    }

    const name = names.get(star.hip);
    if (star.mag <= 4.0) {
      objects.push({
        id: `star-${star.hip}`,
        kind: 'star',
        name: name ?? '',
        x,
        y,
        magnitude: star.mag,
        hip: star.hip,
      });
    }

    if (apparentMag <= 2.2 && horizontal.altitude > 5) {
      // 亮星单独画星芒：越亮越长，角度按 hip 稳定偏转
      brightStars.push({
        hip: star.hip,
        x,
        y,
        mag: apparentMag,
        spike: Math.max(6.5, 13.5 - apparentMag * 2.2) * sizeScale,
        angle: hashAngle(star.hip),
      });
    }

    if (name && horizontal.altitude > 5) {
      if (star.mag < brightestMagnitude) {
        brightestMagnitude = star.mag;
        brightestStar = name;
      }
      if (star.mag <= 2.2) {
        labelCandidates.push({ x, y, mag: star.mag, text: name });
      }
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

  // 星密度高的区域（银河带）压成少量柔光点，交给一层模糊去铺开
  const cellSize = (2 * radius) / DENSITY_GRID;
  let maxDensity = 0;
  for (const value of density) maxDensity = Math.max(maxDensity, value);

  const densityCells: DensityCell[] = [];
  if (maxDensity > 0) {
    for (let gy = 0; gy < DENSITY_GRID; gy += 1) {
      for (let gx = 0; gx < DENSITY_GRID; gx += 1) {
        const value = density[gy * DENSITY_GRID + gx];
        if (value <= 0) continue;
        const normalized = value / maxDensity;
        if (normalized < 0.4) continue;
        densityCells.push({
          x: center - radius + (gx + 0.5) * cellSize,
          y: center - radius + (gy + 0.5) * cellSize,
          r: cellSize * 2.1,
          opacity: normalized,
        });
      }
    }
    densityCells.sort((a, b) => b.opacity - a.opacity);
    densityCells.length = Math.min(densityCells.length, 180);
  }

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
        r: 9 * sizeScale,
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
      objects.push({
        id: 'moon',
        kind: 'moon',
        name: '月亮',
        x,
        y,
        magnitude: -10,
        bodyId: 'moon',
      });
      continue;
    }

    const magnitude = body.magnitude ?? 2;
    const dotRadius =
      body.id === 'sun' ? 9 : magnitude < 0 ? 5 : magnitude < 1 ? 4.2 : magnitude < 2.5 ? 3.4 : 2.8;

    planets.push({
      id: body.id,
      x,
      y,
      r: dotRadius * sizeScale,
      name: body.name,
      magnitude: body.magnitude,
      color: PLANET_COLORS[body.id] ?? '#e9e3d5',
    });
    objects.push({
      id: `body-${body.id}`,
      kind: 'planet',
      name: body.name,
      x,
      y,
      magnitude: body.magnitude,
      bodyId: body.id,
    });
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
    brightStars,
    density: densityCells,
    planets,
    moon,
    constellations,
    objects,
    labels,
    ecliptic,
    equator,
    brightestStar,
    starCount,
    limitingMagnitude,
  };
}
