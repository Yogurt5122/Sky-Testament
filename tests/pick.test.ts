import { describe, expect, it } from 'vitest';
import { pickObjectAt } from '../src/render/Chart';
import type { ChartScene } from '../src/render/scene';

const rect = { left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 } as DOMRect;
const viewBox = { x: 0, y: 0, width: 1000, height: 1000 };
const scene = {
  center: 500,
  objects: [{ id: 'star-1', x: 550, y: 500 }],
} as unknown as ChartScene;

describe('pickObjectAt', () => {
  it('未缩放时按真实位置判定', () => {
    expect(pickObjectAt(scene, viewBox, rect, 555, 500)).toBe('star-1');
    expect(pickObjectAt(scene, viewBox, rect, 600, 500)).toBeNull();
  });

  it('放大 2 倍后物体出现在 600', () => {
    expect(pickObjectAt(scene, viewBox, rect, 600, 500, 14, 2)).toBe('star-1');
    expect(pickObjectAt(scene, viewBox, rect, 555, 500, 14, 2)).toBeNull();
  });

  it('平移后命中位置随之移动', () => {
    expect(pickObjectAt(scene, viewBox, rect, 650, 500, 14, 2, { x: 50, y: 0 })).toBe('star-1');
    expect(pickObjectAt(scene, viewBox, rect, 600, 500, 14, 2, { x: 50, y: 0 })).toBeNull();
  });
});
