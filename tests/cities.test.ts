import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCityDatabase, searchCities } from '../src/core/cities';

const raw = JSON.parse(readFileSync('public/data/cities.json', 'utf8'));
const cities = parseCityDatabase(raw);

describe('parseCityDatabase', () => {
  it('解析出合理数量的城市', () => {
    expect(cities.length).toBeGreaterThan(5000);
    expect(cities.length).toBeLessThan(8000);
  });

  it('上海字段完整', () => {
    const shanghai = cities.find((city) => city.name === 'Shanghai');
    expect(shanghai).toBeDefined();
    expect(shanghai!.zh).toBe('上海');
    expect(shanghai!.timezone).toBe('Asia/Shanghai');
    expect(shanghai!.latitude).toBeCloseTo(31.22, 1);
    expect(shanghai!.longitude).toBeCloseTo(121.46, 1);
    expect(shanghai!.population).toBeGreaterThan(10_000_000);
  });

  it('成都、深圳使用覆盖表而不是别名', () => {
    expect(cities.find((city) => city.name === 'Chengdu')!.zh).toBe('成都');
    expect(cities.find((city) => city.name === 'Shenzhen')!.zh).toBe('深圳');
  });

  it('拒绝错误格式', () => {
    expect(() => parseCityDatabase({})).toThrow();
    expect(() => parseCityDatabase({ version: 2, cities: [] })).toThrow();
  });
});

describe('searchCities', () => {
  it('中文精确匹配排第一', () => {
    expect(searchCities(cities, '上海')[0].name).toBe('Shanghai');
    expect(searchCities(cities, '成都')[0].name).toBe('Chengdu');
  });

  it('拉丁名前缀可搜到', () => {
    const results = searchCities(cities, 'shang');
    expect(results.some((city) => city.name === 'Shanghai')).toBe(true);
  });

  it('大小写与空格无关', () => {
    expect(searchCities(cities, '  TOKYO ')[0].name).toBe('Tokyo');
  });

  it('空查询返回空数组', () => {
    expect(searchCities(cities, '   ')).toEqual([]);
  });

  it('遵守数量上限', () => {
    expect(searchCities(cities, 'a', 3).length).toBeLessThanOrEqual(3);
  });
});
