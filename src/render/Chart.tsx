import type { ChartScene } from './scene';

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

export function Chart({ scene, labelScale = 1, viewBox }: ChartProps) {
  const { size, center, radius, daylight } = scene;
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
      role="img"
      aria-label={`${daylight ? '白昼' : '夜间'}星空，可见 ${scene.starCount} 颗恒星`}
    >
      <circle className="chart-disc" cx={center} cy={center} r={radius} />

      {[30, 60].map((altitude) => (
        <circle
          key={altitude}
          className="chart-ring"
          cx={center}
          cy={center}
          r={ringRadius(altitude, radius)}
        />
      ))}

      <line className="chart-axis" x1={center} y1={center - radius} x2={center} y2={center + radius} />
      <line className="chart-axis" x1={center - radius} y1={center} x2={center + radius} y2={center} />

      {tickMarks.map((tick) => (
        <line
          key={tick.key}
          className={tick.major ? 'chart-tick chart-tick--major' : 'chart-tick'}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
        />
      ))}

      {CARDINALS.map(({ azimuth, label }) => {
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
          >
            {label}
          </text>
        );
      })}

      <g className="chart-stars">
        {scene.buckets.map((bucket) =>
          bucket.d ? <path key={bucket.radius} d={bucket.d} /> : null,
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

      <g className="chart-labels">
        {scene.labels.map((label) => (
          <text
            key={`${label.text}-${label.x.toFixed(1)}`}
            className={
              label.kind === 'planet'
                ? 'chart-label chart-label--planet'
                : label.kind === 'constellation'
                  ? 'chart-label chart-label--constellation'
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

      <circle className="chart-zenith" cx={center} cy={center} r={1.6} />
    </svg>
  );
}
