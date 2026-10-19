import { describe, expect, it } from 'vitest';
import { projectStereographic, radiusToAltitude } from '../src/core/projection';

const R = 400;

describe('projectStereographic', () => {
  it('天顶落在圆心', () => {
    const point = projectStereographic(0, 90, R);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
    expect(point.r).toBeCloseTo(0, 6);
  });

  it('地平线落在半径 R 的圆上', () => {
    for (const azimuth of [0, 45, 90, 180, 270, 359]) {
      const point = projectStereographic(azimuth, 0, R);
      expect(point.r).toBeCloseTo(R, 6);
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(R, 6);
    }
  });

  it('北在正上方、东在正右方', () => {
    const north = projectStereographic(0, 45, R);
    expect(north.x).toBeCloseTo(0, 6);
    expect(north.y).toBeLessThan(0);

    const east = projectStereographic(90, 45, R);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0, 6);
  });

  it('高度与投影半径互为逆运算', () => {
    for (const altitude of [0, 15, 30, 60, 85]) {
      const point = projectStereographic(123, altitude, R);
      expect(radiusToAltitude(point.r, R)).toBeCloseTo(altitude, 6);
    }
  });

  it('地平线以下的点标记为不可见', () => {
    expect(projectStereographic(0, -5, R).visible).toBe(false);
    expect(projectStereographic(0, 5, R).visible).toBe(true);
  });

  it('随高度升高单调靠近圆心', () => {
    const radii = [0, 20, 40, 60, 80].map((altitude) => projectStereographic(0, altitude, R).r);
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]).toBeLessThan(radii[index - 1]);
    }
  });
});
