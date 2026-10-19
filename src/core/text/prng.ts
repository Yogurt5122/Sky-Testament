/**
 * xoshiro128** —— 确定性伪随机数发生器。
 *
 * 只依赖 32 位整数运算，同一浏览器与 Node 下结果一致。
 * 状态由 SHA-256 的前 16 字节填充。
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: Uint8Array) {
    if (seed.length < 16) throw new Error('种子至少需要 16 字节');
    const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
    this.s0 = view.getUint32(0, true);
    this.s1 = view.getUint32(4, true);
    this.s2 = view.getUint32(8, true);
    this.s3 = view.getUint32(12, true);

    // 全零状态会让 xoshiro 永续输出 0
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 0x9e3779b9;
  }

  /** 返回 32 位无符号整数。 */
  next(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0) as number;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  /** [0, 1) 的浮点数。 */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }

  /** 从数组中等概率取一个。 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('不能从空数组取值');
    return items[Math.floor(this.nextFloat() * items.length)];
  }
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}
