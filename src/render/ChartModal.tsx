import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Chart, pickObjectAt } from './Chart';
import type { ObjectDetails } from '../core/details';
import { ObjectPanel } from './ObjectPanel';
import type { ChartScene } from './scene';

const SCENE_SIZE = 1000;
/** 最小视图宽度 ≈ 14 倍放大 */
const MIN_WIDTH = 70;
/** 最大视图宽度：允许缩小到看清整个星盘 */
const MAX_WIDTH = 1600;

interface View {
  x: number;
  y: number;
  width: number;
}

function clampView(view: View): View {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, view.width));
  // 视图比场景大时（缩得很远），允许它居中超出场景
  const overflow = Math.max(0, width - SCENE_SIZE);
  const min = -overflow / 2;
  const max = SCENE_SIZE - width + overflow / 2;
  return {
    width,
    x: Math.min(max, Math.max(min, view.x)),
    y: Math.min(max, Math.max(min, view.y)),
  };
}

interface ChartModalProps {
  scene: ChartScene;
  onClose: () => void;
  onPick?: (id: string) => void;
  selectedId?: string | null;
  details?: ObjectDetails | null;
  onClearSelection?: () => void;
}

/**
 * 全屏星图：拖动平移、滚轮/双指缩放、双击复位。
 *
 * 缩放改的是 SVG 的 viewBox，而不是 CSS transform——
 * 浏览器会按最终尺寸重新栅格化矢量，任何倍率都清晰，
 * 标签字号按 viewBox 比例反向缩小，因此屏幕上大小恒定。
 */
/** 信息卡尺寸上限，用来把卡片限制在视口内 */
const CARD_WIDTH = 340;
const CARD_HEIGHT = 280;

function cardStyle(anchor: { x: number; y: number }): CSSProperties {
  const margin = 16;
  const width = Math.min(CARD_WIDTH, window.innerWidth - margin * 2);

  let left = anchor.x + 24;
  if (left + width > window.innerWidth - margin) left = anchor.x - width - 24;
  left = Math.max(margin, left);

  const top = Math.max(
    72,
    Math.min(window.innerHeight - CARD_HEIGHT - margin, anchor.y - 90),
  );

  return { left, top, width };
}

export function ChartModal({
  scene,
  onClose,
  onPick,
  selectedId,
  details,
  onClearSelection,
}: ChartModalProps) {
  const [view, setView] = useState<View>({ x: 0, y: 0, width: SCENE_SIZE });

  const viewRef = useRef(view);
  const stageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 选中天体的屏幕位置：随缩放与平移实时更新，信息卡贴着它
  useLayoutEffect(() => {
    if (!selectedId || !details) {
      setAnchor(null);
      return;
    }

    const stage = stageRef.current;
    const modal = modalRef.current;
    const svg = stage?.querySelector('svg');
    const object = scene.objects.find((item) => item.id === selectedId);
    if (!stage || !modal || !svg || !object) return;

    const point = svg.createSVGPoint();
    point.x = object.x;
    point.y = object.y;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const screen = point.matrixTransform(matrix);
    const rect = modal.getBoundingClientRect();
    setAnchor({ x: screen.x - rect.left, y: screen.y - rect.top });
  }, [selectedId, details, scene, view, viewport]);

  const apply = useCallback((next: View) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    setView(clamped);
  }, []);

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const current = viewRef.current;
      const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current.width / factor));
      if (Math.abs(nextWidth - current.width) < 0.5) return;

      const pointX = clientX ?? rect.left + rect.width / 2;
      const pointY = clientY ?? rect.top + rect.height / 2;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // slice：内容按长边铺满，等比缩放
      const scale = Math.max(rect.width, rect.height) / current.width;
      const currentCenterX = current.x + current.width / 2;
      const currentCenterY = current.y + current.width / 2;

      // 光标下的场景坐标，缩放后保持不动
      const anchorX = currentCenterX + (pointX - centerX) / scale;
      const anchorY = currentCenterY + (pointY - centerY) / scale;
      const nextScale = Math.max(rect.width, rect.height) / nextWidth;

      apply({
        width: nextWidth,
        x: anchorX - nextWidth / 2 - (pointX - centerX) / nextScale,
        y: anchorY - nextWidth / 2 - (pointY - centerY) / nextScale,
      });
    },
    [apply],
  );

  const reset = useCallback(() => apply({ x: 0, y: 0, width: SCENE_SIZE }), [apply]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === '+' || event.key === '=') zoomAt(1.4);
      else if (event.key === '-') zoomAt(1 / 1.4);
      else if (event.key === '0') reset();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, reset, zoomAt]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      dragOrigin.current = { x: event.clientX, y: event.clientY };
      pressOrigin.current = { x: event.clientX, y: event.clientY };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragOrigin.current = null;
      pressOrigin.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const stage = stageRef.current;
    if (!stage) return;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previous = pinchDistance.current;
      if (previous && previous > 0) {
        zoomAt(distance / previous, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchDistance.current = distance;
      return;
    }

    const origin = dragOrigin.current;
    if (!origin) return;

    const rect = stage.getBoundingClientRect();
    const unit = Math.max(rect.width, rect.height) / viewRef.current.width;
    const dx = (event.clientX - origin.x) / unit;
    const dy = (event.clientY - origin.y) / unit;
    dragOrigin.current = { x: event.clientX, y: event.clientY };

    apply({
      width: viewRef.current.width,
      x: viewRef.current.x - dx,
      y: viewRef.current.y - dy,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasSingle = pointers.current.size === 1;
    const origin = pressOrigin.current;
    pressOrigin.current = null;

    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;

    if (pointers.current.size === 0) {
      dragOrigin.current = null;
    } else {
      const [remaining] = [...pointers.current.values()];
      dragOrigin.current = { x: remaining.x, y: remaining.y };
    }

    // 全屏下指针被舞台捕获，SVG 收不到 click，这里用"按下到抬起的位移"判定点选
    if (!wasSingle || !origin || !onPick) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) return;

    const stage = stageRef.current;
    const svg = stage?.querySelector('svg');
    if (!stage || !svg) return;

    const current = viewRef.current;
    const id = pickObjectAt(
      scene,
      { x: current.x, y: current.y, width: current.width, height: current.width },
      svg.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    if (id) onPick(id);
  };

  return (
    <div className="chart-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label="星图">
      <div className="chart-modal-bar">
        <span className="chart-modal-title">星图</span>
        <span className="chart-modal-hint">拖动平移 · 滚轮或双指缩放 · 双击复位</span>
        <button ref={closeRef} type="button" className="chart-modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      <div
        className="chart-modal-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
      >
        <Chart
          scene={scene}
          viewBox={{ x: view.x, y: view.y, width: view.width, height: view.width }}
          labelScale={view.width / SCENE_SIZE}
          selectedId={selectedId}
        />
      </div>

      {details && onClearSelection && anchor && (
        <div className="chart-modal-card" style={cardStyle(anchor)}>
          <ObjectPanel details={details} onClose={onClearSelection} />
        </div>
      )}

      <div className="chart-modal-controls">
        <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="缩小">
          −
        </button>
        <button type="button" onClick={() => zoomAt(1.4)} aria-label="放大">
          +
        </button>
        <button type="button" className="chart-modal-reset" onClick={reset}>
          复位
        </button>
      </div>
    </div>
  );
}
