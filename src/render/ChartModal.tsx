import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart } from './Chart';
import type { ChartScene } from './scene';

const SCENE_SIZE = 1000;
/** 最小视图宽度 ≈ 14 倍放大 */
const MIN_WIDTH = 70;
const MAX_WIDTH = SCENE_SIZE;

interface View {
  x: number;
  y: number;
  width: number;
}

function clampView(view: View): View {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, view.width));
  const limit = SCENE_SIZE - width;
  return {
    width,
    x: Math.min(limit, Math.max(0, view.x)),
    y: Math.min(limit, Math.max(0, view.y)),
  };
}

interface ChartModalProps {
  scene: ChartScene;
  onClose: () => void;
}

/**
 * 全屏星图：拖动平移、滚轮/双指缩放、双击复位。
 *
 * 缩放改的是 SVG 的 viewBox，而不是 CSS transform——
 * 浏览器会按最终尺寸重新栅格化矢量，任何倍率都清晰，
 * 标签字号按 viewBox 比例反向缩小，因此屏幕上大小恒定。
 */
export function ChartModal({ scene, onClose }: ChartModalProps) {
  const [view, setView] = useState<View>({ x: 0, y: 0, width: SCENE_SIZE });

  const viewRef = useRef(view);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

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
      const offsetX = pointX - rect.left;
      const offsetY = pointY - rect.top;

      // 光标处的场景坐标，缩放后保持不动
      const anchorX = current.x + (offsetX / rect.width) * current.width;
      const anchorY = current.y + (offsetY / rect.height) * current.width;

      apply({
        width: nextWidth,
        x: anchorX - (offsetX / rect.width) * nextWidth,
        y: anchorY - (offsetY / rect.height) * nextWidth,
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
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragOrigin.current = null;
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
    const unit = rect.width / viewRef.current.width;
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
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;

    if (pointers.current.size === 0) {
      dragOrigin.current = null;
    } else {
      const [remaining] = [...pointers.current.values()];
      dragOrigin.current = { x: remaining.x, y: remaining.y };
    }
  };

  return (
    <div className="chart-modal" role="dialog" aria-modal="true" aria-label="星图">
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
        />
      </div>

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
