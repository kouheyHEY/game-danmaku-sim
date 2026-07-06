import { makeWorld, defaultShip, shipSpawn, step, type World } from '../domain/world';
import type { ShipInput } from '../domain/entities';
import { makeRng, type Rng } from '../domain/rng';
import { FIELD } from '../spec/stage0';
import { startingLoadout, type PlayerLoadout } from './loadout';
import { buildWeapon } from './weapon';
import { ambientRain, makeBoss } from './content';
import { randomWeaponUpgrade } from './upgrades';

export const IFRAME = 2.0; // 被弾後の無敵(点滅) [s]
export const RESPAWN_TIME = 0.7; // 画面下から復帰しきるまで [s]
const BOSS_FIRST = 10; // 最初のボスまで [s]
const BOSS_INTERVAL = 14; // 撃破後、次のボスまで [s]
const BOSS_ID = 1;

export type Phase = 'title' | 'playing' | 'gameover';

export interface Toast {
  text: string;
  until: number;
}

export interface Session {
  phase: Phase;
  world: World;
  loadout: PlayerLoadout;
  level: number; // 撃破したボス数
  score: number; // ＝避けた弾数（world.dodged）
  nextBossAt: number; // world.time
  bossActive: boolean;
  toast: Toast | null;
  rng: Rng;
  seed: number;
}

function newWorld(loadout: PlayerLoadout, level: number, seed: number): World {
  const ship = defaultShip(FIELD);
  ship.weapon = buildWeapon(loadout.weapon);
  ship.hp = loadout.hp;
  ship.maxHp = loadout.maxHp;
  const world = makeWorld({ bounds: FIELD, seed, ship, enemies: [] });
  world.enemyPattern = ambientRain(level, FIELD.w);
  world.firingEnabled = true;
  return world;
}

export function beginSession(seed = Date.now()): Session {
  const s = seed >>> 0;
  const loadout = startingLoadout();
  const world = newWorld(loadout, 0, s);
  return {
    phase: 'playing',
    world,
    loadout,
    level: 0,
    score: 0,
    nextBossAt: world.time + BOSS_FIRST,
    bossActive: false,
    toast: null,
    rng: makeRng(s),
    seed: s,
  };
}

/** タイトル画面用（Tap to Start だけ）。中身は開始前のセッション。 */
export function titleSession(seed = Date.now()): Session {
  const s = beginSession(seed);
  s.phase = 'title';
  return s;
}

/** 復帰スライド：画面下からスーッと初期位置へ（easeOutCubic）。 */
function respawnSlide(w: World): { x: number; y: number } {
  const b = w.bounds;
  const spawn = shipSpawn(b);
  const startY = b.y + b.h + 36;
  const p = Math.max(0, Math.min(1, 1 - (w.ship.respawnUntil - w.time) / RESPAWN_TIME));
  const e = 1 - (1 - p) ** 3;
  return { x: spawn.x, y: startY + (spawn.y - startY) * e };
}

export function stepSession(session: Session, input: ShipInput, dt: number): void {
  if (session.phase !== 'playing') return;
  const w = session.world;
  const ship = w.ship;

  const used: ShipInput = w.time < ship.respawnUntil ? { moveX: 0, moveY: 0 } : input;
  const events = step(w, used, dt);
  for (const ev of events) {
    if (ev.kind === 'bullet-hits-enemy' && ev.owner === 'player') {
      const e = w.enemies.find((x) => x.id === ev.enemy);
      if (e) e.hp -= session.loadout.weapon.damage;
    } else if (ev.kind === 'bullet-hits-ship' && ev.owner === 'enemy') {
      if (w.time >= ship.invulnUntil) {
        ship.hp -= 1;
        ship.deathPos = { x: ship.pos.x, y: ship.pos.y };
        ship.invulnUntil = w.time + IFRAME;
        ship.respawnUntil = w.time + RESPAWN_TIME;
      }
    }
  }
  if (w.time < ship.respawnUntil) {
    ship.pos = respawnSlide(w);
    ship.vel = { x: 0, y: 0 };
  }

  session.score = w.dodged;
  if (session.toast && w.time >= session.toast.until) session.toast = null;

  // ボスの出現／撃破
  if (session.bossActive) {
    const defeated = !w.enemies.some((e) => e.hp > 0);
    w.enemies = w.enemies.filter((e) => e.hp > 0);
    if (defeated) {
      session.bossActive = false;
      session.level += 1;
      ship.hp = Math.min(ship.maxHp, ship.hp + 1); // HP+1回復
      session.loadout.hp = ship.hp;
      const name = randomWeaponUpgrade(session.rng, session.loadout);
      ship.weapon = buildWeapon(session.loadout.weapon); // 強化を反映
      w.enemyPattern = ambientRain(session.level, w.bounds.w); // 雨を濃く
      session.nextBossAt = w.time + BOSS_INTERVAL;
      session.toast = { text: `BOSS撃破！  +1HP ・ ${name}`, until: w.time + 2.4 };
    }
  } else if (w.time >= session.nextBossAt) {
    w.enemies.push(makeBoss(BOSS_ID, session.level, w.bounds));
    session.bossActive = true;
  }

  if (ship.hp <= 0) session.phase = 'gameover';
}
