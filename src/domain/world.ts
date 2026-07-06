import { circlesOverlap, clamp, type Rect, type Vec2 } from './math';
import type { Bullet, Enemy, EntityId, Ship, ShipInput } from './entities';
import { oneWay, type Pattern } from './pattern';
import type { CollisionEvent } from './collision';
import { makeRng, type Rng } from './rng';

/** 場（Field）。決定論的に時間を進める箱。 */
export interface World {
  time: number;
  rng: Rng;
  bounds: Rect;
  ship: Ship;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyPattern: Pattern | null; // 敵弾パターン
  emitterPos: Vec2; // 敵弾の発生源（上部中央固定）。敵の有無に依らず雨を降らせる
  firingEnabled: boolean;
  dodged: number; // 画面外に消えた敵弾の数（＝スコア）
  nextId: EntityId;
}

const CULL_MARGIN = 32;

export interface WorldInit {
  bounds: Rect;
  seed: number;
  ship: Ship;
  enemies?: Enemy[];
}

export function makeWorld(init: WorldInit): World {
  return {
    time: 0,
    rng: makeRng(init.seed),
    bounds: init.bounds,
    ship: init.ship,
    enemies: init.enemies ?? [],
    bullets: [],
    enemyPattern: null,
    emitterPos: { x: init.bounds.x + init.bounds.w / 2, y: init.bounds.y + 8 },
    firingEnabled: true,
    dodged: 0,
    nextId: 1,
  };
}

/**
 * 1 ステップ進める。world を破壊的に更新し、その間に起きた衝突イベントを返す。
 * 乱数はシード付き rng のみ・dt は固定で渡す前提なので、決定論を保つ。
 * 「良い当たり/悪い当たり」の判断はここでは一切しない（Objective の仕事）。
 */
export function step(world: World, input: ShipInput, dt: number): CollisionEvent[] {
  moveShip(world, input, dt);
  moveEnemies(world, dt);
  fireWeapon(world, input, dt);
  emitBullets(world, dt);
  moveBullets(world, dt);
  cullBullets(world);
  return detectCollisions(world);
}

const ENEMY_MARGIN = 24;

/** 敵の移動。横方向は壁で反射し、画面内を往復する（③の動く標的）。 */
function moveEnemies(world: World, dt: number): void {
  const { bounds } = world;
  const lo = bounds.x + ENEMY_MARGIN;
  const hi = bounds.x + bounds.w - ENEMY_MARGIN;
  for (const e of world.enemies) {
    e.pos = { x: e.pos.x + e.vel.x * dt, y: e.pos.y + e.vel.y * dt };
    if (e.pos.x < lo) {
      e.pos.x = lo;
      e.vel.x = Math.abs(e.vel.x);
    } else if (e.pos.x > hi) {
      e.pos.x = hi;
      e.vel.x = -Math.abs(e.vel.x);
    }
  }
}

function moveShip(world: World, input: ShipInput, dt: number): void {
  const { ship, bounds } = world;

  // タッチ/ドラッグ：指の位置（場座標）へ直接追従。東方スマホ移植と同じ操作感。
  if (input.target) {
    ship.pos = {
      x: clamp(input.target.x, bounds.x, bounds.x + bounds.w),
      y: clamp(input.target.y, bounds.y, bounds.y + bounds.h),
    };
    ship.vel = { x: 0, y: 0 };
    return;
  }

  let dx = input.moveX;
  let dy = input.moveY;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  ship.vel = { x: dx * ship.speed, y: dy * ship.speed };
  ship.pos = {
    x: clamp(ship.pos.x + ship.vel.x * dt, bounds.x, bounds.x + bounds.w),
    y: clamp(ship.pos.y + ship.vel.y * dt, bounds.y, bounds.y + bounds.h),
  };
}

/** 自機の発射。武器パターン(weapon)で player 陣営の弾を撒く。④では偶数弾など制御可能な型を使う。 */
function fireWeapon(world: World, input: ShipInput, dt: number): void {
  const ship = world.ship;
  if (world.time < ship.respawnUntil) return; // 復帰スライド中は撃たない
  if (!(ship.autoFire || input.fire)) return;
  const spawns = ship.weapon.emit(world.time, dt, ship.pos, world.rng);
  for (const s of spawns) {
    world.bullets.push({
      id: world.nextId++,
      pos: { x: s.pos.x, y: s.pos.y },
      vel: { x: s.vel.x, y: s.vel.y },
      radius: s.radius,
      owner: 'player',
    });
  }
}

function emitFrom(world: World, pattern: Pattern, pos: { x: number; y: number }, dt: number): void {
  const spawns = pattern.emit(world.time, dt, pos, world.rng);
  for (const s of spawns) {
    world.bullets.push({
      id: world.nextId++,
      pos: { x: s.pos.x, y: s.pos.y },
      vel: { x: s.vel.x, y: s.vel.y },
      radius: s.radius,
      owner: 'enemy',
    });
  }
}

function emitBullets(world: World, dt: number): void {
  if (world.firingEnabled) {
    // 固定エミッタ（レガシー用）＋ 各敵が自分の位置から発射
    if (world.enemyPattern) emitFrom(world, world.enemyPattern, world.emitterPos, dt);
    for (const e of world.enemies) if (e.pattern) emitFrom(world, e.pattern, e.pos, dt);
  }
  world.time += dt;
}

function moveBullets(world: World, dt: number): void {
  for (const b of world.bullets) {
    b.pos = { x: b.pos.x + b.vel.x * dt, y: b.pos.y + b.vel.y * dt };
  }
}

function cullBullets(world: World): void {
  const { bounds } = world;
  const survivors: Bullet[] = [];
  for (const b of world.bullets) {
    const inside =
      b.pos.x >= bounds.x - CULL_MARGIN &&
      b.pos.x <= bounds.x + bounds.w + CULL_MARGIN &&
      b.pos.y >= bounds.y - CULL_MARGIN &&
      b.pos.y <= bounds.y + bounds.h + CULL_MARGIN;
    if (inside) survivors.push(b);
    else if (b.owner === 'enemy') world.dodged += 1; // 画面外に消えた敵弾＝避けた
  }
  world.bullets = survivors;
}

function detectCollisions(world: World): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const survivors: Bullet[] = [];
  const shipInvuln = world.time < world.ship.invulnUntil; // 点滅中は当たり判定を無効化
  for (const b of world.bullets) {
    if (b.owner === 'enemy') {
      if (!shipInvuln && circlesOverlap(b.pos, b.radius, world.ship.pos, world.ship.hitRadius)) {
        events.push({ kind: 'bullet-hits-ship', bullet: b.id, owner: 'enemy' });
        continue; // 当たった弾は消す（同じ弾で連続失点しない）
      }
    } else {
      const enemy = world.enemies.find((e) => circlesOverlap(b.pos, b.radius, e.pos, e.hitRadius));
      if (enemy) {
        events.push({ kind: 'bullet-hits-enemy', bullet: b.id, enemy: enemy.id, owner: 'player' });
        continue;
      }
    }
    survivors.push(b);
  }
  world.bullets = survivors;
  return events;
}

/** 自機の初期位置（下中央）。被弾時の復帰先にも使う。 */
export function shipSpawn(bounds: Rect): Vec2 {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.8 };
}

export function defaultShip(bounds: Rect): Ship {
  return {
    pos: shipSpawn(bounds),
    vel: { x: 0, y: 0 },
    hitRadius: 3,
    speed: 240,
    autoFire: true,
    weapon: oneWay({ speed: 560, radius: 4, interval: 0.08, angle: -Math.PI / 2 }), // 上向き直線ショット
    hp: 6,
    maxHp: 6,
    invulnUntil: 0,
    respawnUntil: 0,
    deathPos: { x: 0, y: 0 },
  };
}

export function defaultEnemy(id: EntityId, bounds: Rect): Enemy {
  return {
    id,
    pos: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.18 },
    vel: { x: 0, y: 0 },
    hitRadius: 16,
    hp: 100,
    maxHp: 100,
    pattern: null,
  };
}
