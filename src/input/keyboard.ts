import type { ShipInput } from '../domain/entities';

const HANDLED_KEYS = new Set([
  'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'z', ' ',
]);

export interface Keyboard {
  sample(): ShipInput;
  pressed(key: string): boolean;
  dispose(): void;
}

/** キー状態を保持し、毎フレーム ShipInput に変換する。ドメインには依存しない糊。 */
export function createKeyboard(target: Window = window): Keyboard {
  const keys = new Set<string>();
  const down = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (HANDLED_KEYS.has(k)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);

  return {
    sample() {
      const l = keys.has('arrowleft') || keys.has('a');
      const r = keys.has('arrowright') || keys.has('d');
      const u = keys.has('arrowup') || keys.has('w');
      const dn = keys.has('arrowdown') || keys.has('s');
      const fire = keys.has('z') || keys.has(' ');
      return { moveX: (r ? 1 : 0) - (l ? 1 : 0), moveY: (dn ? 1 : 0) - (u ? 1 : 0), fire };
    },
    pressed: (key) => keys.has(key.toLowerCase()),
    dispose() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
    },
  };
}
