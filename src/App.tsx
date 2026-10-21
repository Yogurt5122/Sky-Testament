import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseCityDatabase, searchCities, type City } from './core/cities';
import { computeSnapshot, type SkySnapshot } from './core/ephemeris';
import { computeNightWindow } from './core/night';
import { parseStarCatalog, type Star } from './core/starcatalog';
import { formatOffset, isValidTimeZone, localDateTimeOf, offsetSecondsAt, resolveLocalTime } from './core/time';
import { Chart } from './render/Chart';
import { ChartModal } from './render/ChartModal';
import { buildChartScene, type DetailLevel } from './render/scene';
import { deriveFacts } from './core/text/facts';
import { generateEpitaph, type TextStyle } from './core/text/epitaph';
import { findNightEvents } from './core/events';
import { bodyDetails, starDetails } from './core/details';
import { ObjectPanel } from './render/ObjectPanel';
import ShareCard from './render/ShareCard';
import { DateField } from './render/DateField';
import { inlineComputedStyles } from './render/flatten';
import { starSubtitle, starTitle, type StarDesignation } from './core/star-names';
import { buildShareQuery, parseShareQuery } from './core/share-link';
import starNamesZh from './data/star-names-zh.json';

const NAME_ZH = starNamesZh as Record<string, string>;

interface StarNameFile {
  [hip: string]: { n?: string; b?: string; c?: string; f?: string };
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

function buildDesignationMap(raw: StarNameFile): Map<number, StarDesignation> {
  const map = new Map<number, StarDesignation>();
  for (const [hip, entry] of Object.entries(raw)) {
    if (!entry.n && !entry.b && !entry.f) continue;
    map.set(Number(hip), { en: entry.n, bayer: entry.b, con: entry.c, flam: entry.f });
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
  // 分享链接：打开时如果有参数，就按参数还原表单与显示档位
  const [sharedLink] = useState(() =>
    typeof window === 'undefined' ? null : parseShareQuery(window.location.search),
  );

  const [form, setForm] = useState<FormState>(() =>
    sharedLink
      ? {
          date: sharedLink.date,
          time: sharedLink.time,
          timeZone: sharedLink.timeZone,
          latitude: sharedLink.latitude,
          longitude: sharedLink.longitude,
          elevation: sharedLink.elevation,
        }
      : DEFAULTS,
  );
  const [cities, setCities] = useState<City[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [starNames, setStarNames] = useState<Map<number, string>>(new Map());
  const [starDesignations, setStarDesignations] = useState<Map<number, StarDesignation>>(
    new Map(),
  );
  const [cityQuery, setCityQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [theme, setTheme] = useState<Theme>(sharedLink?.theme ?? 'night');
  const [quality, setQuality] = useState<QualityId>(sharedLink?.quality ?? 'suburb');
  const [detail, setDetail] = useState<DetailLevel>(sharedLink?.detail ?? 'standard');
  const [textStyle, setTextStyle] = useState<TextStyle>(sharedLink?.style ?? 'classical');
  const [variant, setVariant] = useState(sharedLink?.variant ?? 0);
  const [nightMinutes, setNightMinutes] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1600);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [compareDate, setCompareDate] = useState('');
  const [compareTime, setCompareTime] = useState('20:00');
  const [skyView, setSkyView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [liveOn, setLiveOn] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<SkySnapshot | null>(null);
  const liveDaylight = useRef<boolean | null>(null);
  const livePrevTheme = useRef<Theme>('night');
  const minutesRef = useRef(0);

  const qualityOption = SKY_QUALITY.find((option) => option.id === quality) ?? SKY_QUALITY[1];

  useEffect(() => {
    document.body.classList.toggle('theme-night', theme === 'night');
    return () => document.body.classList.remove('theme-night');
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/cities.json`)
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
      fetch(`${import.meta.env.BASE_URL}data/stars.bin`).then((response) => {
        if (!response.ok) throw new Error(`星表加载失败: ${response.status}`);
        return response.arrayBuffer();
      }),
      fetch(`${import.meta.env.BASE_URL}data/star-names.json`).then((response) => {
        if (!response.ok) throw new Error(`星名加载失败: ${response.status}`);
        return response.json() as Promise<StarNameFile>;
      }),
    ])
      .then(([buffer, names]) => {
        if (cancelled) return;
        setStars(parseStarCatalog(buffer));
        setStarNames(buildNameMap(names));
        setStarDesignations(buildDesignationMap(names));

        // 分享链接：星表就绪后自动算出这一张图
        if (sharedLink) {
          computeFromForm(
            {
              date: sharedLink.date,
              time: sharedLink.time,
              timeZone: sharedLink.timeZone,
              latitude: sharedLink.latitude,
              longitude: sharedLink.longitude,
              elevation: sharedLink.elevation,
            },
            sharedLink.theme,
            sharedLink.variant,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setStars([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 实时：每秒重算一次。天空每秒只转 0.004°，1Hz 在视觉上已经连续
  useEffect(() => {
    if (!liveOn || !result) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setLiveSnapshot(computeSnapshot(new Date(), result.snapshot.geo));
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [liveOn, result]);

  // 实时跨过日出 / 日落时，界面跟着换主题
  useEffect(() => {
    if (!liveOn || !liveSnapshot) return;

    const daylight = liveSnapshot.daylight;
    if (liveDaylight.current === null) {
      liveDaylight.current = daylight;
      return;
    }
    if (liveDaylight.current !== daylight) {
      liveDaylight.current = daylight;
      setTheme(daylight ? 'paper' : 'night');
    }
  }, [liveOn, liveSnapshot]);

  const selectedLabel = selectedCity ? (selectedCity.zh ?? selectedCity.name) : '';
  const showMatches =
    cityQuery.trim().length > 0 && cities.length > 0 && cityQuery.trim() !== selectedLabel;
  const matches = showMatches ? searchCities(cities, cityQuery, 6) : [];

  const nightWindow = useMemo(() => {
    if (!result) return null;
    return computeNightWindow(new Date(result.snapshot.utc), result.snapshot.geo);
  }, [result]);

  const totalMinutes = nightWindow
    ? (nightWindow.sunrise.getTime() - nightWindow.sunset.getTime()) / 60000
    : 0;

  const previewSnapshot = useMemo(() => {
    if (!result || !nightWindow || nightMinutes === null) return null;
    const instant = new Date(nightWindow.sunset.getTime() + nightMinutes * 60000);
    return computeSnapshot(instant, result.snapshot.geo);
  }, [result, nightWindow, nightMinutes]);

  const displaySnapshot =
    liveOn && liveSnapshot ? liveSnapshot : (previewSnapshot ?? result?.snapshot ?? null);

  const displayOffset = displaySnapshot
    ? formatOffset(
        offsetSecondsAt(new Date(displaySnapshot.utc).getTime(), form.timeZone.trim()),
      )
    : '';

  const currentMinutes =
    nightWindow && displaySnapshot
      ? Math.min(
          totalMinutes,
          Math.max(
            0,
            (new Date(displaySnapshot.utc).getTime() - nightWindow.sunset.getTime()) / 60000,
          ),
        )
      : 0;

  const timeZone = form.timeZone.trim();
  const sunsetLocal = nightWindow ? localDateTimeOf(nightWindow.sunset, timeZone) : null;
  const sunriseLocal = nightWindow ? localDateTimeOf(nightWindow.sunrise, timeZone) : null;
  const currentLocal = displaySnapshot
    ? localDateTimeOf(new Date(displaySnapshot.utc), timeZone)
    : null;

  const scene = useMemo(() => {
    if (!displaySnapshot || stars.length === 0) return null;
    return buildChartScene(displaySnapshot, stars, starNames, {
      limitingMagnitude: qualityOption.limit,
      detail,
      // 放大时标记只按 sqrt(zoom) 缓慢变大，而不是跟着线性放大
      sizeScale: 1 / Math.sqrt(skyView.zoom),
    });
  }, [displaySnapshot, stars, starNames, qualityOption.limit, detail, skyView.zoom]);

  // 文案只认已提交的时刻：拖动预览时文字保持不动，松手后才重算
  const committedScene = useMemo(() => {
    if (!result || stars.length === 0) return null;
    return buildChartScene(result.snapshot, stars, starNames, {
      limitingMagnitude: qualityOption.limit,
      detail,
    });
  }, [result, stars, starNames, qualityOption.limit, detail]);

  const events = useMemo(() => {
    if (!result) return [];
    const zone = form.timeZone.trim();
    const dateKeys = nightWindow
      ? [nightWindow.sunset, nightWindow.sunrise].map((date) =>
          localDateTimeOf(date, zone).date.slice(5),
        )
      : [];
    return findNightEvents(nightWindow, result.snapshot.geo, dateKeys);
  }, [result, nightWindow, form.timeZone]);

  // 选中对象只认已提交时刻：拖动预览时信息卡保持不动，松手后才重新确认
  const selectedObject = selectedId
    ? (committedScene?.objects.find((object) => object.id === selectedId) ?? null)
    : null;

  const details = useMemo(() => {
    if (!selectedObject || !result) return null;
    const snapshot = result.snapshot;

    if (selectedObject.kind === 'star') {
      const star = stars.find((item) => item.hip === selectedObject.hip);
      if (!star) return null;

      const designation = starDesignations.get(star.hip);
      const zhName = selectedObject.name || undefined;
      const info = starDetails(
        star,
        starTitle(designation, zhName, star.hip),
        snapshot,
        timeZone,
      );
      return { ...info, subtitle: starSubtitle(designation, zhName, star.hip) };
    }

    return bodyDetails(
      selectedObject.bodyId ?? 'moon',
      selectedObject.name,
      snapshot,
      timeZone,
    );
  }, [selectedObject, result, stars, starDesignations, timeZone]);

  const compareSnapshot = useMemo(() => {
    if (!compareOn || !result) return null;
    const [year, month, day] = compareDate.split('-').map(Number);
    const [hour, minute] = compareTime.split(':').map(Number);
    if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;

    try {
      const local = resolveLocalTime({
        year,
        month,
        day,
        hour,
        minute,
        timeZone: form.timeZone.trim(),
      });
      return computeSnapshot(local.utc, result.snapshot.geo);
    } catch {
      return null;
    }
  }, [compareOn, result, compareDate, compareTime, form.timeZone]);

  const compareScene = useMemo(() => {
    if (!compareSnapshot || stars.length === 0) return null;
    return buildChartScene(compareSnapshot, stars, starNames, {
      limitingMagnitude: qualityOption.limit,
      detail,
    });
  }, [compareSnapshot, stars, starNames, qualityOption.limit, detail]);

  const compareEpitaph = useMemo(() => {
    if (!compareSnapshot) return null;
    const facts = deriveFacts(compareSnapshot, compareScene?.brightestStar ?? null);
    return generateEpitaph({
      facts,
      utc: compareSnapshot.utc,
      latitude: compareSnapshot.geo.latitude,
      longitude: compareSnapshot.geo.longitude,
      style: textStyle,
      variant,
    });
  }, [compareSnapshot, compareScene, textStyle, variant]);

  const compareGapDays =
    compareSnapshot && result
      ? Math.abs(
          Math.round(
            (new Date(compareSnapshot.utc).getTime() -
              new Date(result.snapshot.utc).getTime()) /
              86400000,
          ),
        )
      : 0;

  const epitaph = useMemo(() => {
    if (!result) return null;
    const facts = deriveFacts(
      result.snapshot,
      committedScene?.brightestStar ?? null,
      events.map((event) => event.title),
    );
    return generateEpitaph({
      facts,
      utc: result.snapshot.utc,
      latitude: result.snapshot.geo.latitude,
      longitude: result.snapshot.geo.longitude,
      style: textStyle,
      variant,
    });
  }, [result, committedScene, events, textStyle, variant]);

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

  function computeFromForm(
    nextForm: FormState,
    themeOverride?: Theme,
    variantOverride?: number,
  ): void {
    setError(null);

    try {
      if (!isValidTimeZone(nextForm.timeZone.trim())) {
        throw new Error(`无法识别的时区：${nextForm.timeZone}`);
      }
      const [year, month, day] = nextForm.date.split('-').map(Number);
      const [hour, minute] = nextForm.time.split(':').map(Number);
      if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
        throw new Error('日期或时间格式不正确');
      }

      const local = resolveLocalTime({
        year,
        month,
        day,
        hour,
        minute,
        timeZone: nextForm.timeZone.trim(),
      });
      const snapshot = computeSnapshot(local.utc, {
        latitude: Number(nextForm.latitude),
        longitude: Number(nextForm.longitude),
        elevation: Number(nextForm.elevation || 0),
      });

      setResult({
        snapshot,
        offset: formatOffset(local.offsetSeconds),
        skipped: local.skipped,
        ambiguous: local.ambiguous,
      });

      // 白昼用纸面、夜间用夜空；分享链接可以强制指定主题
      setTheme(themeOverride ?? (snapshot.daylight ? 'paper' : 'night'));
      setVariant(variantOverride ?? 0);
      setNightMinutes(null);
      setPlaying(false);
      setSelectedId(null);
      setStarted(true);
      setCompareOn(false);
      setLiveOn(false);
      setLiveSnapshot(null);

      // 移动端表单较高，点完「计算」时页面往往还停在按钮处；
      // 第一次进入星图时回到顶部，否则画好的星图会被滚到视口上方
      if (!started) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    computeFromForm(form);
  }

  /** 前一日 / 后一日：保持钟点不变，只移动日期。 */
  function shiftDate(days: number): void {
    const [year, month, day] = form.date.split('-').map(Number);
    if (!year || !month || !day) return;

    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    const nextDate = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
    const nextForm = { ...form, date: nextDate };

    setForm(nextForm);
    computeFromForm(nextForm);
  }

  /** 停止实时：回到进入实时前的时刻，不把实时时间写回表单。 */
  function stopLive(): void {
    if (!liveOn) return;

    setTheme(livePrevTheme.current);
    setLiveOn(false);
    setLiveSnapshot(null);
    liveDaylight.current = null;
  }

  /** 把分享卡片按 1:1 栅格化成 PNG 下载 */
  async function downloadShareCard(): Promise<void> {
    const node = shareCardRef.current;
    if (!node || shareBusy) return;

    setShareBusy(true);
    setShareError(null);
    const restore = inlineComputedStyles(node);
    try {
      await document.fonts.ready;
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true });
      const link = document.createElement('a');
      const stamp = (currentLocal?.date ?? form.date).replace(/-/g, '');
      link.download = `sky-testament-${stamp}-${form.time.replace(':', '')}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setShareError('图片生成失败，请重试');
    } finally {
      restore();
      setShareBusy(false);
    }
  }

  // 有结果后把当前状态写进 URL，复制地址即可复现同一张图
  useEffect(() => {
    if (!result) return;
    const query = buildShareQuery({
      date: form.date,
      time: form.time,
      timeZone: form.timeZone,
      latitude: form.latitude,
      longitude: form.longitude,
      elevation: form.elevation,
      place: selectedCity ? (selectedCity.zh ?? selectedCity.name) : (sharedLink?.place ?? ''),
      style: textStyle,
      variant,
      theme,
      quality,
      detail,
    });
    const nextUrl = `${window.location.pathname}?${query}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [result, form, selectedCity, textStyle, variant, theme, quality, detail]);

  // 打开分享面板时生成二维码：指向当前 URL，扫码即可回到这一刻
  useEffect(() => {
    if (!shareOpen) return;
    let cancelled = false;
    setQrDataUrl(null);

    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(window.location.href, {
          margin: 1,
          width: 360,
          color: { dark: '#1a1a18', light: '#f4f0e8' },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [shareOpen]);

  async function copyShareLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setShareError('复制失败，请手动复制地址栏');
    }
  }

  const placeLabel = selectedCity
    ? (selectedCity.zh ?? selectedCity.name)
    : sharedLink?.place || '此刻';

  function toggleLive(): void {
    if (liveOn) {
      stopLive();
      return;
    }
    if (!result) return;

    setCompareOn(false);
    setNightMinutes(null);
    setPlaying(false);
    setSelectedId(null);

    livePrevTheme.current = theme;
    const snapshot = computeSnapshot(new Date(), result.snapshot.geo);
    liveDaylight.current = snapshot.daylight;
    setTheme(snapshot.daylight ? 'paper' : 'night');
    setLiveSnapshot(snapshot);
    setLiveOn(true);
  }

  /** 进入对比时，默认取十年前的同一天，同一钟点。 */
  function toggleCompare(): void {
    if (compareOn) {
      setCompareOn(false);
      return;
    }
    if (liveOn) stopLive();

    const [year, month, day] = form.date.split('-').map(Number);
    if (year && month && day) {
      setCompareDate(
        `${year - 10}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      );
    }
    setCompareTime(form.time);
    setCompareOn(true);
  }

  const commitNight = useCallback(
    (minutes: number) => {
      if (!result || !nightWindow) return;
      const instant = new Date(nightWindow.sunset.getTime() + minutes * 60000);
      const timeZone = form.timeZone.trim();
      const parts = localDateTimeOf(instant, timeZone);

      setForm((previous) => ({ ...previous, date: parts.date, time: parts.time }));
      setResult({
        snapshot: computeSnapshot(instant, result.snapshot.geo),
        offset: formatOffset(offsetSecondsAt(instant.getTime(), timeZone)),
        skipped: false,
        ambiguous: false,
      });
      setNightMinutes(null);
      setPlaying(false);
      setSelectedId(null);
    },
    [result, nightWindow, form.timeZone],
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      commitNight(minutesRef.current);
      return;
    }
    minutesRef.current = currentMinutes;
    setNightMinutes(currentMinutes);
    setPlaying(true);
  }, [playing, commitNight, currentMinutes]);

  // 播放：2× 时整夜约 9 秒，1× 约 18 秒，0.5× 约 36 秒
  useEffect(() => {
    if (!playing || !nightWindow) return;

    let frame = 0;
    let last = performance.now();
    // 倍速 = 现实时间的倍数：1× 即每分钟走一分钟
    const rate = speed / 60;

    const tick = (now: number) => {
      const delta = Math.min(0.12, (now - last) / 1000);
      last = now;

      const next = Math.min(totalMinutes, minutesRef.current + delta * rate);
      minutesRef.current = next;
      setNightMinutes(next);

      if (next >= totalMinutes) {
        commitNight(totalMinutes);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, nightWindow, totalMinutes, commitNight, speed]);

  const bodies = displaySnapshot
    ? [...displaySnapshot.bodies].sort((a, b) => b.altitude - a.altitude)
    : [];

  /** 「这一夜」面板：桌面放在右栏，移动端放在星图下面 */
  const nightPanel = (modifier: string) =>
    !liveOn && nightWindow ? (
      <section className={`night ${modifier}`}>
        <div className="night-head">
          <span className="option-label">这一夜</span>
          <span className="night-window">
            {sunsetLocal?.date.slice(5)} {sunsetLocal?.label}
            {' — '}
            {sunriseLocal?.date.slice(5)} {sunriseLocal?.label}
          </span>
          <span className="night-now">{currentLocal?.label}</span>
          <div className="segmented night-speed">
            {[1, 800, 1600, 3200, 6400].map((value) => (
              <button
                key={value}
                type="button"
                className={speed === value ? 'is-active' : ''}
                onClick={() => setSpeed(value)}
                aria-label={`${value} 倍速`}
              >
                {value}×
              </button>
            ))}
          </div>
          <button type="button" className="night-play" onClick={togglePlay}>
            {playing ? '暂停' : '播放'}
          </button>
        </div>

        <div className="night-slider">
          <button
            type="button"
            className="night-day"
            onClick={() => shiftDate(-1)}
            aria-label="前一日"
            title="前一日"
          >
            ‹
          </button>

          <input
            className="night-range"
            type="range"
            min={0}
            max={Math.round(totalMinutes)}
            step={1}
            value={Math.round(currentMinutes)}
            aria-label="这一夜的时间轴"
            onChange={(event) => {
              const value = Number(event.target.value);
              minutesRef.current = value;
              setNightMinutes(value);
            }}
            onPointerUp={() => commitNight(minutesRef.current)}
            onKeyUp={() => commitNight(minutesRef.current)}
          />

          <button
            type="button"
            className="night-day"
            onClick={() => shiftDate(1)}
            aria-label="后一日"
            title="后一日"
          >
            ›
          </button>
        </div>

        <div className="night-scale">
          <span>日落</span>
          <span>午夜</span>
          <span>日出</span>
        </div>

        {nightMinutes !== null && (
          <p className="night-hint">预览中 · 松开后应用，并重新生成文案</p>
        )}
      </section>
    ) : null;

  return (
    <main className={started ? (compareOn ? 'stage stage--compare' : 'stage') : 'page'}>
      {!started && (
        <>
          <header className="masthead">
        <p className="kicker">M5 · 详情与天象</p>
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
            <DateField value={form.date} onChange={(value) => update('date', value)} />
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

        <button type="submit">计算这一刻的天空</button>
      </form>

          {error && <p className="error" role="alert">{error}</p>}
          <p className="entry-note">所有星历在本机计算 · 不上传任何输入</p>
        </>
      )}

      {started && (
        <>
          <header className="stage-bar">
            <button type="button" className="stage-back" onClick={() => setStarted(false)}>
              ← 返回修改
            </button>
            <span className="stage-place">
              {placeLabel}
              {currentLocal ? ` · ${currentLocal.date.replace(/-/g, '.')}` : ''}
              {currentLocal ? ` ${currentLocal.label}` : ''}
            </span>

            <button
              type="button"
              className="stage-compare"
              aria-pressed={compareOn}
              onClick={toggleCompare}
            >
              {compareOn ? '退出对比' : '双时刻'}
            </button>

            <button
              type="button"
              className={`stage-live${liveOn ? ' is-live' : ''}`}
              aria-pressed={liveOn}
              onClick={toggleLive}
            >
              <span className="stage-live-dot" />
              {liveOn ? '停止实时' : '实时'}
            </button>

            <div className="stage-options">
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
                <span className="option-label">质量</span>
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

            <span className="stage-mark">天穹遗嘱</span>
          </header>

          {compareOn ? (
            <section className="compare">
              <div className="compare-bar">
                <span className="compare-label">对比时刻</span>
                <input
                  type="date"
                  value={compareDate}
                  onChange={(event) => setCompareDate(event.target.value)}
                  aria-label="对比日期"
                />
                <input
                  type="time"
                  value={compareTime}
                  onChange={(event) => setCompareTime(event.target.value)}
                  aria-label="对比时间"
                />
                <span className="compare-gap">
                  {compareSnapshot ? `相隔 ${compareGapDays} 天` : '请输入有效的对比时刻'}
                </span>
              </div>

              <div className="compare-grid">
                <article className="compare-pane">
                  <p className="compare-date">
                    {form.date.replace(/-/g, '.')} · {form.time}
                  </p>
                  {scene && (
                    <figure className="chart-figure">
                      <Chart scene={scene} />
                    </figure>
                  )}
                  {epitaph && <p className="compare-epitaph">{epitaph.text}</p>}
                </article>

                <article className="compare-pane">
                  <p className="compare-date">
                    {compareDate ? compareDate.replace(/-/g, '.') : '—'} · {compareTime}
                  </p>
                  {compareScene && (
                    <figure className="chart-figure">
                      <Chart scene={compareScene} />
                    </figure>
                  )}
                  {compareEpitaph && (
                    <p className="compare-epitaph">{compareEpitaph.text}</p>
                  )}
                </article>
              </div>
            </section>
          ) : result && displaySnapshot ? (
            <section className="stage-grid">
          <div className="stage-sky">
            {scene && (
              <div className="chart-wrap">
                <figure className="chart-figure">
                  <Chart
                    scene={scene}
                    onPick={setSelectedId}
                    selectedId={selectedId}
                    zoom={skyView.zoom}
                    pan={skyView.pan}
                    onViewChange={setSkyView}
                    interactive
                  />
                  <figcaption>
                    {scene.daylight ? '白昼的天空 · ' : ''}
                    可见恒星 {scene.starCount} 颗 · 极限 {scene.limitingMagnitude} 等 · 球极投影
                    {scene.objects.length > 0 ? ' · 点击天体' : ''}
                    {' · 滚轮缩放 · 拖动平移'}
                  </figcaption>
                </figure>
                <div className="chart-actions">
                  <button type="button" className="chart-trigger" onClick={() => setChartOpen(true)}>
                    全屏星空
                  </button>
                  <button
                    type="button"
                    className="chart-trigger"
                    onClick={() => setShareOpen(true)}
                    disabled={!scene || !epitaph}
                  >
                    分享卡片
                  </button>
                  {skyView.zoom > 1 && (
                    <button
                      type="button"
                      className="stage-reset"
                      onClick={() => setSkyView({ zoom: 1, pan: { x: 0, y: 0 } })}
                    >
                      {skyView.zoom.toFixed(1)}× · 复位
                    </button>
                  )}
                </div>
              </div>
            )}

            {nightPanel('night--mobile')}

            <div className="stage-left">
              <div className="stage-table">
                <table>
                  <thead>
                    <tr>
                      <th>天体</th>
                      <th className="num">高度</th>
                      <th className="num">星等</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bodies.map((body) => (
                      <tr key={body.id} className={body.aboveHorizon ? '' : 'below'}>
                        <td>{body.name}</td>
                        <td className="num">{formatAltitude(body.altitude)}</td>
                        <td className="num">{formatMagnitude(body.magnitude)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {details && (
                <ObjectPanel details={details} onClose={() => setSelectedId(null)} floating />
              )}
            </div>
          </div>

          <aside className="stage-rail">
            <p className="stage-date">{currentLocal?.date.replace(/-/g, '.')}</p>
            <h1 className="stage-title">{placeLabel}</h1>
            <p className="stage-coord">
              {currentLocal?.label} · {displaySnapshot.geo.latitude.toFixed(2)}°N{' '}
              {displaySnapshot.geo.longitude.toFixed(2)}°E
            </p>

            {liveOn && (
              <p className="stage-live-status">
                <span className="stage-live-dot" />
                实时 · 每秒刷新 · 停止后回到进入实时前的时刻
              </p>
            )}

            {epitaph && !liveOn && (
              <section className="epitaph">
                <div className="epitaph-head">
                  <span className="option-label">文案</span>
                  <div className="segmented">
                    <button
                      type="button"
                      className={textStyle === 'classical' ? 'is-active' : ''}
                      onClick={() => setTextStyle('classical')}
                    >
                      古典
                    </button>
                    <button
                      type="button"
                      className={textStyle === 'modern' ? 'is-active' : ''}
                      onClick={() => setTextStyle('modern')}
                    >
                      现代
                    </button>
                  </div>
                  <button
                    type="button"
                    className="epitaph-reroll"
                    onClick={() => setVariant((value) => value + 1)}
                  >
                    换一版
                  </button>
                </div>

                <p className="epitaph-text">{epitaph.text}</p>
                <p className="epitaph-seed">seed {epitaph.seed}</p>
              </section>
            )}

            {nightPanel('night--rail')}

            {events.length > 0 && (
              <section className="events">
                <span className="option-label">这一夜的天象</span>
                <ul>
                  {events.map((event) => (
                    <li key={event.title}>
                      <strong>{event.title}</strong>
                      <span>
                        {event.detail}
                        {event.at ? ` · ${localDateTimeOf(event.at, timeZone).label}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <dl className="meta">
              <div>
                <dt>UTC</dt>
                <dd>{displaySnapshot.utc.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')}</dd>
              </div>
              <div>
                <dt>UTC 偏移</dt>
                <dd>{displayOffset}</dd>
              </div>
              <div>
                <dt>坐标</dt>
                <dd>
                  {displaySnapshot.geo.latitude}°, {displaySnapshot.geo.longitude}°
                </dd>
              </div>
              <div>
                <dt>天空</dt>
                <dd>{displaySnapshot.daylight ? '白昼' : '夜间'}</dd>
              </div>
              <div>
                <dt>月相</dt>
                <dd>
                  {displaySnapshot.moon.phaseName} · 照亮{' '}
                  {(displaySnapshot.moon.illumination * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt>太阳高度</dt>
                <dd>{formatAltitude(displaySnapshot.sunAltitude)}</dd>
              </div>
            </dl>

            {result.skipped && nightMinutes === null && (
              <p className="notice">
                这个本地时间在 {form.timeZone} 不存在（夏令时前拨），已顺延为 {result.snapshot.utc}。
              </p>
            )}
            {result.ambiguous && nightMinutes === null && (
              <p className="notice">
                这个本地时间在 {form.timeZone} 出现两次（夏令时回拨），此处取较早的一次。
              </p>
            )}
          </aside>

          {chartOpen && scene && (
            <ChartModal
              scene={scene}
              onClose={() => setChartOpen(false)}
              onPick={setSelectedId}
              selectedId={selectedId}
              details={details}
              onClearSelection={() => setSelectedId(null)}
            />
          )}

          {shareOpen && scene && epitaph && displaySnapshot && (
            <div
              className="share-modal"
              role="dialog"
              aria-modal="true"
              aria-label="分享卡片"
              onClick={() => setShareOpen(false)}
            >
              <div className="share-modal__panel" onClick={(event) => event.stopPropagation()}>
                <div className="share-modal__viewport">
                  <div className="share-modal__scale">
                    <div ref={shareCardRef}>
                      <ShareCard
                        city={placeLabel}
                        date={currentLocal?.date ?? form.date}
                        time={currentLocal?.label ?? form.time}
                        latitude={displaySnapshot.geo.latitude}
                        longitude={displaySnapshot.geo.longitude}
                        text={epitaph.text}
                        seed={epitaph.seed}
                        scene={scene}
                        starCount={scene.starCount}
                        qrDataUrl={qrDataUrl}
                      />
                    </div>
                  </div>
                </div>

                {shareError && <p className="share-modal__error">{shareError}</p>}

                <div className="share-modal__actions">
                  <button type="button" onClick={downloadShareCard} disabled={shareBusy}>
                    {shareBusy ? '正在生成…' : '下载 PNG'}
                  </button>
                  <button type="button" onClick={copyShareLink}>
                    {shareCopied ? '已复制' : '复制链接'}
                  </button>
                  <button type="button" onClick={() => setShareOpen(false)}>
                    关闭
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
          ) : null}
        </>
      )}

      <footer className="footer">
        星历由 astronomy-engine 计算，赤道坐标取当日坐标系、含光行差；地平坐标使用标准大气折射。
      </footer>
    </main>
  );
}
