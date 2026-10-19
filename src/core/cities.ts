/** 离线城市库中的一条记录。 */
export interface City {
  id: number;
  /** 拉丁名，用于搜索与回退显示 */
  name: string;
  /** 中文名，可能为空 */
  zh: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string;
  population: number;
}

/** cities.json 的紧凑序列化格式 */
interface CityFile {
  version: number;
  source: string;
  license: string;
  timezones: string[];
  countries: string[];
  cities: Array<[number, string, string | null, number, number, number, number, number]>;
}

export function parseCityDatabase(raw: unknown): City[] {
  const file = raw as CityFile;
  if (!file || file.version !== 1 || !Array.isArray(file.cities)) {
    throw new Error('城市库格式不正确');
  }

  return file.cities.map((row) => ({
    id: row[0],
    name: row[1],
    zh: row[2],
    latitude: row[3],
    longitude: row[4],
    timezone: file.timezones[row[5]],
    country: file.countries[row[6]],
    population: row[7],
  }));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 按"中文名优先、其次是拉丁名"的顺序做前缀搜索。
 *
 * 返回结果按匹配质量排序，同质量时人口多的在前。
 */
export function searchCities(cities: City[], query: string, limit = 8): City[] {
  const needle = normalize(query);
  if (!needle) return [];

  const scored: Array<{ city: City; score: number }> = [];

  for (const city of cities) {
    const zh = city.zh ? normalize(city.zh) : '';
    const name = normalize(city.name);

    let score = -1;
    if (zh && zh === needle) score = 0;
    else if (name === needle) score = 1;
    else if (zh && zh.startsWith(needle)) score = 2;
    else if (name.startsWith(needle)) score = 3;
    else if (zh && zh.includes(needle)) score = 4;
    else if (name.includes(needle)) score = 5;

    if (score >= 0) scored.push({ city, score });
  }

  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : b.city.population - a.city.population));
  return scored.slice(0, limit).map((entry) => entry.city);
}
