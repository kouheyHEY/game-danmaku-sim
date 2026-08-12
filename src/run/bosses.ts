/**
 * 通常ボスと特徴ボスの生成・段階遷移・専用攻撃を管理する。
 */
import type { Bullet, Enemy, EnemyHitbox, ShipInput } from "../domain/entities";
import { clamp, type Rect, type Vec2 } from "../domain/math";
import type { World } from "../domain/world";
import type { Rng } from "../domain/rng";
import { makeBoss, makeStrongBoss } from "./content";
import type { PlayerLoadout } from "./loadout";
import {
    FEATURE_BOSS_TEXTURE_DISPLAY_SIZE,
    PRIEST_HIT_RADIUS,
} from "../spec/entityVisuals";

const REVERSA_INTERVAL = 0.52;
const REVERSA_WAYS = 5;
const REVERSA_TURN_DURATION = 1.4;
const REVERSA_INCOMING_DELAY = REVERSA_TURN_DURATION + 0.12;
const REVERSA_INCOMING_INTERVAL = 0.18;
const PRIEST_HP_MULTIPLIER = 4.2;
const PRIEST_ORB_HP_RATIO = 0.65;
const PRIEST_DUEL_HP_RATIO = 0.25;
const PRIEST_RADIAL_WAYS = 36;
const PRIEST_RADIAL_INTERVAL = 0.8;
const PRIEST_CHASE_SPEED = 54;
const PRIEST_REFLECT_TARGET_Y_RATIO = 0.18;
const PRIEST_REFLECT_MOVE_SPEED = 112;
const PRIEST_REFLECT_DRIFT_SPEED = 28;
const MUTANT_CHANCE = 0.35;
const MUTANT_START_LEVEL = 5;

/** 強ボスはこの固定順で出現する。プリーストは転生の節目として扱う。 */
export const BOSS_ORDER = [
    "reversa",
    "sniper",
    "shogun",
    "tank",
    "priest",
] as const;
export type FeatureBossKind = (typeof BOSS_ORDER)[number];
export type BossKind = "normal" | FeatureBossKind;

/** アクティブなボス戦が共通して持つ実行時状態。 */
interface BossBase {
    kind: BossKind;
    primaryId: number;
    enemyIds: number[];
    strong: boolean;
    mutant: boolean;
    notice: string | null;
}

export interface NormalBoss extends BossBase {
    kind: "normal";
}

/** リバーサ用の実行時状態。前半はランダム弾、後半は反転弾と流入弾を扱う。 */
export interface ReversaBoss extends BossBase {
    kind: "reversa";
    nextShotAt: number;
    reversing: boolean;
}

/** 3体構成のスナイパーと、各個体の露出時間を管理する実行時状態。 */
export interface SniperBoss extends BossBase {
    kind: "sniper";
    initialCount: number;
    shooters: Array<{
        id: number;
        nextShotAt: number;
        vulnerableUntil: number;
    }>;
}

/** ショウグンの壁、横弾幕、刀波攻撃を管理する実行時状態。 */
export interface ShogunBoss extends BossBase {
    kind: "shogun";
    wallId: number;
    sideNextAt: number;
    wallNextAt: number;
    attackNextAt: number;
    waveIndex: number;
    waveNextAt: number;
    waveMax: number;
    wasPlayerUpper: boolean;
}

/** タンクのHP割合段階と、一時的な跳弾フェーズを管理する実行時状態。 */
export interface TankBoss extends BossBase {
    kind: "tank";
    stage: number;
    nextShotAt: number;
    nextBombAt: number;
    rebound: boolean;
    recoverUntil: number;
}

/** プリーストのHP割合による3段階を管理する実行時状態。 */
export interface PriestBoss extends BossBase {
    kind: "priest";
    mode: "chase" | "orb" | "reflect";
    nextShotAt: number;
    nextCheckAt: number;
    orbAngle: number;
    reflectAnchored: boolean;
}

/** Sessionループで扱う全ボス実行時状態の判別可能Union。 */
export type BossEncounter =
    | NormalBoss
    | ReversaBoss
    | SniperBoss
    | ShogunBoss
    | TankBoss
    | PriestBoss;

export interface BossSpawn {
    encounter: BossEncounter;
    enemies: Enemy[];
}

/** HUD、デバッグパネル、ゲームオーバー表示で共有するボス名。 */
export const BOSS_NAMES: Record<BossKind, string> = {
    normal: "ボス",
    reversa: "リバーサ",
    sniper: "スナイパー",
    shogun: "ショウグン",
    tank: "タンク",
    priest: "プリースト",
};

/** ランのレベルと通常・強敵区分からボスHPを調整する。 */
function bossHp(level: number, strong: boolean): number {
    const cycle = Math.floor(level / BOSS_ORDER.length);
    const base = 100 + level * 70;
    const cycleMultiplier = 1 + cycle * 0.35;
    return Math.round(base * (strong ? 2 : 1) * cycleMultiplier);
}

/** 2周目以降の攻撃インフレ対策として、周回ごとの圧力レベルを強めに補正する。 */
function pressureLevel(level: number): number {
    const cycle = Math.floor(level / BOSS_ORDER.length);
    return level + cycle * 4;
}

/** 2周目以降、プリースト以外の特徴ボスを一定確率で変異種にする。 */
function shouldMutate(kind: BossKind, level: number, rng: Rng): boolean {
    return kind !== "normal" &&
        kind !== "priest" &&
        level >= MUTANT_START_LEVEL &&
        rng.next() < MUTANT_CHANCE;
}

/** 最小構成のEnemyを作る。ボス固有のフラグは呼び出し側で追加する。 */
function enemy(
    id: number,
    pos: Vec2,
    hp: number,
    hitRadius: number,
    role: Enemy["role"] = "boss",
    hitbox?: EnemyHitbox,
): Enemy {
    return {
        id,
        pos,
        vel: { x: 0, y: 0 },
        hitRadius,
        hitbox,
        hp,
        maxHp: hp,
        pattern: null,
        role,
        visible: true,
        targetable: true,
    };
}

/** ボスの見た目サイズを、矩形当たり判定の基準として使う。 */
const texturedBossHitbox = (): EnemyHitbox => ({
    kind: "rect",
    halfWidth: FEATURE_BOSS_TEXTURE_DISPLAY_SIZE / 2,
    halfHeight: FEATURE_BOSS_TEXTURE_DISPLAY_SIZE / 2,
});

/** 0始まりのボスレベルから、出現する特徴ボス種別を返す。 */
export function bossKindForLevel(level: number): BossKind {
    return BOSS_ORDER[level % BOSS_ORDER.length];
}

/**
 * ボスの実行時状態とEnemy配列をまとめて作る。
 *
 * Session進行とボス固有挙動の境界で、ID割り当て・HP・表示状態を初期化する。
 * 時間経過に応じた攻撃や移動は、下の step* 系関数に任せる。
 */
export function makeBossEncounter(
    kind: BossKind,
    level: number,
    bounds: Rect,
    rng: Rng,
    strong: boolean,
    now: number,
    allocateId: () => number,
    forceMutant?: boolean,
): BossSpawn {
    const hp = bossHp(level, strong);
    const cx = bounds.x + bounds.w / 2;
    const top = bounds.y + bounds.h * 0.16;
    const primaryId = allocateId();
    const mutant = forceMutant ?? shouldMutate(kind, level, rng);
    const base: BossBase = {
        kind,
        primaryId,
        enemyIds: [primaryId],
        strong,
        mutant,
        notice: null,
    };

    if (kind === "normal") {
        const normal = makeBoss(primaryId, level, bounds, rng);
        normal.role = "boss";
        normal.visible = true;
        normal.targetable = true;
        return { enemies: [normal], encounter: { ...base, kind } };
    }

    if (kind === "reversa") {
        const e = makeStrongBoss(primaryId, level, bounds, rng);
        e.role = "boss";
        e.hitRadius = strong ? 18 : 16;
        e.hitbox = texturedBossHitbox();
        e.pattern = null;
        e.vel.x = 24;
        return {
            enemies: [e],
            encounter: {
                ...base,
                kind,
                nextShotAt: now + 0.6,
                reversing: false,
            },
        };
    }

    if (kind === "sniper") {
        const count = mutant ? 7 : 3;
        const eachHp = Math.max(1, Math.ceil(hp / count));
        const enemies: Enemy[] = [];
        const shooters: SniperBoss["shooters"] = [];
        for (let i = 0; i < count; i++) {
            const id = i === 0 ? primaryId : allocateId();
            const laneCenter = bounds.x + bounds.w * ((i + 0.5) / count);
            const x = laneCenter + (rng.next() - 0.5) * bounds.w * 0.1;
            const y = top + (rng.next() - 0.5) * bounds.h * 0.12;
            const e = enemy(
                id,
                { x, y },
                eachHp,
                12,
                "sniper",
                texturedBossHitbox(),
            );
            e.visible = false;
            e.targetable = false;
            enemies.push(e);
            shooters.push({
                id,
                nextShotAt: now + 1.2 + i * 0.55,
                vulnerableUntil: 0,
            });
            if (i > 0) base.enemyIds.push(id);
        }
        return { enemies, encounter: { ...base, kind, initialCount: count, shooters } };
    }

    if (kind === "shogun") {
        const bossHp = Math.round(hp * 0.8);
        const boss = enemy(
            primaryId,
            { x: cx, y: top },
            bossHp,
            strong ? 18 : 16,
        );
        boss.hitbox = texturedBossHitbox();
        boss.targetable = false;
        boss.vel.x = 42;
        const wallId = allocateId();
        const wallHp = Math.round(hp * 0.9);
        const wall = enemy(
            wallId,
            { x: cx, y: bounds.y + bounds.h * 0.28 },
            wallHp,
            24,
            "guard",
            { kind: "rect", halfWidth: 32, halfHeight: 11 },
        );
        base.enemyIds.push(wallId);
        return {
            enemies: [boss, wall],
            encounter: {
                ...base,
                kind,
                wallId,
                sideNextAt: now + 0.45,
                wallNextAt: now + 1.4,
                attackNextAt: now + 1.2,
                waveIndex: 0,
                waveNextAt: 0,
                waveMax: 0,
                wasPlayerUpper: false,
            },
        };
    }

    if (kind === "tank") {
        const tankHp = Math.round(hp * 3);
        const e = enemy(primaryId, { x: cx, y: top }, tankHp, strong ? 20 : 18);
        e.hitbox = texturedBossHitbox();
        e.vel.x = 30;
        return {
            enemies: [e],
            encounter: {
                ...base,
                kind,
                stage: 0,
                nextShotAt: now + 1,
                nextBombAt: now + 1.8,
                rebound: false,
                recoverUntil: 0,
            },
        };
    }

    const priest = enemy(
        primaryId,
        { x: cx, y: top },
        Math.round(hp * PRIEST_HP_MULTIPLIER),
        10,
        "boss",
        { kind: "circle", radius: PRIEST_HIT_RADIUS },
    );
    return {
        enemies: [priest],
        encounter: {
            ...base,
            kind: "priest",
            mode: "chase",
            nextShotAt: now + 0.65,
            nextCheckAt: now + 0.65,
            orbAngle: 0,
            reflectAnchored: false,
        },
    };
}

/** 現在生存している敵をIDで探す。 */
function getEnemy(world: World, id: number): Enemy | undefined {
    return world.enemies.find((e) => e.id === id);
}

/** フェーズ切替で圧をリセットしたいときに敵弾を消す。 */
function clearEnemyBullets(world: World): void {
    world.bullets = world.bullets.filter((b) => b.owner !== "enemy");
}

/** 指定位置から角度と速度を指定して敵弾を1発追加する。 */
function pushBullet(
    world: World,
    source: Vec2,
    angle: number,
    speed: number,
    radius: number,
    style: Bullet["style"] = "normal",
    extra: Partial<Bullet> = {},
): void {
    world.bullets.push({
        id: world.nextId++,
        pos: { x: source.x, y: source.y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        radius,
        owner: "enemy",
        style,
        ...extra,
    });
}

/** 現在の自機位置を狙う敵弾を1発または複数発追加する。 */
function pushAimed(
    world: World,
    source: Vec2,
    speed: number,
    radius: number,
    ways = 1,
    spread = 0,
    style: Bullet["style"] = "normal",
    extra: Partial<Bullet> = {},
): void {
    const base = Math.atan2(
        world.ship.pos.y - source.y,
        world.ship.pos.x - source.x,
    );
    for (let i = 0; i < ways; i++) {
        const angle = base + (i - (ways - 1) / 2) * spread;
        pushBullet(world, source, angle, speed, radius, style, extra);
    }
}

/** リバーサ弾の反転補間元になる速度を保存する。 */
function markReversaBulletForTurn(bullet: Bullet, turnAt: number): void {
    bullet.reversaBaseVel = { ...bullet.vel };
    bullet.reversaTurnAt = turnAt;
}

/** HP半分以下でリバーサの第二段階を開始する。 */
function activateReversaTurn(runtime: ReversaBoss, world: World): void {
    if (runtime.reversing) return;
    runtime.reversing = true;
    // 既存弾が完全な逆向き速度へ戻ってから、画面外からの流入弾へ繋ぐ。
    runtime.nextShotAt = world.time + REVERSA_INCOMING_DELAY;
    runtime.notice = "ベクトル反転";
    for (const bullet of world.bullets) {
        if (bullet.owner === "enemy" && bullet.style === "reversa") {
            markReversaBulletForTurn(bullet, world.time);
        }
    }
}

/** 既存のリバーサ弾を、外向き速度から内向き速度へ補間する。 */
function updateReversaVectors(runtime: ReversaBoss, world: World): void {
    const boss = getEnemy(world, runtime.primaryId);
    for (const bullet of world.bullets) {
        if (!bullet.reversaBaseVel || bullet.reversaTurnAt === undefined)
            continue;
        const p = clamp(
            (world.time - bullet.reversaTurnAt) / REVERSA_TURN_DURATION,
            0,
            1,
        );
        const eased = p * p * (3 - 2 * p);
        const factor = 1 - eased * 2;
        bullet.vel = {
            x: bullet.reversaBaseVel.x * factor,
            y: bullet.reversaBaseVel.y * factor,
        };
    }
    if (!boss) return;
    for (const bullet of world.bullets) {
        if (bullet.owner !== "enemy" || bullet.style !== "reversa") continue;
        const toBoss = {
            x: boss.pos.x - bullet.pos.x,
            y: boss.pos.y - bullet.pos.y,
        };
        const movingToBoss =
            toBoss.x * bullet.vel.x + toBoss.y * bullet.vel.y > 0;
        if (
            movingToBoss &&
            Math.hypot(toBoss.x, toBoss.y) <= boss.hitRadius + bullet.radius + 8
        ) {
            bullet.expired = true;
        }
    }
}

/** 第二段階のリバーサ弾を、画面外からボスへ向けて発生させる。 */
function spawnReversaIncoming(world: World, boss: Enemy, level: number, mutant: boolean): void {
    const radius = mutant ? 18 : 5;
    const side = world.rng.next();
    let source: Vec2;
    if (side < 0.5) {
        // 下端発生は、元の「下から敵へ向かって上がる弾」の印象を残す。
        source = {
            x:
                world.bounds.x +
                radius +
                world.rng.next() * (world.bounds.w - radius * 2),
            y: world.bounds.y + world.bounds.h + radius + 8,
        };
    } else {
        // 横発生は、弾がリバーサへ収束する目的を保ったまま攻撃方向を広げる。
        const fromLeft = side < 0.75;
        source = {
            x: fromLeft
                ? world.bounds.x - radius - 8
                : world.bounds.x + world.bounds.w + radius + 8,
            y:
                world.bounds.y +
                radius +
                world.rng.next() * (world.bounds.h - radius * 2),
        };
    }
    const angle = Math.atan2(boss.pos.y - source.y, boss.pos.x - source.x);
    const speed = mutant
        ? 62 + level * 1.2 + world.rng.next() * 24
        : 105 + level * 2.5 + world.rng.next() * 48;
    pushBullet(world, source, angle, speed, radius, "reversa");
}

/** リバーサのランダム弾前半と、反転弾後半を進める。 */
function stepReversa(runtime: ReversaBoss, world: World, level: number): void {
    const boss = getEnemy(world, runtime.primaryId);
    if (!boss) return;
    if (!runtime.reversing && boss.hp <= boss.maxHp / 2)
        activateReversaTurn(runtime, world);
    if (runtime.reversing) {
        updateReversaVectors(runtime, world);
        const incomingInterval = Math.max(
            runtime.mutant ? 0.28 : 0.12,
            (runtime.mutant ? 0.42 : REVERSA_INCOMING_INTERVAL) - level * 0.002,
        );
        while (world.time >= runtime.nextShotAt) {
            spawnReversaIncoming(world, boss, level, runtime.mutant);
            runtime.nextShotAt += incomingInterval;
        }
        return;
    }

    const interval = runtime.mutant
        ? Math.max(0.62, 0.82 - level * 0.004)
        : Math.max(0.38, REVERSA_INTERVAL - level * 0.006);
    const ways = runtime.mutant
        ? 2 + Math.min(1, Math.floor(level / 10))
        : REVERSA_WAYS + Math.min(2, Math.floor(level / 6));
    while (world.time >= runtime.nextShotAt) {
        for (let i = 0; i < ways; i++) {
            const angle = Math.PI * (0.16 + world.rng.next() * 0.68);
            const speed = runtime.mutant
                ? 48 + level * 1.5 + world.rng.next() * 26
                : 108 + level * 3 + world.rng.next() * 52;
            pushBullet(world, boss.pos, angle, speed, runtime.mutant ? 18 : 5, "reversa");
        }
        runtime.nextShotAt += interval;
    }
}

/** 各スナイパーを、ランダム移動・射撃・短時間露出・潜伏の順に進める。 */
function stepSniper(runtime: SniperBoss, world: World, level: number): void {
    const aliveCount = runtime.shooters.filter((shooter) => !!getEnemy(world, shooter.id)).length;
    const lostCount = runtime.initialCount - aliveCount;
    const shotWays = runtime.mutant ? Math.min(7, 1 + lostCount) : 1;
    const shotSpread = runtime.mutant ? 0.08 : 0;
    for (const shooter of runtime.shooters) {
        const e = getEnemy(world, shooter.id);
        if (!e) continue;
        while (world.time >= shooter.nextShotAt) {
            e.pos = {
                x:
                    world.bounds.x +
                    world.bounds.w * (0.12 + world.rng.next() * 0.76),
                y:
                    world.bounds.y +
                    world.bounds.h * (0.1 + world.rng.next() * 0.22),
            };
            pushAimed(world, e.pos, 520 + level * 12, 5, shotWays, shotSpread, "sniper");
            shooter.vulnerableUntil = world.time + 2.4;
            shooter.nextShotAt += runtime.mutant ? 3.35 : 3.1;
        }
        const exposed = world.time < shooter.vulnerableUntil;
        e.visible = exposed;
        e.targetable = exposed;
    }
}

/** ショウグンの横弾幕、壁、狙い弾、刀波を進める。 */
function stepShogun(runtime: ShogunBoss, world: World, level: number): void {
    const boss = getEnemy(world, runtime.primaryId);
    if (!boss) return;
    const wall = getEnemy(world, runtime.wallId);
    boss.targetable = !wall;

    while (world.time >= runtime.sideNextAt) {
        const y =
            world.bounds.y + world.bounds.h * (0.1 + world.rng.next() * 0.8);
        const fromLeft = world.rng.next() < 0.5;
        const x = fromLeft
            ? world.bounds.x + 3
            : world.bounds.x + world.bounds.w - 3;
        pushBullet(
            world,
            { x, y },
            fromLeft ? 0 : Math.PI,
            112 + level * 3,
            5,
            "side",
        );
        runtime.sideNextAt += runtime.mutant
            ? 0.45 + world.rng.next() * 0.25
            : 0.1 + world.rng.next() * 0.1;
    }

    if (wall) {
        wall.pos.x = boss.pos.x;
        while (world.time >= runtime.wallNextAt) {
            pushAimed(world, wall.pos, 145 + level * 4, 7, 1, 0, "normal");
            runtime.wallNextAt += 2.15;
        }
        if (!runtime.mutant) return;
    }

    const playerUpper = world.ship.pos.y <= world.bounds.y + world.bounds.h / 2;
    if (playerUpper && !runtime.wasPlayerUpper && runtime.waveIndex === 0) {
        startShogunWave(runtime, world.time, 21);
        runtime.attackNextAt = world.time + 1.1;
        runtime.notice = "刀波";
    }
    runtime.wasPlayerUpper = playerUpper;

    if (
        runtime.waveIndex > 0 &&
        runtime.waveIndex <= runtime.waveMax &&
        world.time >= runtime.waveNextAt
    ) {
        while (runtime.waveIndex <= runtime.waveMax && world.time >= runtime.waveNextAt) {
            const i = runtime.waveIndex - 1;
            const base = Math.atan2(
                world.ship.pos.y - boss.pos.y,
                world.ship.pos.x - boss.pos.x,
            );
            const denom = Math.max(1, runtime.waveMax - 1);
            const arcWidth = runtime.waveMax <= 11 ? 0.92 : 1.72;
            const arc = -arcWidth / 2 + (i / denom) * arcWidth;
            const source = {
                x: boss.pos.x + Math.cos(base + arc) * 18,
                y: boss.pos.y + Math.sin(base + arc) * 18,
            };
            pushBullet(world, source, base + arc, 205 + level * 4, runtime.waveMax <= 11 ? 4 : 6, "wave");
            runtime.waveIndex += 1;
            runtime.waveNextAt += runtime.waveMax <= 11 ? 0.014 : 0.01;
        }
        if (runtime.waveIndex > runtime.waveMax) runtime.waveIndex = 0;
    }

    if (runtime.waveIndex === 0 && world.time >= runtime.attackNextAt) {
        if (runtime.mutant) {
            startShogunWave(runtime, world.time, 11);
            runtime.attackNextAt = world.time + 1.35;
            runtime.notice = "小刀波";
        } else if (!playerUpper) {
            pushAimed(world, boss.pos, 175 + level * 5, 6, 3, 0.18, "normal");
            runtime.attackNextAt = world.time + 1.05;
        } else {
            startShogunWave(runtime, world.time, 21);
            runtime.attackNextAt = world.time + 1.1;
            runtime.notice = "刀波";
        }
    }
}

/** ショウグンの刀波を指定弾数で開始する。 */
function startShogunWave(runtime: ShogunBoss, now: number, max: number): void {
    runtime.waveIndex = 1;
    runtime.waveMax = max;
    runtime.waveNextAt = now;
}

/** タンクのHP割合段階と、低密度の跳弾フェーズを進める。 */
function stepTank(runtime: TankBoss, world: World, level: number): void {
    const boss = getEnemy(world, runtime.primaryId);
    if (!boss) return;
    const nextStage = Math.min(
        4,
        Math.floor((1 - boss.hp / boss.maxHp) * 5 + 1e-6),
    );
    while (runtime.stage < nextStage) {
        runtime.stage += 1;
        if (runtime.stage === 3) {
            runtime.rebound = true;
            runtime.notice = "低速跳弾";
        } else if (runtime.rebound) {
            runtime.rebound = false;
            runtime.recoverUntil = world.time + 3;
            runtime.notice = "弾速復元中";
        } else {
            runtime.notice = `装甲段階 ${runtime.stage}`;
        }
    }

    const normalSpeed = runtime.mutant
        ? 135 + level * 6
        : (135 + level * 6) * (1 + runtime.stage * 0.12);
    const normalRadius = runtime.mutant
        ? 5.5 + runtime.stage * 1.45
        : 5.5 + runtime.stage * 0.8;
    const speed = runtime.rebound ? normalSpeed * 0.85 : normalSpeed;
    let radius = normalRadius;
    let bouncing = false;
    if (runtime.rebound) {
        radius = 3;
        bouncing = true;
    } else if (world.time < runtime.recoverUntil) {
        const p = clamp(1 - (runtime.recoverUntil - world.time) / 3, 0, 1);
        radius = 3 + (normalRadius - 3) * p;
    }
    const densitySteps = runtime.mutant ? 0 : Math.floor(runtime.stage / 2);
    const baseInterval = Math.max(0.2, 0.5 - densitySteps * 0.11);
    const interval = runtime.rebound ? baseInterval * 2.5 : baseInterval;
    while (world.time >= runtime.nextShotAt) {
        pushAimed(
            world,
            boss.pos,
            speed,
            radius,
            densitySteps > 0 ? 3 : 1,
            0.2,
            "tank",
            bouncing ? { bouncesRemaining: 1 } : {},
        );
        runtime.nextShotAt += interval;
    }

    if (runtime.mutant) {
        while (world.time >= runtime.nextBombAt) {
            pushAimed(world, boss.pos, 72 + level * 1.5, 15, 1, 0, "bomb", {
                bouncesRemaining: 1,
                explodesOnBounce: true,
                explosionWays: 36,
                explosionSpeed: 185 + level * 3,
                explosionRadius: 3,
            });
            runtime.nextBombAt += 2.1;
        }
    }
}

/** プリーストを最終の反射フェーズへ切り替える。 */
function activatePriestReflect(runtime: PriestBoss, world: World): void {
    runtime.mode = "reflect";
    runtime.reflectAnchored = false;
    const boss = getEnemy(world, runtime.primaryId);
    if (boss) {
        boss.hitRadius = Math.min(boss.hitRadius, 10);
        boss.reflectPlayerBullets = true;
    }
    clearEnemyBullets(world);
    runtime.notice = "反射結界";
}

/** プリーストの最終以外のフェーズを切り替え、新しい攻撃用にタイマーを戻す。 */
function setPriestMode(
    runtime: PriestBoss,
    world: World,
    mode: "chase" | "orb",
): void {
    if (runtime.mode === mode) return;
    runtime.mode = mode;
    const boss = getEnemy(world, runtime.primaryId);
    if (boss) boss.reflectPlayerBullets = false;
    runtime.nextShotAt = world.time;
    runtime.nextCheckAt = world.time;
    runtime.notice = mode === "chase" ? "追跡祈祷" : "旋回する祈り";
}

/** 開発補助。ボスラッシュ検証用にプリーストを指定フェーズへ移す。 */
export function forcePriestMode(
    runtime: PriestBoss,
    world: World,
    loadout: PlayerLoadout,
    mode: "chase" | "orb" | "reflect",
): void {
    void loadout;
    const boss = getEnemy(world, runtime.primaryId);
    if (mode === "reflect") {
        if (boss)
            boss.hp = Math.min(boss.hp, boss.maxHp * PRIEST_DUEL_HP_RATIO);
        activatePriestReflect(runtime, world);
        return;
    }
    if (boss) {
        boss.hp =
            mode === "chase"
                ? Math.max(boss.hp, boss.maxHp * 0.75)
                : clamp(
                      boss.hp,
                      boss.maxHp * (PRIEST_DUEL_HP_RATIO + 0.01),
                      boss.maxHp * (PRIEST_ORB_HP_RATIO - 0.01),
                  );
    }
    runtime.mode = mode;
    runtime.nextShotAt = world.time;
    runtime.nextCheckAt = world.time;
    runtime.notice = mode === "chase" ? "追跡祈祷" : "旋回する祈り";
}

/** プリーストを上部の基準位置へ移動し、その後ゆっくり左右に漂わせる。 */
function priestReflectMovement(runtime: PriestBoss, world: World, boss: Enemy): void {
    const target = {
        x: world.bounds.x + world.bounds.w / 2,
        y: world.bounds.y + world.bounds.h * PRIEST_REFLECT_TARGET_Y_RATIO,
    };
    const dx = target.x - boss.pos.x;
    const dy = target.y - boss.pos.y;
    const distance = Math.hypot(dx, dy);
    const speed = PRIEST_REFLECT_MOVE_SPEED;
    if (!runtime.reflectAnchored && distance > 2) {
        boss.vel = { x: (dx / distance) * speed, y: (dy / distance) * speed };
    } else {
        runtime.reflectAnchored = true;
        // 基準位置へ着いた後は横移動だけにして、縦位置を読みやすく保つ。
        boss.pos.y = target.y;
        boss.vel = {
            x: boss.vel.x === 0 ? PRIEST_REFLECT_DRIFT_SPEED : boss.vel.x,
            y: 0,
        };
    }
}

/** プリーストの追跡、放射弾、反射フェーズを進める。 */
function stepPriest(
    runtime: PriestBoss,
    world: World,
    loadout: PlayerLoadout,
    dt: number,
    level: number,
): void {
    void loadout;
    const boss = getEnemy(world, runtime.primaryId);
    if (!boss) return;
    const hpRatio = boss.hp / boss.maxHp;
    if (hpRatio <= PRIEST_DUEL_HP_RATIO) {
        if (runtime.mode !== "reflect") activatePriestReflect(runtime, world);
    } else if (hpRatio <= PRIEST_ORB_HP_RATIO)
        setPriestMode(runtime, world, "orb");
    else setPriestMode(runtime, world, "chase");

    if (runtime.mode === "reflect") {
        priestReflectMovement(runtime, world, boss);
        return;
    }

    // プレイヤー復帰中は追跡と射撃を止め、次の攻防を中央から再開する。
    if (world.time < world.ship.respawnUntil) {
        const center = {
            x: world.bounds.x + world.bounds.w / 2,
            y: world.bounds.y + world.bounds.h / 2,
        };
        const dx = center.x - boss.pos.x;
        const dy = center.y - boss.pos.y;
        const distance = Math.hypot(dx, dy);
        const returnSpeed = 96;
        if (distance > Math.max(1, returnSpeed * dt)) {
            boss.vel = {
                x: (dx / distance) * returnSpeed,
                y: (dy / distance) * returnSpeed,
            };
        } else {
            boss.pos = center;
            boss.vel = { x: 0, y: 0 };
        }
        runtime.nextShotAt = Math.max(
            runtime.nextShotAt,
            world.ship.respawnUntil + 0.25,
        );
        return;
    }

    if (runtime.mode === "chase") {
        const dx = world.ship.pos.x - boss.pos.x;
        const dy = world.ship.pos.y - boss.pos.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        boss.vel = {
            x: (dx / len) * PRIEST_CHASE_SPEED,
            y: (dy / len) * PRIEST_CHASE_SPEED,
        };
        while (world.time >= runtime.nextShotAt) {
            pushAimed(world, boss.pos, 118 + level * 3, 5, 1, 0, "normal", {
                bouncesRemaining: 5,
            });
            runtime.nextShotAt += 0.44;
        }
    } else {
        const center = {
            x: world.bounds.x + world.bounds.w / 2,
            y: world.bounds.y + world.bounds.h / 2,
        };
        const dx = center.x - boss.pos.x;
        const dy = center.y - boss.pos.y;
        const distance = Math.hypot(dx, dy);
        const moveSpeed = 96;
        if (distance > Math.max(1, moveSpeed * dt)) {
            boss.vel = {
                x: (dx / distance) * moveSpeed,
                y: (dy / distance) * moveSpeed,
            };
            return;
        }
        boss.pos = center;
        boss.vel = { x: 0, y: 0 };
        while (world.time >= runtime.nextCheckAt) {
            const volleyIndex = Math.round(
                runtime.orbAngle / (Math.PI / PRIEST_RADIAL_WAYS),
            );
            const curveDirection = volleyIndex % 2 === 0 ? 1 : -1;
            for (let i = 0; i < PRIEST_RADIAL_WAYS; i++) {
                const angle =
                    runtime.orbAngle + (Math.PI * 2 * i) / PRIEST_RADIAL_WAYS;
                pushBullet(world, boss.pos, angle, 64 + level, 5, "orb", {
                    angularVelocity: curveDirection * 0.32,
                    curveUntil: world.time + 3,
                });
            }
            runtime.orbAngle =
                (runtime.orbAngle + Math.PI / PRIEST_RADIAL_WAYS) %
                (Math.PI * 2);
            runtime.nextCheckAt += PRIEST_RADIAL_INTERVAL;
        }
    }
}

/**
 * Applies boss-specific behavior before the generic world step.
 *
 * Returning ShipInput keeps the door open for future bosses that alter controls,
 * while current bosses mostly add bullets or mutate enemy movement.
 */
export function prepareBossStep(
    runtime: BossEncounter,
    world: World,
    loadout: PlayerLoadout,
    input: ShipInput,
    dt: number,
    level: number,
): ShipInput {
    const scaledLevel = pressureLevel(level);
    if (runtime.kind === "normal") return input;
    if (runtime.kind === "reversa") stepReversa(runtime, world, scaledLevel);
    else if (runtime.kind === "sniper") stepSniper(runtime, world, scaledLevel);
    else if (runtime.kind === "shogun") stepShogun(runtime, world, scaledLevel);
    else if (runtime.kind === "tank") stepTank(runtime, world, scaledLevel);
    else if (runtime.kind === "priest")
        stepPriest(runtime, world, loadout, dt, scaledLevel);
    return input;
}

/** ボス戦に属する敵へ、自機弾ダメージを適用する。 */
export function applyBossHit(
    runtime: BossEncounter,
    world: World,
    enemyId: number,
    damage: number,
): void {
    void runtime;
    const target = getEnemy(world, enemyId);
    if (!target) return;
    target.hp -= damage;
}

/** 衝突結果に依存するボス処理を、World更新後に実行する。 */
export function finishBossStep(
    runtime: BossEncounter,
    world: World,
    loadout: PlayerLoadout,
    dt: number,
): void {
    void loadout;
    void dt;
    if (runtime.kind === "reversa") {
        const boss = getEnemy(world, runtime.primaryId);
        if (boss && boss.hp <= boss.maxHp / 2)
            activateReversaTurn(runtime, world);
    }
}

/** ボス戦に必要な敵がすべて取り除かれたらtrueを返す。 */
export function bossDefeated(runtime: BossEncounter, world: World): boolean {
    if (runtime.kind === "sniper")
        return runtime.enemyIds.every((id) => !getEnemy(world, id));
    return !getEnemy(world, runtime.primaryId);
}

/** ボス撃破後にWorld側のフラグを通常状態へ戻す。 */
export function cleanupBoss(
    runtime: BossEncounter,
    world: World,
    loadout: PlayerLoadout,
): void {
    void runtime;
    void loadout;
    world.firingEnabled = true;
    world.ship.pos.y = clamp(
        world.ship.pos.y,
        world.bounds.y,
        world.bounds.y + world.bounds.h,
    );
}

/** HUD通知が一度だけ表示されるよう、ボス通知を取り出して消す。 */
export function takeBossNotice(runtime: BossEncounter): string | null {
    const notice = runtime.notice;
    runtime.notice = null;
    return notice;
}

/** アクティブなボス名の横に表示する短い状態ラベル。 */
export function bossStatus(runtime: BossEncounter, world: World): string {
    if (runtime.kind === "normal") return "通常弾幕";
    if (runtime.kind === "reversa")
        return runtime.mutant
            ? runtime.reversing ? "巨大反転弾" : "巨大ランダム弾"
            : runtime.reversing ? "反転弾幕" : "ランダム弾幕";
    if (runtime.kind === "sniper") {
        const exposed = runtime.shooters.filter(
            (s) => world.time < s.vulnerableUntil && !!getEnemy(world, s.id),
        ).length;
        return `${runtime.mutant ? "多重狙撃 " : ""}露出 ${exposed}/${runtime.shooters.filter((s) => !!getEnemy(world, s.id)).length}`;
    }
    if (runtime.kind === "shogun")
        return runtime.mutant
            ? getEnemy(world, runtime.wallId) ? "盾越し刀波" : "小刀波"
            : getEnemy(world, runtime.wallId) ? "壁を破壊せよ" : "本体露出";
    if (runtime.kind === "tank")
        return runtime.mutant
            ? `装甲段階 ${runtime.stage}・爆裂弾`
            : `装甲段階 ${runtime.stage}${runtime.rebound ? "・跳弾" : ""}`;
    return runtime.mode === "chase"
        ? "追跡祈祷"
        : runtime.mode === "orb"
          ? "旋回する祈り"
          : "反射結界";
}

/** 開発補助。現在のボスを次の主要イベントへ進める。 */
export function forceBossEvent(runtime: BossEncounter, world: World): void {
    if (runtime.kind === "normal") return;
    if (runtime.kind === "reversa") {
        const boss = getEnemy(world, runtime.primaryId);
        if (boss) boss.hp = Math.min(boss.hp, boss.maxHp * 0.49);
        activateReversaTurn(runtime, world);
    } else if (runtime.kind === "sniper") {
        for (const shooter of runtime.shooters) shooter.nextShotAt = world.time;
    } else if (runtime.kind === "shogun") {
        const wall = getEnemy(world, runtime.wallId);
        if (wall) wall.hp = 0;
        else runtime.attackNextAt = world.time;
    } else if (runtime.kind === "tank") {
        const boss = getEnemy(world, runtime.primaryId);
        if (boss) boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.21);
    } else if (runtime.kind === "priest") {
        const boss = getEnemy(world, runtime.primaryId);
        if (!boss || runtime.mode === "reflect") return;
        if (runtime.mode === "chase")
            boss.hp = Math.min(
                boss.hp,
                boss.maxHp * (PRIEST_ORB_HP_RATIO - 0.01),
            );
        else
            boss.hp = Math.min(
                boss.hp,
                boss.maxHp * (PRIEST_DUEL_HP_RATIO - 0.01),
            );
    }
}
