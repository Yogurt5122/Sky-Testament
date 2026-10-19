import { useEffect, useMemo, useState } from 'react';
import { parseCityDatabase, searchCities, type City } from './core/cities';
import { computeSnapshot, type SkySnapshot } from './core/ephemeris';
import { parseStarCatalog, type Star } from './core/starcatalog';
import { formatOffset, isValidTimeZone, resolveLocalTime } from './core/time';
import { Chart } from './render/Chart';
import { ChartModal } from './render/ChartModal';
import { buildChartScene, type DetailLevel } from './render/scene';
import starNamesZh from './data/star-names-zh.json';

const NAME_ZH = starNamesZh as Record<string, string>;

interface StarNameFile {
  [hip: string]: { n?: string };
}

function buildNameMap(raw: StarNameFile): Map<number, string> {
  const map = new Map<number, string>();
  for (const [hip, entry] of Object.entries(raw)) {
    if (!entry.n) continue;
    const chinese = NAME_ZH[entry.n];
    if (!chinese) continue;
    map.set(Number(hip), chinese);
  }
  return map;
}

interface FormState {
  date: string;
  time: string;
  timeZone: string;
  latitude: string;
  longitude: string;
  elevation: string;
}

const DEFAULTS: FormState = {
  date: '2026-10-19',
  time: '20:00',
  timeZone: 'Asia/Shanghai',
  latitude: '31.2304',
  longitude: '121.4737',
  elevation: '0',
};

interface Result {
  snapshot: SkySnapshot;
  offset: string;
  skipped: boolean;
  ambiguous: boolean;
}

type Theme = 'night' | 'paper';

const SKY_QUALITY = [
  { id: 'dark', label: '暗夜', limit: 6.5, hint: '极限 6.5 等' },
  { id: 'suburb', label: '郊外', limit: 5.5, hint: '极限 5.5 等' },
  { id: 'city', label: '城市', limit: 4.0, hint: '极限 4.0 等' },
] as const;

type QualityId = (typeof SKY_QUALITY)[number]['id'];

const MINUS = '\u2212';

function formatSigned(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits);
  return `${value < 0 ? MINUS : '+'}${text}`;
}

function formatAltitude(value: number): string {
  return `${formatSigned(value)}°`;
}

function formatMagnitude(value: number | null): string {
  if (value === null) return '—';
  return value < 0 ? `${MINUS}${Math.abs(value).toFixed(1)}` : value.toFixed(1);
}

export default function App() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [cities, setCities] = useState<City[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [starNames, setStarNames] = useState<Map<number, string>>(new Map());
  const [cityQuery, setCityQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [theme, setTheme] = useState<Theme>('night');
  const [quality, setQuality] = useState<QualityId>('suburb');
  const [detail, setDetail] = useState<DetailLevel>('standard');

  const qualityOption = SKY_QUALITY.find((option) => option.id === quality) ?? SKY_QUALITY[1];

  useEffect(() => {
    document.body.classList.toggle('theme-night', theme === 'night');
    return () => document.body.classList.remove('theme-night');
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/cities.json')
      .then((response) => {
        if (!response.ok) throw new Error(`城市库加载失败: ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        if (!cancelled) setCities(parseCityDatabase(raw));
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/data/stars.bin').then((response) => {
        if (!response.ok) throw new Error(`星表加载失败: ${response.status}`);
        return response.arrayBuffer();
      }),
      fetch('/data/star-names.json').then((response) => {
        if (!response.ok) throw new Error(`星名加载失败: ${response.status}`);
        return response.json() as Promise<StarNameFile>;
      }),
    ])
      .then(([buffer, names]) => {
        if (cancelled) return;
        setStars(parseStarCatalog(buffer));
        setStarNames(buildNameMap(names));
      })
      .catch(() => {
        if (!cancelled) setStars([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedLabel = selectedCity ? (selectedCity.zh ?? selectedCity.name) : '';
  const showMatches =
    cityQuery.trim().length > 0 && cities.length > 0 && cityQuery.trim() !== selectedLabel;
  const matches = showMatches ? searchCities(cities, cityQuery, 6) : [];

  const scene = useMemo(() => {
    if (!result || stars.length === 0) return null;
    return buildChartScene(result.snapshot, stars, starNames, {
      limitingMagnitude: qualityOption.limit,
      detail,
    });
  }, [result, stars, starNames, qualityOption.limit, detail]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function chooseCity(city: City): void {
    setForm((previous) => ({
      ...previous,
      timeZone: city.timezone,
      latitude: city.latitude.toFixed(4),
      longitude: city.longitude.toFixed(4),
    }));
    setSelectedCity(city);
    setCityQuery(city.zh ?? city.name);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setError(null);
    setResult(null);

    try {
      if (!isValidTimeZone(form.timeZone.trim())) {
        throw new Error(`无法识别的时区：${form.timeZone}`);
      }
      const [year, month, day] = form.date.split('-').map(Number);
      const [hour, minute] = form.time.split(':').map(Number);
      if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
        throw new Error('日期或时间格式不正确');
      }

      const local = resolveLocalTime({ year, month, day, hour, minute, timeZone: form.timeZone.trim() });
      const snapshot = computeSnapshot(local.utc, {
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        elevation: Number(form.elevation || 0),
      });

      setResult({
        snapshot,
        offset: formatOffset(local.offsetSeconds),
        skipped: local.skipped,
        ambiguous: local.ambiguous,
      });

      // 白昼用纸面、夜间用夜空，避免浅色圆盘压在深色页面上
      setTheme(snapshot.daylight ? 'paper' : 'night');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const bodies = result
    ? [...result.snapshot.bodies].sort((a, b) => b.altitude - a.altitude)
    : [];

  return (
    <main className="page">
      <header className="masthead">
        <p className="kicker">M4 · 夜空</p>
        <h1>天穹遗嘱</h1>
        <p className="lede">
          输入一个时刻与地点，还原那一刻真实可见的天空。球极投影，天顶居中，地平线为外圈。
        </p>
      </header>

      <form className="panel" onSubmit={handleSubmit}>
        <div className="city-search">
          <label>
            <span>查找城市</span>
            <input
              type="text"
              value={cityQuery}
              onChange={(event) => {
                setCityQuery(event.target.value);
                if (selectedCity && event.target.value.trim() !== selectedLabel) {
                  setSelectedCity(null);
                }
              }}
              placeholder="上海 / Tokyo / New York"
              spellCheck={false}
            />
          </label>
          {selectedCity && (
            <p className="city-selected">
              已选择 {selectedCity.zh ?? selectedCity.name}
              <span>
                {selectedCity.name} · {selectedCity.timezone}
              </span>
            </p>
          )}
          {matches.length > 0 && (
            <ul className="city-results">
              {matches.map((city) => (
                <li key={city.id}>
                  <button type="button" onClick={() => chooseCity(city)}>
                    <span className="city-name">{city.zh ?? city.name}</span>
                    <span className="city-meta">
                      {city.name} · {city.timezone} · {city.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fields">
          <label>
            <span>日期</span>
            <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
          </label>
          <label>
            <span>时间</span>
            <input type="time" value={form.time} onChange={(e) => update('time', e.target.value)} required />
          </label>
          <label>
            <span>时区</span>
            <input
              type="text"
              value={form.timeZone}
              onChange={(e) => update('timeZone', e.target.value)}
              placeholder="Asia/Shanghai"
              spellCheck={false}
            />
          </label>
          <label>
            <span>纬度</span>
            <input
              type="number"
              step="0.0001"
              value={form.latitude}
              onChange={(e) => update('latitude', e.target.value)}
            />
          </label>
          <label>
            <span>经度</span>
            <input
              type="number"
              step="0.0001"
              value={form.longitude}
              onChange={(e) => update('longitude', e.target.value)}
            />
          </label>
          <label>
            <span>海拔（米）</span>
            <input
              type="number"
              step="1"
              value={form.elevation}
              onChange={(e) => update('elevation', e.target.value)}
            />
          </label>
        </div>

        <div className="options">
          <div className="option-group">
            <span className="option-label">画面</span>
            <div className="segmented">
              <button
                type="button"
                className={theme === 'night' ? 'is-active' : ''}
                onClick={() => setTheme('night')}
              >
                夜空
              </button>
              <button
                type="button"
                className={theme === 'paper' ? 'is-active' : ''}
                onClick={() => setTheme('paper')}
              >
                纸
              </button>
            </div>
          </div>

          <div className="option-group">
            <span className="option-label">天空质量</span>
            <div className="segmented">
              {SKY_QUALITY.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={quality === option.id ? 'is-active' : ''}
                  onClick={() => setQuality(option.id)}
                  title={option.hint}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="option-group">
            <span className="option-label">图例</span>
            <div className="segmented">
              <button
                type="button"
                className={detail === 'minimal' ? 'is-active' : ''}
                onClick={() => setDetail('minimal')}
                title="只画星星，不要任何标注"
              >
                纯净
              </button>
              <button
                type="button"
                className={detail === 'standard' ? 'is-active' : ''}
                onClick={() => setDetail('standard')}
                title="主要星座连线、行星与亮星名"
              >
                标准
              </button>
              <button
                type="button"
                className={detail === 'atlas' ? 'is-active' : ''}
                onClick={() => setDetail('atlas')}
                title="叠加黄道、天赤道、高度环标注与更多数据"
              >
                图谱
              </button>
            </div>
          </div>
        </div>

        <button type="submit">计算这一刻的天空</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {result && (
        <section className="result">
          {scene && (
            <>
              <figure className="chart-figure">
                <Chart scene={scene} />
                <figcaption>
                  {scene.daylight ? '白昼的天空 · ' : ''}
                  可见恒星 {scene.starCount} 颗 · 极限 {scene.limitingMagnitude} 等 · 球极投影
                </figcaption>
              </figure>
              <div className="chart-actions">
                <button type="button" className="chart-trigger" onClick={() => setChartOpen(true)}>
                  查看星图
                </button>
              </div>
            </>
          )}

          {chartOpen && scene && (
            <ChartModal scene={scene} onClose={() => setChartOpen(false)} />
          )}

          <dl className="meta">
            <div>
              <dt>UTC</dt>
              <dd>{result.snapshot.utc.replace('.000Z', 'Z')}</dd>
            </div>
            <div>
              <dt>UTC 偏移</dt>
              <dd>{result.offset}</dd>
            </div>
            <div>
              <dt>坐标</dt>
              <dd>
                {result.snapshot.geo.latitude}°, {result.snapshot.geo.longitude}°
              </dd>
            </div>
            <div>
              <dt>天空</dt>
              <dd>{result.snapshot.daylight ? '白昼' : '夜间'}</dd>
            </div>
            <div>
              <dt>月相</dt>
              <dd>
                {result.snapshot.moon.phaseName} · 照亮 {(result.snapshot.moon.illumination * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt>太阳高度</dt>
              <dd>{formatAltitude(result.snapshot.sunAltitude)}</dd>
            </div>
          </dl>

          {result.skipped && (
            <p className="notice">
              这个本地时间在 {form.timeZone} 不存在（夏令时前拨），已顺延为 {result.snapshot.utc}。
            </p>
          )}
          {result.ambiguous && (
            <p className="notice">
              这个本地时间在 {form.timeZone} 出现两次（夏令时回拨），此处取较早的一次。
            </p>
          )}

          <table>
            <thead>
              <tr>
                <th>天体</th>
                <th className="num">高度</th>
                <th className="num">方位</th>
                <th className="num">星等</th>
                <th>位置</th>
              </tr>
            </thead>
            <tbody>
              {bodies.map((body) => (
                <tr key={body.id} className={body.aboveHorizon ? '' : 'below'}>
                  <td>{body.name}</td>
                  <td className="num">{formatAltitude(body.altitude)}</td>
                  <td className="num">{body.azimuth.toFixed(1)}°</td>
                  <td className="num">{formatMagnitude(body.magnitude)}</td>
                  <td>{body.aboveHorizon ? '地平线以上' : '地平线以下'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="footer">
        星历由 astronomy-engine 计算，赤道坐标取当日坐标系、含光行差；地平坐标使用标准大气折射。
      </footer>
    </main>
  );
}
