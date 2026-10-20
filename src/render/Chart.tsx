import { useEffect, useId, useRef } from 'react';
import type { ChartScene, MoonDisc } from './scene';

export interface ChartViewBox {
  x: number;
  y: number;
  width: number;
  /** 与 width 相等：圆形星图的画布是正方形 */
  height: number;
}

/**
 * 把一次屏幕点击换算成场景坐标，找出最近的天体。
 *
 * 判定半径按屏幕像素折算：放大后不会"一点选中一片"。
 * zoom / pan 对应画布内内容的缩放平移（外圈固定时使用）。
 */
export function pickObjectAt(
  scene: ChartScene,
  viewBox: ChartViewBox,
  rect: DOMRect,
  clientX: number,
  clientY: number,
  radiusPx = 14,
  zoom = 1,
  pan: { x: number; y: number } = { x: 0, y: 0 },
): string | null {
  const scale = Math.max(rect.width / viewBox.width, rect.height / viewBox.height);
  const offsetX = (rect.width - viewBox.width * scale) / 2;
  const offsetY = (rect.height - viewBox.height * scale) / 2;
  let x = viewBox.x + (clientX - rect.left - offsetX) / scale;
  let y = viewBox.y + (clientY - rect.top - offsetY) / scale;

  if (zoom !== 1 || pan.x !== 0 || pan.y !== 0) {
    x = scene.center + (x - scene.center - pan.x) / zoom;
    y = scene.center + (y - scene.center - pan.y) / zoom;
  }

  let bestId: string | null = null;
  let bestDistance = radiusPx / (scale * zoom);
  for (const object of scene.objects) {
    const distance = Math.hypot(object.x - x, object.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = object.id;
    }
  }
  return bestId;
}

interface ChartProps {
  scene: ChartScene;
  /** 标签字号倍率：缩放时用它保持屏幕字号不变 */
  labelScale?: number;
  /** 缩放时传入裁剪后的 viewBox，浏览器会按最终尺寸重新栅格化，因此始终清晰 */
  viewBox?: ChartViewBox;
  /** 点击天体时回调对象 id */
  onPick?: (id: string) => void;
  /** 当前选中的对象 id，用于高亮 */
  selectedId?: string | null;
  /** 内容层缩放 */
  zoom?: number;
  /** 内容层平移（场景单位） */
  pan?: { x: number; y: number };
  /** 缩放 / 平移变化回调 */
  onViewChange?: (view: { zoom: number; pan: { x: number; y: number } }) => void;
  /** 允许滚轮缩放与拖拽平移 */
  interactive?: boolean;
  /** 不画任何 SVG 文字：导出卡片时用，文字改由 HTML 承担 */
  textFree?: boolean;
}

/** 越亮的行星泛光越大，避免金星和海王星看起来一样 */
function planetGlowScale(magnitude: number | null): number {
  if (magnitude === null) return 4;
  if (magnitude < -1) return 5.6;
  if (magnitude < 1) return 4.6;
  if (magnitude < 3) return 3.8;
  if (magnitude < 5) return 3.0;
  return 2.4;
}

/** 按天体 id 生成一个稳定的偏转角，避免所有星芒同向 */
function spikeAngle(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 900) / 10;
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

export function Chart({
  scene,
  labelScale = 1,
  viewBox,
  onPick,
  selectedId = null,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onViewChange,
  interactive = false,
  textFree = false,
}: ChartProps) {
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

  // 内容层：以天顶为中心缩放，再平移；外圈与刻度保持不动
  const contentTransform = `translate(${center + pan.x} ${center + pan.y}) scale(${zoom}) translate(${-center} ${-center})`;
  const contentLabelScale = labelScale / zoom;
  const clipId = `chart-clip-${useId().replace(/:/g, '')}`;

  const selectedObject = selectedId
    ? (scene.objects.find((object) => object.id === selectedId) ?? null)
    : null;

  const svgRef = useRef<SVGSVGElement>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const clampPan = (x: number, y: number, level: number) => {
    const limit = radius * (level - 1);
    return {
      x: Math.min(limit, Math.max(-limit, x)),
      y: Math.min(limit, Math.max(-limit, y)),
    };
  };

  useEffect(() => {
    if (!interactive || !onViewChange) return;
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const scale = Math.max(rect.width, rect.height) / size;
      const pointerX = center + (event.clientX - rect.left - rect.width / 2) / scale;
      const pointerY = center + (event.clientY - rect.top - rect.height / 2) / scale;
      const nextZoom = Math.min(5, Math.max(1, zoom * Math.exp(-event.deltaY * 0.0015)));
      if (Math.abs(nextZoom - zoom) < 0.001) return;

      // 让光标下的那一点在缩放前后停在同一位置
      const sceneX = center + (pointerX - center - pan.x) / zoom;
      const sceneY = center + (pointerY - center - pan.y) / zoom;
      const nextPan = clampPan(
        pointerX - center - (sceneX - center) * nextZoom,
        pointerY - center - (sceneY - center) * nextZoom,
        nextZoom,
      );
      onViewChange({ zoom: nextZoom, pan: nextPan });
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [interactive, onViewChange, zoom, pan, size, center, radius]);

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const vb = viewBox ?? { x: 0, y: 0, width: size, height: size };
    const id = pickObjectAt(scene, vb, rect, event.clientX, event.clientY, 14, zoom, pan);
    if (id) onPick(id);
  };

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
      ref={svgRef}
      className={`chart${daylight ? ' chart--day' : ''}${interactive ? ' chart--interactive' : ''}`}
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${daylight ? '白昼' : '夜间'}星空，可见 ${scene.starCount} 颗恒星`}
      onClick={handleClick}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
        draggedRef.current = false;
        if (interactive) {
          // 拖动期间关掉浏览器原生的文字选中
          document.body.classList.add('chart-panning');
        }
        if (interactive && zoom > 1 && onViewChange) {
          panRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        const start = pressRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
          draggedRef.current = true;
        }

        const drag = panRef.current;
        if (drag && interactive && onViewChange && zoom > 1) {
          const rect = event.currentTarget.getBoundingClientRect();
          const scale = Math.max(rect.width, rect.height) / size;
          onViewChange({
            zoom,
            pan: clampPan(
              drag.panX + (event.clientX - drag.x) / scale,
              drag.panY + (event.clientY - drag.y) / scale,
              zoom,
            ),
          });
        }
      }}
      onPointerUp={(event) => {
        panRef.current = null;
        document.body.classList.remove('chart-panning');
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        panRef.current = null;
        document.body.classList.remove('chart-panning');
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onDoubleClick={
        interactive && onViewChange
          ? () => onViewChange({ zoom: 1, pan: { x: 0, y: 0 } })
          : undefined
      }
      style={{
        cursor: interactive ? (zoom > 1 ? 'grab' : 'zoom-in') : onPick ? 'crosshair' : undefined,
      }}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <circle cx={center} cy={center} r={radius} />
        </clipPath>
        {/* 天顶到地平线的颜色层次：中心更深，边缘偏暖，像光污染的天光 */}
        <radialGradient id={`${clipId}-sky`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="chart-sky-center" />
          <stop offset="68%" className="chart-sky-mid" />
          <stop offset="100%" className="chart-sky-edge" />
        </radialGradient>
        <filter id={`${clipId}-star-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id={`${clipId}-density-glow`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        <radialGradient id={`${clipId}-star-aura`}>
          <stop offset="0%" className="chart-star-aura-center" />
          <stop offset="100%" className="chart-star-aura-edge" />
        </radialGradient>
        {scene.planets.map((planet) => (
          <radialGradient key={planet.id} id={`${clipId}-glow-${planet.id}`}>
            <stop offset="0%" stopColor={planet.color} stopOpacity={0.7} />
            <stop offset="38%" stopColor={planet.color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={planet.color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      <circle
        className="chart-disc"
        cx={center}
        cy={center}
        r={radius}
        style={{ fill: `url(#${clipId}-sky)` }}
      />

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
        !textFree &&
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

      {/* 内容层：缩放平移，但被地平圈裁掉，外圈始终不动 */}
      <g clipPath={`url(#${clipId})`}>
        <g transform={contentTransform}>
        {/* 星密度柔光：银河带一类的高密度区 */}
        {scene.density.length > 0 && (
          <g className="chart-density" filter={`url(#${clipId}-density-glow)`}>
            {scene.density.map((cell, index) => (
              <circle
                key={index}
                cx={cell.x}
                cy={cell.y}
                r={cell.r}
                opacity={cell.opacity * 0.025}
              />
            ))}
          </g>
        )}
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
          !textFree &&
          [30, 60].map((altitude) => (
            <text
              key={`ring-${altitude}`}
              className="chart-ring-label"
              x={center}
              y={center - ringRadius(altitude, radius) - 6}
              textAnchor="middle"
              fontSize={11 * contentLabelScale}
              style={{ strokeWidth: 3 * contentLabelScale }}
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

      {(scene.equator || scene.ecliptic) && (
        <g className="chart-guides">
          {scene.equator && (
            <path
              className="chart-guide chart-guide--equator"
              d={scene.equator}
              style={{ strokeWidth: 0.7 * contentLabelScale }}
            />
          )}
          {scene.ecliptic && (
            <path
              className="chart-guide chart-guide--ecliptic"
              d={scene.ecliptic}
              style={{ strokeWidth: 0.8 * contentLabelScale }}
            />
          )}
        </g>
      )}

      <g className="chart-star-spikes">
        {scene.brightStars.map((star) => {
          const spike = star.spike / Math.sqrt(zoom);
          return (
            <g
              key={star.hip}
              transform={`translate(${star.x} ${star.y}) rotate(${star.angle})`}
              style={{ opacity: Math.min(0.6, 0.32 + (2.2 - star.mag) * 0.06) }}
            >
              <circle r={spike * 1.25} fill={`url(#${clipId}-star-aura)`} />
              <line x1={-spike} y1={0} x2={spike} y2={0} />
              <line x1={0} y1={-spike} x2={0} y2={spike} />
            </g>
          );
        })}
      </g>

      <g className="chart-stars">
        {/* 亮星合并成一条路径做柔光，只模糊一层，避免 8 次全屏重绘 */}
        <path
          className="star-halo"
          d={scene.buckets
            .filter((bucket) => bucket.radius >= 2.4 && bucket.d)
            .map((bucket) => bucket.d)
            .join('')}
          filter={`url(#${clipId}-star-glow)`}
        />
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

      {/* 亮星闪烁：叠在星点上的小圆，透明度做缓慢呼吸 */}
      <g className="chart-twinkle">
        {scene.twinkleStars.map((star) => (
          <circle
            key={star.hip}
            cx={star.x}
            cy={star.y}
            r={star.r}
            style={{
              animationDelay: `${((star.hip % 23) / 10).toFixed(1)}s`,
              animationDuration: `${(2.4 + (star.hip % 17) / 10).toFixed(1)}s`,
            }}
          />
        ))}
      </g>

      <g className="chart-constellations">
        {scene.constellations.map((figure) => (
          <path key={figure.abbr} d={figure.d} style={{ strokeWidth: 0.85 * contentLabelScale }} />
        ))}
      </g>

      <g className="chart-planets">
        {scene.planets.map((planet) => {
          const glowRadius = planet.r * planetGlowScale(planet.magnitude);
          // 暗行星的光晕很小，星芒按光晕算会短到看不见，给它一个下限
          const faint = planet.magnitude !== null && planet.magnitude >= 3;
          const baseSpike = faint
            ? Math.max(glowRadius * 1.15, 8.5 * (planet.r / 2.8))
            : glowRadius * 1.15;
          // 星芒按屏幕尺寸补偿：放大时不再跟着拉长
          const spikeLength = baseSpike / Math.sqrt(zoom);
          const spikeOpacity = faint ? 0.26 : 0.24;
          return (
            <g key={planet.id}>
              {/* 星芒画在光晕下层：中心被光晕盖住，只露出细尖 */}
              <g
                transform={`translate(${planet.x} ${planet.y}) rotate(${spikeAngle(planet.id)})`}
              >
                <line
                  x1={-spikeLength}
                  y1={0}
                  x2={spikeLength}
                  y2={0}
                  stroke={planet.color}
                  strokeWidth={0.55}
                  strokeLinecap="round"
                  opacity={spikeOpacity}
                />
                <line
                  x1={0}
                  y1={-spikeLength}
                  x2={0}
                  y2={spikeLength}
                  stroke={planet.color}
                  strokeWidth={0.55}
                  strokeLinecap="round"
                  opacity={spikeOpacity}
                />
              </g>
              <circle
                cx={planet.x}
                cy={planet.y}
                r={glowRadius}
                fill={`url(#${clipId}-glow-${planet.id})`}
              />
              <circle cx={planet.x} cy={planet.y} r={planet.r} fill={planet.color} />
              <circle
                cx={planet.x}
                cy={planet.y}
                r={planet.r * 0.36}
                fill="#fffdf5"
                opacity={0.9}
              />
            </g>
          );
        })}
      </g>

      {scene.moon && (
        <g className="chart-moon">
          <circle cx={scene.moon.x} cy={scene.moon.y} r={scene.moon.r} className="chart-moon-dark" />
          <path className="chart-moon-lit" d={moonPhasePath(scene.moon)} />
        </g>
      )}

      {!textFree && (
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
            fontSize={label.size * contentLabelScale}
            style={{ strokeWidth: 3.5 * contentLabelScale }}
            dominantBaseline="middle"
          >
            {label.text}
          </text>
        ))}
        </g>
      )}

      {atlas && !textFree && (
        <text
          className="chart-ring-label"
          x={center}
          y={center + 15 * contentLabelScale}
          textAnchor="middle"
          fontSize={10 * contentLabelScale}
          style={{ strokeWidth: 3 * contentLabelScale }}
        >
          天顶
        </text>
      )}

      {selectedObject && (
        <circle
          className="chart-selected"
          cx={selectedObject.x}
          cy={selectedObject.y}
          r={13 * contentLabelScale}
        />
      )}

      <circle className="chart-zenith" cx={center} cy={center} r={1.6} />
        </g>
      </g>
    </svg>
  );
}
