import { makeWorld, defaultShip, shipSpawn, step, type World } from '../domain/world';
import type { Enemy, ShipInput } from '../domain/entities';
import { makeRng, type Rng } from '../domain/rng';
import { FIELD } from '../spec/stage0';
import { startingLoadout, type PlayerLoadout } from './loadout';
import { buildWeapon } from './weapon';
import { enemyQueue, type EnemySpec } from './enemies';
import { drawChoices, type Upgrade } from './upgrades';

const IFRAME = 2.0; // 被弾後の無敵(点滅) [s]
export const RESPAWN_TIME = 0.7; // 画面下から復帰しきるまで [s]（この間は操作不可・無発射）

export type RunPhase = 'fighting' | 'reward' | 'gameover' | 'win';

export interface Run {
  loadout: PlayerLoadout;
  queue: EnemySpec[];
  index: number; // 現在の敵
  phase: RunPhase;
  rewards: Upgrade[]; // reward フェーズの3択
  world: World;
  rng: Rng;
  seed: number;
}

function buildEncounter(loadout: PlayerLoadout, spec: EnemySpec, seed: number): World {
  const ship = defaultShip(FIELD);
  ship.weapon = buildWeapon(loadout.weapon);
  ship.hp = loadout.hp;
  ship.maxHp = loadout.maxHp;
  ship.invulnUntil = 0;
  const enemy: Enemy = {
    id: 1,
    pos: { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h * 0.16 },
    vel: { x: spec.speed, y: 0 },
    hitRadius: spec.hitRadius,
    hp: spec.hp,
    maxHp: spec.hp,
  };
  const world = makeWorld({ bounds: FIELD, seed, ship, enemies: [enemy] });
  world.enemyPattern = spec.pattern;
  world.firingEnabled = true;
  return world;
}

export function startRun(seed = Date.now()): Run {
  const s = seed >>> 0;
  const rng = makeRng(s);
  const loadout = startingLoadout();
  const queue = enemyQueue();
  const world = buildEncounter(loadout, queue[0], s + 1);
  return { loadout, queue, index: 0, phase: 'fighting', rewards: [], world, rng, seed: s };
}

/** 現在の敵スペック。 */
export function currentEnemy(run: Run): EnemySpec {
  return run.queue[run.index];
}

/**
 * 戦闘を1ステップ進め、イベントをダメージに解決する。
 * 撃破→reward（最後なら win）、自機HP0→gameover。
 */
/** 復帰スライド：画面下からスーッと初期位置へ上がる（easeOutCubic）。 */
function respawnSlide(w: World): { x: number; y: number } {
  const b = w.bounds;
  const spawn = shipSpawn(b);
  const startY = b.y + b.h + 36; // 画面の少し下
  const p = Math.max(0, Math.min(1, 1 - (w.ship.respawnUntil - w.time) / RESPAWN_TIME));
  const e = 1 - (1 - p) ** 3;
  return { x: spawn.x, y: startY + (spawn.y - startY) * e };
}

export function stepRun(run: Run, input: ShipInput, dt: number): void {
  if (run.phase !== 'fighting') return;
  const w = run.world;
  const ship = w.ship;
  // 復帰スライド中だけ操作を止める（点滅の残り＝grace 中は動ける）。
  const used: ShipInput = w.time < ship.respawnUntil ? { moveX: 0, moveY: 0 } : input;
  const events = step(w, used, dt);
  for (const ev of events) {
    if (ev.kind === 'bullet-hits-enemy' && ev.owner === 'player') {
      const e = w.enemies.find((x) => x.id === ev.enemy);
      if (e) e.hp -= run.loadout.weapon.damage;
    } else if (ev.kind === 'bullet-hits-ship' && ev.owner === 'enemy') {
      if (w.time >= ship.invulnUntil) {
        ship.hp -= 1;
        ship.deathPos = { x: ship.pos.x, y: ship.pos.y }; // その場で爆発させる位置
        ship.invulnUntil = w.time + IFRAME;
        ship.respawnUntil = w.time + RESPAWN_TIME;
      }
    }
  }
  // 復帰中は位置を下からのスライドで上書き（操作・物理に依らない）。
  if (w.time < ship.respawnUntil) {
    ship.pos = respawnSlide(w);
    ship.vel = { x: 0, y: 0 };
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  if (ship.hp <= 0) {
    run.phase = 'gameover';
    return;
  }
  if (w.enemies.length === 0) {
    run.loadout.hp = ship.hp; // 残HPを持ち越す
    if (run.index >= run.queue.length - 1) {
      run.phase = 'win';
    } else {
      run.phase = 'reward';
      run.rewards = drawChoices(run.rng, run.loadout);
    }
  }
}

/** reward フェーズで強化を選んで次の敵へ。 */
export function chooseReward(run: Run, i: number): void {
  if (run.phase !== 'reward') return;
  const up = run.rewards[i];
  if (!up) return;
  up.apply(run.loadout);
  run.index += 1;
  run.world = buildEncounter(run.loadout, run.queue[run.index], (run.seed + run.index * 7919) >>> 0);
  run.rewards = [];
  run.phase = 'fighting';
}
