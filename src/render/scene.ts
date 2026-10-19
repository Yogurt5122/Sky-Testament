import { projectStereographic } from '../core/projection';
import { applyProperMotion, createStarProjector, type Star } from '../core/starcatalog';
import type { SkySnapshot } from '../core/ephemeris';
import { CONSTELLATIONS } from '../data/constellations';

export interface SceneLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end' | 'middle';
  size: number;
  kind: 'star' | 'planet' | 'constellation';
}

export interface StarBucket {
  radius: number;
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
  buckets: StarBucket[];
  planets: PlanetDot[];
  constellations: ConstellationFigurePath[];
  labels: SceneLabel[];
  starCount: number;
}

export interface BuildSceneOptions {
  size?: number;
  margin?: number;
  maxStarLabels?: number;
}

/** 星等分桶：半径按印刷观感设定，单位为 viewBox 单位。 */
const BUCKETS = [
  { limit: 1.5, radius: 3.2 },
  { limit: 2.5, radius: 2.4 },
  { limit: 4.0, radius: 1.6 },
  { limit: 5.5, radius: 1.05 },
  { limit: 6.5, radius: 0.65 },
];

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

/** 圆形的 SVG path，用于把同一星等的星合并成一个 <path>。 */
function circlePath(x: number, y: number, r: number): string {
  const px = x.toFixed(1);
  const py = y.toFixed(1);
  const pr = r.toFixed(2);
  const d = (r * 2).toFixed(2);
  return `M${px},${py}m-${pr},0a${pr},${pr} 0 1,0 ${d},0a${pr},${pr} 0 1,0 -${d},0`;
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
  const maxStarLabels = options.maxStarLabels ?? 14;

  const utc = new Date(snapshot.utc);
  const utcMs = utc.getTime();
  const projector = createStarProjector(utc, snapshot.geo);

  const bucketPaths = BUCKETS.map(() => [] as string[]);
  const bucketCounts = BUCKETS.map(() => 0);
  const labelCandidates: Array<{ x: number; y: number; mag: number; text: string }> = [];
  const positions = new Map<number, { x: number; y: number }>();
  let starCount = 0;

  for (const star of stars) {
    const moved = applyProperMotion(star, utcMs);
    const horizontal = projector(moved.ra, moved.dec);
    if (horizontal.altitude < -0.5) continue;

    const point = projectStereographic(horizontal.azimuth, horizontal.altitude, radius);
    const x = center + point.x;
    const y = center + point.y;
    positions.set(star.hip, { x, y });
    const index = BUCKETS.findIndex((bucket) => star.mag <= bucket.limit);
    const bucketIndex = index === -1 ? BUCKETS.length - 1 : index;

    bucketPaths[bucketIndex].push(circlePath(x, y, BUCKETS[bucketIndex].radius));
    bucketCounts[bucketIndex] += 1;
    starCount += 1;

    const name = names.get(star.hip);
    if (name && star.mag <= 2.2) {
      labelCandidates.push({ x, y, mag: star.mag, text: name });
    }
  }

  const constellations: ConstellationFigurePath[] = [];
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

  const planets: PlanetDot[] = [];
  const planetLabels: Array<{ x: number; y: number; text: string }> = [];

  for (const body of snapshot.bodies) {
    if (body.altitude < 0.5) continue;
    if (body.id === 'sun' && !snapshot.daylight) continue;

    const point = projectStereographic(body.azimuth, body.altitude, radius);
    const x = center + point.x;
    const y = center + point.y;
    const magnitude = body.magnitude ?? 2;
    const dotRadius =
      body.id === 'moon' ? 7.5 : body.id === 'sun' ? 9 : magnitude < 0 ? 5 : magnitude < 1 ? 4.2 : magnitude < 2.5 ? 3.4 : 2.8;

    planets.push({ x, y, r: dotRadius, name: body.name, magnitude: body.magnitude });
    planetLabels.push({ x, y, text: body.name });
  }

  // 标签避让：先行星，再按亮度取亮星
  const occupied: Rect[] = [];
  const labels: SceneLabel[] = [];

  const place = (x: number, y: number, text: string, kind: SceneLabel['kind']): void => {
    const size = kind === 'planet' ? 15 : kind === 'constellation' ? 11 : 13;
    const width = text.length * size * (kind === 'planet' ? 1.0 : 0.95);
    const height = size * 1.2;

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
    labels.push({ x: anchorX, y: anchorY, text, anchor, size, kind });
  };

  planetLabels.forEach((label) => place(label.x, label.y, label.text, 'planet'));
  constellations.forEach((figure) => place(figure.x, figure.y, figure.name, 'constellation'));

  labelCandidates
    .sort((a, b) => a.mag - b.mag)
    .slice(0, maxStarLabels)
    .forEach((label) => place(label.x, label.y, label.text, 'star'));

  return {
    size,
    center,
    radius,
    daylight: snapshot.daylight,
    buckets: BUCKETS.map((bucket, index) => ({
      radius: bucket.radius,
      d: bucketPaths[index].join(''),
      count: bucketCounts[index],
    })),
    planets,
    constellations,
    labels,
    starCount,
  };
}
