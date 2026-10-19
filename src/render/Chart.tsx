import type { ChartScene, MoonDisc } from './scene';

export interface ChartViewBox {
  x: number;
  y: number;
  width: number;
  /** 与 width 相等：圆形星图的画布是正方形 */
  height: number;
}

interface ChartProps {
  scene: ChartScene;
  /** 标签字号倍率：缩放时用它保持屏幕字号不变 */
  labelScale?: number;
  /** 缩放时传入裁剪后的 viewBox，浏览器会按最终尺寸重新栅格化，因此始终清晰 */
  viewBox?: ChartViewBox;
}

const CARDINALS = [
  { azimuth: 0, label: 'N' },
  { azimuth: 90, label: 'E' },
  { azimuth: 180, label: 'S' },
  { azimuth: 270, label: 'W' },
];

function ringRadius(altitude: number, radius: number): number {
  // 与投影公式一致：r = R·tan((90−alt)/2)
  return radius * Math.tan(((90 - altitude) * Math.PI) / 360);
}

/**
 * 月相亮区：外半圆 + 内椭圆弧拼成。
 *
 * rx 为明暗界线椭圆的半短轴；k>0.5 时向暗侧凸（凸月），k<0.5 时向亮侧凸（蛾眉月）。
 */
export function moonPhasePath(moon: MoonDisc): string {
  const { x, y, r, illumination, waxing } = moon;
  const k = Math.max(0, Math.min(1, illumination));
  if (k < 0.02) return '';
  if (k > 0.98) {
    return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
  }

  // 保留两位小数，避免浮点尾数进入路径字符串
  const rx = Number((r * Math.abs(1 - 2 * k)).toFixed(2));
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = (k > 0.5) === waxing ? 1 : 0;

  return `M${x},${y - r}A${r},${r} 0 0 ${outerSweep} ${x},${y + r}A${rx},${r} 0 0 ${innerSweep} ${x},${y - r}Z`;
}

export function Chart({ scene, labelScale = 1, viewBox }: ChartProps) {
  const { size, center, radius, daylight } = scene;
  const minimal = scene.detail === 'minimal';
  const atlas = scene.detail === 'atlas';
  const cardinals = atlas
    ? [
        { azimuth: 0, label: 'N' },
        { azimuth: 45, label: 'NE' },
        { azimuth: 90, label: 'E' },
        { azimuth: 135, label: 'SE' },
        { azimuth: 180, label: 'S' },
        { azimuth: 225, label: 'SW' },
        { azimuth: 270, label: 'W' },
        { azimuth: 315, label: 'NW' },
      ]
    : CARDINALS;
  const viewBoxAttr = viewBox
    ? `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    : `0 0 ${size} ${size}`;

  const tickMarks = Array.from({ length: 36 }, (_, index) => {
    const azimuth = index * 10;
    const major = azimuth % 30 === 0;
    const outer = radius + (major ? 7 : 3);
    const inner = radius - (major ? 7 : 4);
    const radians = (azimuth * Math.PI) / 180;
    return {
      key: azimuth,
      x1: center + inner * Math.sin(radians),
      y1: center - inner * Math.cos(radians),
      x2: center + outer * Math.sin(radians),
      y2: center - outer * Math.cos(radians),
      major,
    };
  });

  return (
    <svg
      className={`chart${daylight ? ' chart--day' : ''}`}
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${daylight ? '白昼' : '夜间'}星空，可见 ${scene.starCount} 颗恒星`}
    >
      <circle className="chart-disc" cx={center} cy={center} r={radius} />

      {!minimal &&
        [30, 60].map((altitude) => (
          <circle
            key={altitude}
            className="chart-ring"
            cx={center}
            cy={center}
            r={ringRadius(altitude, radius)}
          />
        ))}

      {atlas &&
        [30, 60].map((altitude) => (
          <text
            key={`ring-${altitude}`}
            className="chart-ring-label"
            x={center}
            y={center - ringRadius(altitude, radius) - 6}
            textAnchor="middle"
            fontSize={11 * labelScale}
            style={{ strokeWidth: 3 * labelScale }}
          >
            {altitude}°
          </text>
        ))}

      {!minimal && (
        <>
          <line className="chart-axis" x1={center} y1={center - radius} x2={center} y2={center + radius} />
          <line className="chart-axis" x1={center - radius} y1={center} x2={center + radius} y2={center} />
        </>
      )}

      {!minimal &&
        tickMarks.map((tick) => (
          <line
            key={tick.key}
            className={tick.major ? 'chart-tick chart-tick--major' : 'chart-tick'}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
          />
        ))}

      {!minimal &&
        cardinals.map(({ azimuth, label }) => {
          const radians = (azimuth * Math.PI) / 180;
          const distance = radius + 26;
          return (
            <text
              key={label}
              className="chart-cardinal"
              x={center + distance * Math.sin(radians)}
              y={center - distance * Math.cos(radians)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={label.length > 1 ? 12 * labelScale : undefined}
            >
              {label}
            </text>
          );
        })}

      {(scene.equator || scene.ecliptic) && (
        <g className="chart-guides">
          {scene.equator && (
            <path
              className="chart-guide chart-guide--equator"
              d={scene.equator}
              style={{ strokeWidth: 0.7 * labelScale }}
            />
          )}
          {scene.ecliptic && (
            <path
              className="chart-guide chart-guide--ecliptic"
              d={scene.ecliptic}
              style={{ strokeWidth: 0.8 * labelScale }}
            />
          )}
        </g>
      )}

      <g className="chart-stars">
        {scene.buckets.map((bucket) =>
          bucket.d ? (
            <path
              key={`${bucket.radius}-${bucket.colorBin}`}
              className={`star-bin-${bucket.colorBin}`}
              d={bucket.d}
            />
          ) : null,
        )}
      </g>

      <g className="chart-constellations">
        {scene.constellations.map((figure) => (
          <path key={figure.abbr} d={figure.d} style={{ strokeWidth: 0.85 * labelScale }} />
        ))}
      </g>

      <g className="chart-planets">
        {scene.planets.map((planet) => (
          <g key={planet.name}>
            <circle cx={planet.x} cy={planet.y} r={planet.r + 2.5} className="chart-planet-halo" />
            <circle cx={planet.x} cy={planet.y} r={planet.r} className="chart-planet" />
          </g>
        ))}
      </g>

      {scene.moon && (
        <g className="chart-moon">
          <circle cx={scene.moon.x} cy={scene.moon.y} r={scene.moon.r} className="chart-moon-dark" />
          <path className="chart-moon-lit" d={moonPhasePath(scene.moon)} />
        </g>
      )}

      <g className="chart-labels">
        {scene.labels.map((label) => (
          <text
            key={`${label.text}-${label.x.toFixed(1)}`}
            className={
              label.kind === 'planet'
                ? 'chart-label chart-label--planet'
                : label.kind === 'constellation'
                  ? 'chart-label chart-label--constellation'
                  : label.kind === 'guide'
                    ? 'chart-label chart-label--guide'
                    : 'chart-label'
            }
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fontSize={label.size * labelScale}
            style={{ strokeWidth: 3.5 * labelScale }}
            dominantBaseline="middle"
          >
            {label.text}
          </text>
        ))}
      </g>

      {atlas && (
        <text
          className="chart-ring-label"
          x={center}
          y={center + 15 * labelScale}
          textAnchor="middle"
          fontSize={10 * labelScale}
          style={{ strokeWidth: 3 * labelScale }}
        >
          天顶
        </text>
      )}

      <circle className="chart-zenith" cx={center} cy={center} r={1.6} />
    </svg>
  );
}
