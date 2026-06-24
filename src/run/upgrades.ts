import type { PlayerLoadout } from './loadout';
import type { Rng } from '../domain/rng';

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  apply(l: PlayerLoadout): void;
}

/** 強化プール。撃破ごとにここから3つ引いて1つ選ばせる。 */
export const UPGRADES: Upgrade[] = [
  {
    id: 'spread',
    name: '拡散ショット',
    desc: '弾数+2（直線なら3方向化）',
    apply(l) {
      if (l.weapon.kind === 'straight') {
        l.weapon.kind = 'odd';
        l.weapon.ways = 3;
      } else {
        l.weapon.ways += 2;
      }
    },
  },
  { id: 'rapid', name: '連射UP', desc: '連射速度 +20%', apply: (l) => void (l.weapon.interval = Math.max(0.03, l.weapon.interval * 0.8)) },
  { id: 'power', name: '威力UP', desc: '1発の威力 +1', apply: (l) => void (l.weapon.damage += 1) },
  { id: 'velocity', name: '弾速UP', desc: '自弾が速くなる +90', apply: (l) => void (l.weapon.speed += 90) },
  { id: 'wide', name: '拡散角UP', desc: '弾の広がり +', apply: (l) => void (l.weapon.spread += 0.06) },
  { id: 'maxhp', name: '最大HP+2', desc: '最大HP+2 / +2回復', apply: (l) => void ((l.maxHp += 2), (l.hp += 2)) },
  { id: 'heal', name: '回復+3', desc: 'HPを3回復', apply: (l) => void (l.hp = Math.min(l.maxHp, l.hp + 3)) },
];

/** rng で重複なく count 個引く（Fisher-Yates）。 */
export function drawChoices(rng: Rng, count = 3): Upgrade[] {
  const pool = [...UPGRADES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
