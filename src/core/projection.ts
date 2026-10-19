/**
 * 球极投影（stereographic），以天顶为中心，地平线落在半径 R 的圆上。
 *
 *   z = 90° − 高度（天顶距）
 *   r = R · tan(z / 2)
 *   x = r · sin(方位)
 *   y = −r · cos(方位)      // 北在上
 *
 * 保角，星座形状在地平线附近仍然可辨认；方位等距投影在边缘会明显拉伸。
 */
export interface ProjectedPoint {
  x: number;
  y: number;
  /** 距天顶的投影半径 */
  r: number;
  /** 是否在地平线以上（含 1° 余量，方便画地平线附近的天体） */
  visible: boolean;
}

const DEG2RAD = Math.PI / 180;

export function projectStereographic(
  azimuthDegrees: number,
  altitudeDegrees: number,
  radius: number,
): ProjectedPoint {
  const zenithDistance = Math.max(0, 90 - altitudeDegrees);
  const r = radius * Math.tan((zenithDistance * DEG2RAD) / 2);
  const azimuth = azimuthDegrees * DEG2RAD;

  return {
    x: r * Math.sin(azimuth),
    y: -r * Math.cos(azimuth),
    r,
    visible: altitudeDegrees >= -1,
  };
}

/** 天顶距与投影半径的互逆变换，供测试使用。 */
export function radiusToAltitude(r: number, radius: number): number {
  const z = 2 * Math.atan(r / radius) / DEG2RAD;
  return 90 - z;
}
