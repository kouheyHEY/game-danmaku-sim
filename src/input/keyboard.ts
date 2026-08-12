/**
 * 十字キー入力をゲーム内の移動入力へ変換する。
 */
import type { ShipInput } from '../domain/entities';

export const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** 押下中の十字キーを、ドメインへ渡す移動入力へ変換する。 */
export function arrowKeyInput(pressed: ReadonlySet<string>): ShipInput {
  return {
    moveX: Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft')),
    moveY: Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp')),
  };
}
