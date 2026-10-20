import { describe, expect, it } from 'vitest';
import { bayerSymbol, starSubtitle, starTitle } from '../src/core/star-names';
import { CONSTELLATION_ZH } from '../src/data/constellations-zh';

describe('bayerSymbol', () => {
  it('把拜耳缩写转成希腊字母', () => {
    expect(bayerSymbol('Alp')).toBe('α');
    expect(bayerSymbol('Bet')).toBe('β');
    expect(bayerSymbol('Ome')).toBe('ω');
  });

  it('保留编号上标', () => {
    expect(bayerSymbol('Kap-1')).toBe('κ¹');
    expect(bayerSymbol('Gam-3')).toBe('γ³');
  });

  it('未知缩写原样返回', () => {
    expect(bayerSymbol('Xyz')).toBe('Xyz');
  });
});

describe('starTitle', () => {
  const orion = { bayer: 'Bet', con: 'Ori' };

  it('中英文都有时写成「中文/英文」', () => {
    expect(starTitle({ en: 'Rigel', ...orion }, '参宿七', 24436)).toBe('参宿七/Rigel');
  });

  it('只有中文专名时原样返回', () => {
    expect(starTitle(orion, '参宿七', 24436)).toBe('参宿七');
  });

  it('只有英文专名时用英文', () => {
    expect(starTitle({ en: 'Rigel', ...orion }, undefined, 24436)).toBe('Rigel');
  });

  it('再次星座 + 拜耳字母', () => {
    expect(starTitle(orion, undefined, 24436)).toBe('猎户座 β');
  });

  it('只有弗兰斯蒂德编号时显示编号', () => {
    expect(starTitle({ flam: '42', con: 'Ori' }, undefined, 1)).toBe('猎户座 42');
  });

  it('什么都没有时退回 HIP', () => {
    expect(starTitle(undefined, undefined, 15474)).toBe('HIP 15474');
  });
});

describe('starSubtitle', () => {
  it('有名字时第二行只留 HIP', () => {
    expect(starSubtitle({ en: 'Hamal', bayer: 'Alp', con: 'Ari' }, '娄宿三', 9884)).toBe(
      'HIP 9884',
    );
  });

  it('只有英文名时同样只留 HIP', () => {
    expect(starSubtitle({ en: 'Rigel', bayer: 'Bet', con: 'Ori' }, undefined, 24436)).toBe(
      'HIP 24436',
    );
  });

  it('只有拜耳名时也只留 HIP', () => {
    expect(starSubtitle({ bayer: 'Bet', con: 'Ori' }, undefined, 24436)).toBe('HIP 24436');
  });

  it('没有名字时标为恒星', () => {
    expect(starSubtitle(undefined, undefined, 15474)).toBe('恒星');
  });
});

describe('CONSTELLATION_ZH', () => {
  it('覆盖 88 个星座', () => {
    expect(Object.keys(CONSTELLATION_ZH)).toHaveLength(88);
  });

  it('常用星座有中文名', () => {
    expect(CONSTELLATION_ZH.Ori).toBe('猎户座');
    expect(CONSTELLATION_ZH.UMa).toBe('大熊座');
    expect(CONSTELLATION_ZH.Cru).toBe('南十字座');
  });
});
