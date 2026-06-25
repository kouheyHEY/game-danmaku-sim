import { makeWorld, defaultShip, shipSpawn, step, type World } from '../domain/world';
import type { Enemy, ShipInput } from '../domain/entities';
import { makeRng, type Rng } from '../domain/rng';
import { FIELD } from '../spec/stage0';
import { startingLoadout, type PlayerLoadout } from './loadout';
import { buildWeapon } from './weapon';
import { enemyQueue, type EnemySpec } from './enemies';
import { drawChoices, type Upgrade } from './upgrades';

const IFRAME = 0.7; // 被弾後の無敵 [s]

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
export function stepRun(run: Run, input: ShipInput, dt: number): void {
  if (run.phase !== 'fighting') return;
  const w = run.world;
  const ship = w.ship;
  // 点滅(無敵)中は操作を受け付けず初期位置で待機する（＝復帰の演出）。
  const invuln = w.time < ship.invulnUntil;
  const used: ShipInput = invuln ? { moveX: 0, moveY: 0 } : input;
  const events = step(w, used, dt);
  for (const ev of events) {
    if (ev.kind === 'bullet-hits-enemy' && ev.owner === 'player') {
      const e = w.enemies.find((x) => x.id === ev.enemy);
      if (e) e.hp -= run.loadout.weapon.damage;
    } else if (ev.kind === 'bullet-hits-ship' && ev.owner === 'enemy') {
      if (w.time >= ship.invulnUntil) {
        ship.hp -= 1;
        ship.invulnUntil = w.time + IFRAME;
        ship.pos = shipSpawn(w.bounds); // 被弾したら初期位置へ戻す
        ship.vel = { x: 0, y: 0 };
      }
    }
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
