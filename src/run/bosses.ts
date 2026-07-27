import type { Bullet, Enemy, ShipInput } from '../domain/entities';
import { clamp, type Rect, type Vec2 } from '../domain/math';
import { fan, type Pattern } from '../domain/pattern';
import type { World } from '../domain/world';
import type { Rng } from '../domain/rng';
import { makeBoss } from './content';
import type { PlayerLoadout } from './loadout';
import { buildWeapon, buildWeaponAtAngle, type WeaponSpec } from './weapon';

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

export const BOSS_ORDER = ['reversa', 'sniper', 'shogun', 'tank', 'priest'] as const;
export type FeatureBossKind = typeof BOSS_ORDER[number];
export type BossKind = 'normal' | FeatureBossKind;
export type ReversaMode = 'swap' | 'regen' | 'invert';

interface BossBase {
  kind: BossKind;
  primaryId: number;
  enemyIds: number[];
  strong: boolean;
  notice: string | null;
}

export interface NormalBoss extends BossBase {
  kind: 'normal';
}

export interface ReversaBoss extends BossBase {
  kind: 'reversa';
  mode: ReversaMode | null;
  lastMode: ReversaMode | null;
  nextEventAt: number;
  activeUntil: number;
  transitionUntil: number;
  pendingMode: ReversaMode | null;
  controlEpoch: number;
  hitThisStep: boolean;
  normalPattern: Pattern;
  reversePattern: Pattern;
}

export interface SniperBoss extends BossBase {
  kind: 'sniper';
  shooters: Array<{ id: number; nextShotAt: number; vulnerableUntil: number }>;
}

export interface ShogunBoss extends BossBase {
  kind: 'shogun';
  wallId: number;
  sideNextAt: number;
  sideFromLeft: boolean;
  wallNextAt: number;
  attackNextAt: number;
  waveIndex: number;
  waveNextAt: number;
}

export interface TankBoss extends BossBase {
  kind: 'tank';
  stage: number;
  nextShotAt: number;
  rebound: boolean;
  recoverUntil: number;
}

export interface PriestBoss extends BossBase {
  kind: 'priest';
  mode: 'chase' | 'orb' | 'duel';
  switchAt: number;
  nextShotAt: number;
  nextCheckAt: number;
  copiedPattern: Pattern | null;
}

export type BossEncounter = NormalBoss | ReversaBoss | SniperBoss | ShogunBoss | TankBoss | PriestBoss;

export interface BossSpawn {
  encounter: BossEncounter;
  enemies: Enemy[];
}

export const BOSS_NAMES: Record<BossKind, string> = {
  normal: 'ボス',
  reversa: 'リバーサ',
  sniper: 'スナイパー',
  shogun: 'ショウグン',
  tank: 'タンク',
  priest: 'プリースト',
};

function bossHp(level: number, strong: boolean): number {
  const base = 60 + level * 45;
  return Math.round(base * (strong ? 1.75 : 1));
}

function enemy(
  id: number,
  pos: Vec2,
  hp: number,
  hitRadius: number,
  role: Enemy['role'] = 'boss',
): Enemy {
  return {
    id,
    pos,
    vel: { x: 0, y: 0 },
    hitRadius,
    hp,
    maxHp: hp,
    pattern: null,
    role,
    visible: true,
    targetable: true,
  };
}

export function bossKindForLevel(level: number): BossKind {
  const bossNumber = level + 1;
  if (bossNumber % 3 !== 0) return 'normal';
  const featureIndex = bossNumber / 3 - 1;
  return BOSS_ORDER[featureIndex % BOSS_ORDER.length];
}

export function makeBossEncounter(
  kind: BossKind,
  level: number,
  bounds: Rect,
  rng: Rng,
  strong: boolean,
  now: number,
  allocateId: () => number,
): BossSpawn {
  const hp = bossHp(level, strong);
  const cx = bounds.x + bounds.w / 2;
  const top = bounds.y + bounds.h * 0.16;
  const primaryId = allocateId();
  const base: BossBase = { kind, primaryId, enemyIds: [primaryId], strong, notice: null };

  if (kind === 'normal') {
    const normal = makeBoss(primaryId, level, bounds, rng);
    normal.role = 'boss';
    normal.visible = true;
    normal.targetable = true;
    return { enemies: [normal], encounter: { ...base, kind } };
  }

  if (kind === 'reversa') {
    const e = enemy(primaryId, { x: cx, y: top }, hp, strong ? 28 : 23);
    e.vel.x = 68 + level * 5;
    const normalPattern = fan({ ways: 9, spread: 0.22, speed: 125 + level * 5, radius: 6, interval: 0.28, baseAngle: DOWN });
    const reversePattern = fan({ ways: 9, spread: 0.22, speed: 125 + level * 5, radius: 6, interval: 0.28, baseAngle: UP });
    e.pattern = normalPattern;
    return {
      enemies: [e],
      encounter: {
        ...base, kind, mode: null, lastMode: null, nextEventAt: now + 2.5, activeUntil: 0,
        transitionUntil: 0, pendingMode: null, controlEpoch: 0,
        hitThisStep: false, normalPattern, reversePattern,
      },
    };
  }

  if (kind === 'sniper') {
    const eachHp = Math.max(1, Math.ceil(hp / 3));
    const enemies: Enemy[] = [];
    const shooters: SniperBoss['shooters'] = [];
    for (let i = 0; i < 3; i++) {
      const id = i === 0 ? primaryId : allocateId();
      const e = enemy(id, { x: bounds.x + bounds.w * (0.25 + i * 0.25), y: top }, eachHp, 17, 'sniper');
      e.visible = false;
      e.targetable = false;
      enemies.push(e);
      shooters.push({ id, nextShotAt: now + 1.2 + i * 0.55, vulnerableUntil: 0 });
      if (i > 0) base.enemyIds.push(id);
    }
    return { enemies, encounter: { ...base, kind, shooters } };
  }

  if (kind === 'shogun') {
    const boss = enemy(primaryId, { x: cx, y: top }, hp, strong ? 29 : 25);
    boss.targetable = false;
    boss.vel.x = 42;
    const wallId = allocateId();
    const wallHp = Math.round(hp * 0.48);
    const wall = enemy(wallId, { x: cx, y: bounds.y + bounds.h * 0.28 }, wallHp, 34, 'guard');
    base.enemyIds.push(wallId);
    return {
      enemies: [boss, wall],
      encounter: {
        ...base, kind, wallId, sideNextAt: now + 0.8, sideFromLeft: true, wallNextAt: now + 1.4,
        attackNextAt: now + 1.2, waveIndex: 0, waveNextAt: 0,
      },
    };
  }

  if (kind === 'tank') {
    const tankHp = Math.round(hp * 2.35);
    const e = enemy(primaryId, { x: cx, y: top }, tankHp, strong ? 34 : 30);
    e.vel.x = 30;
    return { enemies: [e], encounter: { ...base, kind, stage: 0, nextShotAt: now + 1, rebound: false, recoverUntil: 0 } };
  }

  const priest = enemy(primaryId, { x: cx, y: top }, Math.round(hp * 1.25), strong ? 30 : 25);
  return {
    enemies: [priest],
    encounter: {
      ...base, kind: 'priest', mode: 'chase', switchAt: now + 6, nextShotAt: now + 0.8,
      nextCheckAt: now + 0.8, copiedPattern: null,
    },
  };
}

function getEnemy(world: World, id: number): Enemy | undefined {
  return world.enemies.find((e) => e.id === id);
}

function clearEnemyBullets(world: World): void {
  world.bullets = world.bullets.filter((b) => b.owner !== 'enemy');
}

function clearAllBullets(world: World): void {
  world.bullets = [];
}

function pushBullet(world: World, source: Vec2, angle: number, speed: number, radius: number, style: Bullet['style'] = 'normal', extra: Partial<Bullet> = {}): void {
  world.bullets.push({
    id: world.nextId++,
    pos: { x: source.x, y: source.y },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    radius,
    owner: 'enemy',
    style,
    ...extra,
  });
}

function pushAimed(world: World, source: Vec2, speed: number, radius: number, ways = 1, spread = 0, style: Bullet['style'] = 'normal', extra: Partial<Bullet> = {}): void {
  const base = Math.atan2(world.ship.pos.y - source.y, world.ship.pos.x - source.x);
  for (let i = 0; i < ways; i++) {
    const angle = base + (i - (ways - 1) / 2) * spread;
    pushBullet(world, source, angle, speed, radius, style, extra);
  }
}

function activateReversa(runtime: ReversaBoss, world: World, loadout: PlayerLoadout, forced?: ReversaMode): void {
  const modes: ReversaMode[] = ['swap', 'regen', 'invert'].filter((m) => m !== runtime.lastMode) as ReversaMode[];
  const mode = forced ?? modes[Math.floor(world.rng.next() * modes.length)];
  runtime.mode = mode;
  runtime.lastMode = mode;
  runtime.pendingMode = null;
  runtime.transitionUntil = 0;
  runtime.activeUntil = world.time + 6;
  world.firingEnabled = true;
  const boss = getEnemy(world, runtime.primaryId);
  if (mode === 'swap') {
    world.ship.pos = { x: world.bounds.x + world.bounds.w / 2, y: world.bounds.y + world.bounds.h * 0.18 };
    world.ship.weapon = buildWeaponAtAngle(loadout.weapon, DOWN);
    if (boss) {
      boss.pos.y = world.bounds.y + world.bounds.h * 0.82;
      boss.pattern = runtime.reversePattern;
    }
    runtime.controlEpoch += 1;
    runtime.notice = '上下反転';
  } else if (mode === 'regen') {
    runtime.notice = '攻撃で回復・未攻撃でダメージ';
  } else {
    runtime.notice = '操作反転';
  }
}

function beginReversaTransition(runtime: ReversaBoss, world: World, loadout: PlayerLoadout, forced?: ReversaMode): void {
  const modes: ReversaMode[] = ['swap', 'regen', 'invert'].filter((m) => m !== runtime.lastMode) as ReversaMode[];
  runtime.mode = null;
  runtime.pendingMode = forced ?? modes[Math.floor(world.rng.next() * modes.length)];
  runtime.transitionUntil = world.time + 2;
  runtime.nextEventAt = Number.POSITIVE_INFINITY;
  clearAllBullets(world);
  world.firingEnabled = false;
  world.ship.pos = { x: world.bounds.x + world.bounds.w / 2, y: world.bounds.y + world.bounds.h * 0.8 };
  world.ship.weapon = buildWeapon(loadout.weapon);
  const boss = getEnemy(world, runtime.primaryId);
  if (boss) {
    boss.pos.y = world.bounds.y + world.bounds.h * 0.16;
    boss.pattern = runtime.normalPattern;
  }
  runtime.controlEpoch += 1;
  runtime.notice = '転換準備・弾幕停止';
}

function reverseInput(input: ShipInput, ship: Vec2): ShipInput {
  if (input.target) {
    return { ...input, target: { x: ship.x * 2 - input.target.x, y: ship.y * 2 - input.target.y } };
  }
  return { ...input, moveX: -input.moveX, moveY: -input.moveY };
}

function stepReversa(runtime: ReversaBoss, world: World, loadout: PlayerLoadout, input: ShipInput): ShipInput {
  runtime.hitThisStep = false;
  if (runtime.transitionUntil > 0) {
    world.firingEnabled = false;
    if (world.time >= runtime.transitionUntil && runtime.pendingMode) {
      activateReversa(runtime, world, loadout, runtime.pendingMode);
      return { moveX: 0, moveY: 0 };
    }
    return input;
  }
  if (runtime.mode && world.time >= runtime.activeUntil) {
    beginReversaTransition(runtime, world, loadout);
    return { moveX: 0, moveY: 0 };
  }
  if (!runtime.mode && world.time >= runtime.nextEventAt) {
    beginReversaTransition(runtime, world, loadout);
    return { moveX: 0, moveY: 0 };
  }
  if (runtime.mode === 'invert') return reverseInput(input, world.ship.pos);
  return input;
}

function stepSniper(runtime: SniperBoss, world: World, level: number): void {
  for (const shooter of runtime.shooters) {
    const e = getEnemy(world, shooter.id);
    if (!e) continue;
    while (world.time >= shooter.nextShotAt) {
      pushAimed(world, e.pos, 520 + level * 12, 5, 1, 0, 'sniper');
      shooter.vulnerableUntil = world.time + 1.7;
      shooter.nextShotAt += 3.1;
    }
    const exposed = world.time < shooter.vulnerableUntil;
    e.visible = exposed;
    e.targetable = exposed;
  }
}

function stepShogun(runtime: ShogunBoss, world: World, level: number): void {
  const boss = getEnemy(world, runtime.primaryId);
  if (!boss) return;
  const wall = getEnemy(world, runtime.wallId);
  boss.targetable = !wall;

  while (world.time >= runtime.sideNextAt) {
    const y = world.bounds.y + world.bounds.h * (0.16 + world.rng.next() * 0.64);
    const fromLeft = runtime.sideFromLeft;
    const source = { x: fromLeft ? world.bounds.x + 3 : world.bounds.x + world.bounds.w - 3, y };
    pushBullet(world, source, fromLeft ? 0 : Math.PI, 105 + level * 3, 6, 'side');
    runtime.sideFromLeft = !fromLeft;
    runtime.sideNextAt += 1.05;
  }

  if (wall) {
    wall.pos.x = boss.pos.x;
    while (world.time >= runtime.wallNextAt) {
      pushAimed(world, wall.pos, 145 + level * 4, 7, 1, 0, 'normal');
      runtime.wallNextAt += 2.15;
    }
    return;
  }

  if (runtime.waveIndex > 0 && runtime.waveIndex <= 19 && world.time >= runtime.waveNextAt) {
    while (runtime.waveIndex <= 19 && world.time >= runtime.waveNextAt) {
      const i = runtime.waveIndex - 1;
      const base = Math.atan2(world.ship.pos.y - boss.pos.y, world.ship.pos.x - boss.pos.x);
      const arc = -0.82 + (i / 18) * 1.64;
      const source = { x: boss.pos.x + Math.cos(base + arc) * 18, y: boss.pos.y + Math.sin(base + arc) * 18 };
      pushBullet(world, source, base + arc, 195 + level * 4, 7, 'wave');
      runtime.waveIndex += 1;
      runtime.waveNextAt += 0.035;
    }
    if (runtime.waveIndex > 19) runtime.waveIndex = 0;
  }

  if (runtime.waveIndex === 0 && world.time >= runtime.attackNextAt) {
    if (world.ship.pos.y > world.bounds.y + world.bounds.h / 2) {
      pushAimed(world, boss.pos, 175 + level * 5, 6, 3, 0.18, 'normal');
      runtime.attackNextAt = world.time + 1.2;
    } else {
      runtime.waveIndex = 1;
      runtime.waveNextAt = world.time;
      runtime.attackNextAt = world.time + 2.7;
      runtime.notice = '刀波';
    }
  }
}

function stepTank(runtime: TankBoss, world: World, level: number): void {
  const boss = getEnemy(world, runtime.primaryId);
  if (!boss) return;
  const nextStage = Math.min(4, Math.floor((1 - boss.hp / boss.maxHp) * 5 + 1e-6));
  while (runtime.stage < nextStage) {
    runtime.stage += 1;
    if (runtime.stage === 3) {
      runtime.rebound = true;
      runtime.notice = '低速跳弾';
    } else if (runtime.rebound) {
      runtime.rebound = false;
      runtime.recoverUntil = world.time + 3;
      runtime.notice = '弾速復元中';
    } else {
      runtime.notice = `装甲段階 ${runtime.stage}`;
    }
  }

  const normalSpeed = (105 + level * 5) * (1 + runtime.stage * 0.08);
  const normalRadius = 5 + runtime.stage * 0.65;
  let speed = normalSpeed;
  let radius = normalRadius;
  let bouncing = false;
  if (runtime.rebound) {
    speed = 42;
    radius = 3;
    bouncing = true;
  } else if (world.time < runtime.recoverUntil) {
    const p = clamp(1 - (runtime.recoverUntil - world.time) / 3, 0, 1);
    speed = 42 + (normalSpeed - 42) * p;
    radius = 3 + (normalRadius - 3) * p;
  }
  const densitySteps = Math.floor(runtime.stage / 2);
  const interval = Math.max(0.26, 0.62 - densitySteps * 0.12);
  while (world.time >= runtime.nextShotAt) {
    pushAimed(
      world,
      boss.pos,
      speed,
      radius,
      densitySteps > 0 ? 3 : 1,
      0.2,
      'tank',
      bouncing ? { bouncesRemaining: 1 } : {},
    );
    runtime.nextShotAt += interval;
  }
}

function cappedCopy(spec: WeaponSpec): WeaponSpec {
  return {
    kind: spec.kind,
    ways: Math.min(7, Math.max(1, spec.ways)),
    spread: Math.min(0.2, Math.max(0.06, spec.spread)),
    speed: Math.min(340, spec.speed),
    radius: Math.min(7, spec.radius),
    interval: Math.max(0.085, spec.interval),
    damage: 1,
  };
}

function activatePriestDuel(runtime: PriestBoss, world: World, loadout: PlayerLoadout): void {
  runtime.mode = 'duel';
  runtime.copiedPattern = buildWeaponAtAngle(cappedCopy(loadout.weapon), DOWN);
  clearEnemyBullets(world);
  runtime.notice = '弾幕模倣・決闘';
}

export function forceReversaMode(runtime: ReversaBoss, world: World, loadout: PlayerLoadout, mode: ReversaMode): void {
  beginReversaTransition(runtime, world, loadout, mode);
}

export function forcePriestMode(runtime: PriestBoss, world: World, loadout: PlayerLoadout, mode: 'chase' | 'orb' | 'duel'): void {
  if (mode === 'duel') {
    const boss = getEnemy(world, runtime.primaryId);
    if (boss) boss.hp = Math.min(boss.hp, boss.maxHp * 0.25);
    activatePriestDuel(runtime, world, loadout);
    return;
  }
  runtime.mode = mode;
  runtime.switchAt = world.time + 6;
  runtime.nextShotAt = world.time;
  runtime.nextCheckAt = world.time;
  runtime.notice = mode === 'chase' ? '追跡祈祷' : '加速する祈り';
}

function stepPriest(runtime: PriestBoss, world: World, loadout: PlayerLoadout, dt: number, level: number): void {
  const boss = getEnemy(world, runtime.primaryId);
  if (!boss) return;
  if (runtime.mode !== 'duel' && boss.hp <= boss.maxHp * 0.25) activatePriestDuel(runtime, world, loadout);

  if (runtime.mode === 'duel') {
    const danger = world.bullets.filter((b) => b.owner === 'player' && Math.hypot(b.pos.x - boss.pos.x, b.pos.y - boss.pos.y) < 190);
    let vx = (world.bounds.x + world.bounds.w / 2 - boss.pos.x) * 0.2;
    let vy = (world.bounds.y + world.bounds.h * 0.2 - boss.pos.y) * 0.2;
    for (const bullet of danger) {
      const dx = boss.pos.x - bullet.pos.x;
      const dy = boss.pos.y - bullet.pos.y;
      const d2 = Math.max(100, dx * dx + dy * dy);
      vx += (dx / d2) * 9000;
      vy += (dy / d2) * 9000;
    }
    const len = Math.max(1, Math.hypot(vx, vy));
    boss.vel = { x: (vx / len) * 92, y: (vy / len) * 92 };
    boss.pos.y = clamp(boss.pos.y, world.bounds.y + 50, world.bounds.y + world.bounds.h * 0.44);
    const spawns = runtime.copiedPattern?.emit(world.time, dt, boss.pos, world.rng, world.ship.pos) ?? [];
    for (const spawn of spawns) pushBullet(world, spawn.pos, Math.atan2(spawn.vel.y, spawn.vel.x), Math.hypot(spawn.vel.x, spawn.vel.y), spawn.radius);
    return;
  }

  if (world.time >= runtime.switchAt) {
    runtime.mode = runtime.mode === 'chase' ? 'orb' : 'chase';
    runtime.switchAt = world.time + 6;
    if (runtime.mode === 'chase') runtime.nextShotAt = world.time;
    else runtime.nextCheckAt = world.time;
    runtime.notice = runtime.mode === 'chase' ? '追跡祈祷' : '加速する祈り';
  }

  if (runtime.mode === 'chase') {
    const dx = world.ship.pos.x - boss.pos.x;
    const dy = world.ship.pos.y - boss.pos.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    boss.vel = { x: (dx / len) * 34, y: (dy / len) * 34 };
    while (world.time >= runtime.nextShotAt) {
      pushAimed(world, boss.pos, 72 + level * 2, 6, 1, 0, 'normal');
      runtime.nextShotAt += 0.48;
    }
  } else {
    boss.vel = { x: 26, y: 0 };
    while (world.time >= runtime.nextCheckAt) {
      const count = world.bullets.filter((b) => b.owner === 'enemy').length;
      if (count <= 18) {
        pushAimed(world, boss.pos, 68, 10, 1, 0, 'orb', {
          bouncesRemaining: 99,
          bounceSpeedUp: 1.22,
          maxBounceSpeed: 260,
        });
      }
      runtime.nextCheckAt += 0.75;
    }
  }
}

export function prepareBossStep(runtime: BossEncounter, world: World, loadout: PlayerLoadout, input: ShipInput, dt: number, level: number): ShipInput {
  if (runtime.kind === 'normal') return input;
  if (runtime.kind === 'reversa') return stepReversa(runtime, world, loadout, input);
  if (runtime.kind === 'sniper') stepSniper(runtime, world, level);
  else if (runtime.kind === 'shogun') stepShogun(runtime, world, level);
  else if (runtime.kind === 'tank') stepTank(runtime, world, level);
  else if (runtime.kind === 'priest') stepPriest(runtime, world, loadout, dt, level);
  return input;
}

export function applyBossHit(runtime: BossEncounter, world: World, enemyId: number, damage: number): void {
  const target = getEnemy(world, enemyId);
  if (!target) return;
  if (runtime.kind === 'reversa' && runtime.mode === 'regen' && enemyId === runtime.primaryId) {
    target.hp = Math.min(target.maxHp, target.hp + damage);
    runtime.hitThisStep = true;
    return;
  }
  const multiplier = runtime.kind === 'priest' && runtime.mode === 'duel' && enemyId === runtime.primaryId ? 0.5 : 1;
  target.hp -= damage * multiplier;
}

export function finishBossStep(runtime: BossEncounter, world: World, loadout: PlayerLoadout, dt: number): void {
  if (runtime.kind === 'reversa' && runtime.mode === 'regen' && !runtime.hitThisStep) {
    const boss = getEnemy(world, runtime.primaryId);
    if (boss) boss.hp -= 11 * dt;
  }
  if (runtime.kind === 'reversa' && runtime.mode !== 'swap') world.ship.weapon = buildWeapon(loadout.weapon);
}

export function bossDefeated(runtime: BossEncounter, world: World): boolean {
  if (runtime.kind === 'sniper') return runtime.enemyIds.every((id) => !getEnemy(world, id));
  return !getEnemy(world, runtime.primaryId);
}

export function cleanupBoss(runtime: BossEncounter, world: World, loadout: PlayerLoadout): void {
  if (runtime.kind === 'reversa') world.ship.weapon = buildWeapon(loadout.weapon);
  world.firingEnabled = true;
  world.ship.pos.y = clamp(world.ship.pos.y, world.bounds.y, world.bounds.y + world.bounds.h);
}

export function takeBossNotice(runtime: BossEncounter): string | null {
  const notice = runtime.notice;
  runtime.notice = null;
  return notice;
}

export function bossStatus(runtime: BossEncounter, world: World): string {
  if (runtime.kind === 'normal') return '通常弾幕';
  if (runtime.kind === 'reversa') {
    if (runtime.transitionUntil > 0) return '転換準備・弾幕停止';
    const labels: Record<ReversaMode, string> = { swap: '上下反転', regen: '攻撃反転', invert: '操作反転' };
    return runtime.mode ? labels[runtime.mode] : '待機';
  }
  if (runtime.kind === 'sniper') {
    const exposed = runtime.shooters.filter((s) => world.time < s.vulnerableUntil && !!getEnemy(world, s.id)).length;
    return `露出 ${exposed}/${runtime.shooters.filter((s) => !!getEnemy(world, s.id)).length}`;
  }
  if (runtime.kind === 'shogun') return getEnemy(world, runtime.wallId) ? '壁を破壊せよ' : '本体露出';
  if (runtime.kind === 'tank') return `装甲段階 ${runtime.stage}${runtime.rebound ? '・跳弾' : ''}`;
  return runtime.mode === 'chase' ? '追跡祈祷' : runtime.mode === 'orb' ? '加速する祈り' : '決闘';
}

export function forceBossEvent(runtime: BossEncounter, world: World): void {
  if (runtime.kind === 'normal') return;
  if (runtime.kind === 'reversa') {
    if (runtime.mode) runtime.activeUntil = world.time;
    else runtime.nextEventAt = world.time;
  } else if (runtime.kind === 'sniper') {
    for (const shooter of runtime.shooters) shooter.nextShotAt = world.time;
  } else if (runtime.kind === 'shogun') {
    const wall = getEnemy(world, runtime.wallId);
    if (wall) wall.hp = 0;
    else runtime.attackNextAt = world.time;
  } else if (runtime.kind === 'tank') {
    const boss = getEnemy(world, runtime.primaryId);
    if (boss) boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.21);
  } else if (runtime.kind === 'priest') {
    if (runtime.mode === 'duel') return;
    runtime.mode = runtime.mode === 'chase' ? 'orb' : 'chase';
    runtime.switchAt = world.time + 6;
    runtime.notice = runtime.mode === 'chase' ? '追跡祈祷' : '加速する祈り';
  }
}
