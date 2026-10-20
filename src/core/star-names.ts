import { CONSTELLATION_ZH } from '../data/constellations-zh';

/** HYG 的拜耳缩写 → 希腊字母 */
const GREEK: Record<string, string> = {
  Alp: 'α',
  Bet: 'β',
  Gam: 'γ',
  Del: 'δ',
  Eps: 'ε',
  Zet: 'ζ',
  Eta: 'η',
  The: 'θ',
  Iot: 'ι',
  Kap: 'κ',
  Lam: 'λ',
  Mu: 'μ',
  Nu: 'ν',
  Xi: 'ξ',
  Omi: 'ο',
  Pi: 'π',
  Rho: 'ρ',
  Sig: 'σ',
  Tau: 'τ',
  Ups: 'υ',
  Phi: 'φ',
  Chi: 'χ',
  Psi: 'ψ',
  Ome: 'ω',
};

const SUPERSCRIPT: Record<string, string> = {
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
};

export interface StarDesignation {
  /** 英文专名，例如 Rigel */
  en?: string;
  /** 拜耳缩写，例如 Alp、Kap-1 */
  bayer?: string;
  /** 星座缩写，例如 Ori */
  con?: string;
  /** 弗兰斯蒂德编号，例如 42 */
  flam?: string;
}

/** 「Alp」→「α」，「Kap-1」→「κ¹」 */
export function bayerSymbol(bayer: string): string {
  const [base, suffix] = bayer.split('-');
  const letter = GREEK[base];
  if (!letter) return bayer;
  return suffix ? `${letter}${SUPERSCRIPT[suffix] ?? suffix}` : letter;
}

/**
 * 恒星的展示名：中文专名 → 英文专名 → 星座 + 拜耳字母 → 星座 + 编号 → HIP。
 *
 * 中外文都有时写成「娄宿三/Hamal」，第二行只留目录编号。
 */
export function starTitle(
  designation: StarDesignation | undefined,
  zhName: string | undefined,
  hip: number,
): string {
  if (zhName) {
    return designation?.en ? `${zhName}/${designation.en}` : zhName;
  }
  if (designation?.en) return designation.en;

  const constellation = designation?.con
    ? CONSTELLATION_ZH[designation.con]
    : undefined;
  if (constellation && designation?.bayer) {
    return `${constellation} ${bayerSymbol(designation.bayer)}`;
  }
  if (constellation && designation?.flam) {
    return `${constellation} ${designation.flam}`;
  }

  return `HIP ${hip}`;
}

/** 详情卡的副标题：有名字时只留目录编号，否则标为恒星。 */
export function starSubtitle(
  designation: StarDesignation | undefined,
  zhName: string | undefined,
  hip: number,
): string {
  return starTitle(designation, zhName, hip) === `HIP ${hip}` ? '恒星' : `HIP ${hip}`;
}
