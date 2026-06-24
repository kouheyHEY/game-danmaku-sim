/**
 * シード付き決定論乱数（mulberry32）。
 * Math.random を使わないことで、同じシード＋同じ入力列なら必ず同じ展開になる。
 * これが「ブラウザ無しで面白さをテストできる」前提を支える。
 */
export interface Rng {
  next(): number; // [0, 1)
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
