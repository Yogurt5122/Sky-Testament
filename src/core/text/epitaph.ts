import type { SkyFacts } from './facts';
import { Rng } from './prng';
import { encodeUtf8, sha256 } from './sha256';

export type TextStyle = 'classical' | 'modern';

export interface EpitaphInput {
  facts: SkyFacts;
  /** 确定性锚点：UTC 时刻 + 坐标，而不是本地时间 */
  utc: string;
  latitude: number;
  longitude: number;
  style: TextStyle;
  variant: number;
}

export interface Epitaph {
  style: TextStyle;
  variant: number;
  lines: string[];
  text: string;
  /** 种子前 8 位，便于展示与复现 */
  seed: string;
}

/** 版本化：语料调整后旧链接不会悄悄变味 */
const TEXT_VERSION = 1;

/** 文案中禁止出现的预测性 / 命理词汇 */
export const FORBIDDEN_WORDS = [
  '将会',
  '注定',
  '预示',
  '运势',
  '命中',
  '财富',
  '健康',
  '婚姻',
  '吉凶',
  '命理',
];

const SKY_CLASSICAL = ['天黑如墨', '夜色极静', '风止于野', '天无片云', '星河在地', '寒气初上'];

const ADORN_CLASSICAL = ['远山如黛', '屋瓦无声', '灯火尽熄', '长河在天', '四野无人', '露水初生'];

const CLOSE_CLASSICAL = [
  '人未至',
  '天地无言',
  '此夜如常',
  '万物各安其位',
  '无人知晓',
  '星光不答',
  '一切尚未开始',
  '来路犹长',
];

const SEASON_CLASSICAL = ['春夜将半', '夏夜初临', '秋夜已深', '冬夜未尽'];

const MOON_CLASSICAL: Record<string, string[]> = {
  新月: ['月隐不见', '夜空无月', '朔月无光'],
  蛾眉月: ['月如钩', '一痕新月', '新月如眉'],
  上弦月: ['月上弦', '弦月当空', '半月在天'],
  盈凸月: ['月将满', '月近圆', '月色渐盈'],
  满月: ['月正圆', '满月当空', '月明如昼'],
  亏凸月: ['月已亏', '月过圆满', '月色渐亏'],
  下弦月: ['月下弦', '半月西斜', '月向天西'],
  残月: ['残月在天', '一弯残月', '月将隐'],
};

const MOON_MODERN: Record<string, string[]> = {
  新月: ['没有月亮，天上只有星。', '那晚没有月亮。'],
  蛾眉月: ['一弯很细的月。', '月亮只是一道细边。'],
  上弦月: ['月亮只亮了一半。', '半个月亮挂在天上。'],
  盈凸月: ['月亮快要圆了。', '月亮已经亮了大半。'],
  满月: ['月亮很圆。', '月光把地照白了。'],
  亏凸月: ['月亮开始缺了。', '月亮比前一天少了一点。'],
  下弦月: ['月亮只剩一半。', '半个月亮，慢慢往西沉。'],
  残月: ['残月快落下去了。', '天上只剩一小片月。'],
};

const OPENING_MODERN = [
  '那天晚上，天很干净。',
  '那晚没有云。',
  '夜风很轻。',
  '城市安静下来之后，天就黑了。',
  '那是一个普通的夜晚。',
];

const CLOSE_MODERN = [
  '后来的一切，都还没有发生。',
  '天空已经准备好了。',
  '这一夜什么也没有发生。',
  '没有人抬头。',
  '星光落在屋顶上。',
  '风在窗外交替。',
];

const PLANET_CLASSICAL = ['{planet}在{dir}', '{planet}见于{dir}', '{planet}低悬于{dir}'];
const PLANET_MODERN = ['{planet}在{dir}边亮着', '{planet}挂在{dir}方'];
const STAR_CLASSICAL = ['{star}最明', '唯{star}独明', '{star}当空'];
const STAR_MODERN = ['{star}是那晚最亮的一颗', '{star}很亮'];

interface Slots {
  sky: string;
  moon: string;
  adorn: string;
  season: string;
  body: string;
  close: string;
}

type ClassicalTemplate = (slots: Slots) => string;

const CLASSICAL_TEMPLATES: ClassicalTemplate[] = [
  (s) => `是夜${s.sky}，${s.moon}。${s.adorn}，${s.body}。${s.close}。`,
  (s) => `${s.season}，${s.sky}。${s.moon}，${s.body}。`,
  (s) => `${s.moon}。${s.adorn}，${s.body}，${s.close}。`,
  (s) => `${s.sky}。${s.body}，${s.moon}。${s.close}。`,
];

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function classicalBody(facts: SkyFacts, rng: Rng): string {
  if (facts.planets.length > 0) {
    const planet = facts.planets[0];
    return fill(rng.pick(PLANET_CLASSICAL), { planet: planet.name, dir: planet.direction });
  }
  if (facts.brightestStar) {
    return fill(rng.pick(STAR_CLASSICAL), { star: facts.brightestStar });
  }
  return '群星无言';
}

function modernBody(facts: SkyFacts, rng: Rng): string {
  if (facts.planets.length > 0) {
    const planet = facts.planets[0];
    return fill(rng.pick(PLANET_MODERN), { planet: planet.name, dir: planet.direction });
  }
  if (facts.brightestStar) {
    return fill(rng.pick(STAR_MODERN), { star: facts.brightestStar });
  }
  return '星星很多，一盏一盏的';
}

function composeClassical(facts: SkyFacts, rng: Rng): string {
  const slots: Slots = {
    sky: rng.pick(SKY_CLASSICAL),
    moon: rng.pick(MOON_CLASSICAL[facts.moonPhaseName] ?? ['月色在天']),
    adorn: rng.pick(ADORN_CLASSICAL),
    season: rng.pick(SEASON_CLASSICAL),
    body: classicalBody(facts, rng),
    close: rng.pick(CLOSE_CLASSICAL),
  };
  return rng.pick(CLASSICAL_TEMPLATES)(slots);
}

function composeModern(facts: SkyFacts, rng: Rng): string {
  const opening = rng.pick(OPENING_MODERN);
  const moon = rng.pick(MOON_MODERN[facts.moonPhaseName] ?? ['月亮在天上。']);
  const body = modernBody(facts, rng);
  const close = rng.pick(CLOSE_MODERN);

  return facts.planets.length > 0 || facts.brightestStar
    ? `${opening}${moon}${body}。${close}`
    : `${opening}${moon}${close}`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？])/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 种子只取决于输入，不取决于语料：同一时刻、地点、风格、变体永远同一段话。 */
export function canonicalKey(input: EpitaphInput): string {
  return JSON.stringify({
    v: TEXT_VERSION,
    utc: input.utc,
    lat: Number(input.latitude.toFixed(4)),
    lon: Number(input.longitude.toFixed(4)),
    style: input.style,
    variant: input.variant,
  });
}

export function generateEpitaph(input: EpitaphInput): Epitaph {
  const canonical = canonicalKey(input);
  const digest = sha256(encodeUtf8(canonical));
  const rng = new Rng(digest.slice(0, 16));

  const text =
    input.style === 'classical' ? composeClassical(input.facts, rng) : composeModern(input.facts, rng);

  const seed = Array.from(digest.slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return {
    style: input.style,
    variant: input.variant,
    lines: splitSentences(text),
    text,
    seed,
  };
}
