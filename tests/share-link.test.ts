import { describe, expect, it } from 'vitest';
import { buildShareQuery, parseShareQuery, type ShareLinkState } from '../src/core/share-link';

const base: ShareLinkState = {
  date: '2026-10-19',
  time: '20:00',
  timeZone: 'Asia/Shanghai',
  latitude: '30.6667',
  longitude: '104.0667',
  elevation: '0',
  place: '成都',
  style: 'classical',
  variant: 0,
  theme: 'night',
  quality: 'suburb',
  detail: 'standard',
};

describe('share-link', () => {
  it('参数可以完整往返', () => {
    const parsed = parseShareQuery(`?${buildShareQuery(base)}`);
    expect(parsed).toEqual(base);
  });

  it('保留换一版与图谱档', () => {
    const parsed = parseShareQuery(
      `?${buildShareQuery({ ...base, variant: 3, detail: 'atlas', theme: 'paper', style: 'modern' })}`,
    );
    expect(parsed?.variant).toBe(3);
    expect(parsed?.detail).toBe('atlas');
    expect(parsed?.theme).toBe('paper');
    expect(parsed?.style).toBe('modern');
  });

  it('缺少日期或坐标时返回 null', () => {
    expect(parseShareQuery('?t=20:00&lat=30&lon=104&tz=Asia/Shanghai')).toBeNull();
    expect(parseShareQuery('?d=2026-10-19&t=20:00&tz=Asia/Shanghai')).toBeNull();
    expect(parseShareQuery('')).toBeNull();
  });

  it('拒绝越界的坐标与非法日期', () => {
    expect(parseShareQuery('?d=2026-13-40&t=20:00&lat=30&lon=104&tz=UTC')).toBeNull();
    expect(parseShareQuery('?d=2026-10-19&t=20:00&lat=120&lon=104&tz=UTC')).toBeNull();
    expect(parseShareQuery('?d=2026-10-19&t=20:00&lat=30&lon=200&tz=UTC')).toBeNull();
  });

  it('未知的枚举值回落到默认', () => {
    const parsed = parseShareQuery('?d=2026-10-19&t=20:00&lat=30&lon=104&tz=UTC&q=nope&m=nope&s=x');
    expect(parsed?.quality).toBe('suburb');
    expect(parsed?.detail).toBe('standard');
    expect(parsed?.style).toBe('classical');
  });
});
