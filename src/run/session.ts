/**
 * ゲーム全体のフェーズ、スコア、ボス出現、報酬選択を進行させる。
 */
import { makeWorld, defaultShip, shipSpawn, step, type World } from '../domain/world';
import type { ShipInput } from '../domain/entities';
import { makeRng, type Rng } from '../domain/rng';
import { FIELD } from '../spec/stage0';
import { startingLoadout, type PlayerLoadout } from './loadout';
import { buildWeapon } from './weapon';
import { drawSpecialUpgrades, randomWeaponUpgrade, type SpecialUpgrade } from './upgrades';
import {
  BOSS_NAMES, applyBossHit, bossDefeated, bossKindForLevel, cleanupBoss, finishBossStep,
  makeBossEncounter, prepareBossStep, takeBossNotice, type BossEncounter, type BossKind,
} from './bosses';
import type { LeaderboardEntry } from './leaderboard';

export const IFRAME = 2.5; // 被弾後の無敵(点滅) [s]
export const RESPAWN_TIME = 0.7; // 画面下から復帰しきるまで [s]
const BOSS_FIRST = 0.8;
const BOSS_INTERVAL = 1.2;
const ESCAPE_MARGIN = 40; // 画面下にこれだけ抜けたら退場

export type Phase = 'title' | 'playing' | 'paused' | 'reward' | 'gameover';

export interface Toast {
  text: string;
  until: number;
}

export interface Session {
  phase: Phase;
  world: World;
  loadout: PlayerLoadout;
  level: number; // 撃破したボス数
  score: number; // scoreBase × scoreMultiplier
  scoreBase: number; // 与えた実ダメージ + grazeCount × GRAZE_SCORE
  damageDealt: number;
  grazeCount: number;
  scoreMultiplier: number; // 1.2 ^ priestDefeats
  priestDefeats: number;
  kills: number; // 倒した敵の数（雑魚＋ボス）
  nextBossAt: number;
  bossId: number | null;
  bossKind: BossKind | null;
  boss: BossEncounter | null;
  bossIsStrong: boolean;
  specialChoices: SpecialUpgrade[];
  nextEnemyId: number;
  toast: Toast | null;
  rng: Rng;
  seed: number;
  leaderboard: LeaderboardEntry[];
  currentRank: number | null;
  reachedBossName: string;
  rewardNotice: string;
}

export const GRAZE_SCORE = 10;
export const BOSS_DEFEAT_HEAL = 1;

/** プリースト撃破数から現在のスコア倍率を計算する。 */
export function multiplierForPriestDefeats(priestDefeats: number): number {
  return 1.2 ** Math.max(0, Math.floor(priestDefeats));
}

/** 累積した素点に転生倍率を掛けて最終スコアを出す。 */
export function scoreForBase(scoreBase: number, priestDefeats: number): number {
  return scoreBase * multiplierForPriestDefeats(priestDefeats);
}

/** 現在のプレイヤー強化状態からWorldを作る。 */
function newWorld(loadout: PlayerLoadout, seed: number): World {
  const ship = defaultShip(FIELD);
  ship.weapon = buildWeapon(loadout.weapon);
  ship.hp = loadout.hp;
  ship.maxHp = loadout.maxHp;
  const world = makeWorld({ bounds: FIELD, seed, ship, enemies: [] });
  world.enemyPattern = null; // 雨は敵が撃つ（固定エミッタは使わない）
  world.firingEnabled = true;
  return world;
}

/** 指定シードからプレイ可能なランを開始する。 */
export function beginSession(seed = Date.now()): Session {
  const s = seed >>> 0;
  const loadout = startingLoadout();
  const world = newWorld(loadout, s);
  return {
    phase: 'playing',
    world,
    loadout,
    level: 0,
    score: 0,
    scoreBase: 0,
    damageDealt: 0,
    grazeCount: 0,
    scoreMultiplier: 1,
    priestDefeats: 0,
    kills: 0,
    nextBossAt: world.time + BOSS_FIRST,
    bossId: null,
    bossKind: null,
    boss: null,
    bossIsStrong: false,
    specialChoices: [],
    nextEnemyId: 1,
    toast: null,
    rng: makeRng(s),
    seed: s,
    leaderboard: [],
    currentRank: null,
    reachedBossName: '',
    rewardNotice: '',
  };
}

/** 最初のタップ前に表示するタイトル状態のSessionを作る。 */
export function titleSession(seed = Date.now()): Session {
  const s = beginSession(seed);
  s.phase = 'title';
  return s;
}

/** 進行中のSessionを一時停止する。 */
export function pauseSession(session: Session): boolean {
  if (session.phase !== 'playing') return false;
  session.phase = 'paused';
  return true;
}

/** 一時停止中のSessionを再開する。 */
export function resumeSession(session: Session): boolean {
  if (session.phase !== 'paused') return false;
  session.phase = 'playing';
  return true;
}

/** 自機復帰中の、画面下からスライドする演出位置を計算する。 */
function respawnSlide(w: World): { x: number; y: number } {
  const b = w.bounds;
  const spawn = shipSpawn(b);
  const startY = b.y + b.h + 36;
  const p = Math.max(0, Math.min(1, 1 - (w.ship.respawnUntil - w.time) / RESPAWN_TIME));
  const e = 1 - (1 - p) ** 3;
  return { x: spawn.x, y: startY + (spawn.y - startY) * e };
}

/** 被弾処理を一箇所に集約し、死亡位置からの弾消し波動に合わせて敵弾を消去する。 */
export function applyPlayerHit(session: Session): boolean {
  const w = session.world;
  const ship = w.ship;
  if (w.time < ship.invulnUntil) return false;
  ship.hp -= 1;
  ship.deathPos = { x: ship.pos.x, y: ship.pos.y };
  ship.invulnUntil = w.time + IFRAME;
  ship.respawnUntil = w.time + RESPAWN_TIME;
  w.bullets = w.bullets.filter((bullet) => bullet.owner !== 'enemy');
  return true;
}

/**
 * Advances one fixed-timestep frame of gameplay.
 *
 * The order matters: boss AI may alter bullets/movement first, the domain world
 * advances and reports collisions, then this function applies session-level
 * consequences such as score, boss rewards, HP, phase transitions, and respawn.
 */
export function stepSession(session: Session, input: ShipInput, dt: number): void {
  if (session.phase !== 'playing') return;
  const w = session.world;
  const ship = w.ship;

  let used: ShipInput = w.time < ship.respawnUntil ? { moveX: 0, moveY: 0 } : input;
  if (session.boss) used = prepareBossStep(session.boss, w, session.loadout, used, dt, session.level);
  const events = step(w, used, dt);
  for (const ev of events) {
    if (ev.kind === 'bullet-hits-enemy' && ev.owner === 'player') {
      const e = w.enemies.find((x) => x.id === ev.enemy);
      if (e) {
        const hpBefore = Math.max(0, e.hp);
        if (session.boss?.enemyIds.includes(e.id)) applyBossHit(session.boss, w, e.id, session.loadout.weapon.damage);
        else e.hp -= session.loadout.weapon.damage;
        const dealt = Math.min(hpBefore, session.loadout.weapon.damage);
        session.damageDealt += dealt;
        session.scoreBase += dealt;
      }
    } else if (ev.kind === 'bullet-grazes-ship' && ev.owner === 'enemy') {
      session.grazeCount += 1;
      session.scoreBase += GRAZE_SCORE;
    } else if (ev.kind === 'bullet-hits-ship' && ev.owner === 'enemy') {
      applyPlayerHit(session);
    }
  }
  if (session.boss) {
    finishBossStep(session.boss, w, session.loadout, dt);
    const notice = takeBossNotice(session.boss);
    if (notice) session.toast = { text: `${BOSS_NAMES[session.boss.kind]} ・ ${notice}`, until: w.time + 1.8 };
  }
  if (w.time < ship.respawnUntil) {
    ship.pos = respawnSlide(w);
    ship.vel = { x: 0, y: 0 };
  }

  // 撃破（HP0）と退場（下に抜けた）を仕分け。撃破だけカウント。
  const bottom = w.bounds.y + w.bounds.h + ESCAPE_MARGIN;
  let killed = 0;
  w.enemies = w.enemies.filter((e) => {
    if (e.hp <= 0) {
      killed += 1;
      return false;
    }
    return e.pos.y <= bottom; // 下に抜けた雑魚は退場（撃破ではない）
  });
  session.kills += killed;
  session.score = scoreForBase(session.scoreBase, session.priestDefeats);
  if (session.toast && w.time >= session.toast.until) session.toast = null;

  const defeatedBoss = session.boss && bossDefeated(session.boss, w) ? session.boss : null;

  if (defeatedBoss) {
    const wasStrong = session.bossIsStrong;
    if (defeatedBoss.kind === 'priest') {
      session.priestDefeats += 1;
      session.scoreMultiplier = multiplierForPriestDefeats(session.priestDefeats);
      session.score = scoreForBase(session.scoreBase, session.priestDefeats);
      session.rewardNotice = `プリースト撃破：スコア倍率 ×${session.scoreMultiplier.toFixed(2)}`;
    } else {
      session.rewardNotice = '';
    }
    cleanupBoss(defeatedBoss, w, session.loadout);
    session.bossId = null;
    session.bossKind = null;
    session.boss = null;
    session.bossIsStrong = false;
    session.level += 1;
    ship.hp = Math.min(ship.maxHp, ship.hp + BOSS_DEFEAT_HEAL);
    session.loadout.hp = ship.hp;
    if (wasStrong) {
      // 選択中に残弾で状況が変わらないよう、戦場を空にして時間を止める。
      w.bullets = [];
      session.specialChoices = drawSpecialUpgrades(session.rng, session.loadout);
      session.phase = 'reward';
      session.nextBossAt = Number.POSITIVE_INFINITY;
      session.toast = null;
    } else {
      const name = randomWeaponUpgrade(session.rng, session.loadout);
      ship.weapon = buildWeapon(session.loadout.weapon);
      session.nextBossAt = w.time + BOSS_INTERVAL;
      session.toast = { text: `BOSS撃破！  +1HP ・ ${name}`, until: w.time + 2.4 };
    }
  }

  if (ship.hp <= 0) {
    session.phase = 'gameover';
    return;
  }

  // ボス専用進行。雑魚フェーズは持たない。
  if (session.phase === 'playing' && session.bossId == null) {
    if (w.time >= session.nextBossAt) {
      spawnBoss(session, bossKindForLevel(session.level), true);
    }
  }

}

/** 指定ボスを出現させる。通常進行とdev-loopで共用する。 */
export function spawnBoss(session: Session, kind: BossKind, strong = false, forceMutant?: boolean): boolean {
  if (session.boss) return false;
  const w = session.world;
  const spawn = makeBossEncounter(kind, session.level, w.bounds, session.rng, strong, w.time, () => session.nextEnemyId++, forceMutant);
  w.enemies.push(...spawn.enemies);
  session.boss = spawn.encounter;
  session.bossId = spawn.encounter.primaryId;
  session.bossKind = kind;
  session.bossIsStrong = strong;
  session.toast = {
    text: `${spawn.encounter.mutant ? '変異種 ' : strong ? '強敵 ' : ''}${BOSS_NAMES[kind]}`,
    until: w.time + 2.2,
  };
  return true;
}

/** 大ボス撃破後の2択を適用して戦闘へ戻る。 */
export function chooseSpecialUpgrade(session: Session, index: number): boolean {
  if (session.phase !== 'reward') return false;
  const upgrade = session.specialChoices[index];
  if (!upgrade) return false;

  upgrade.apply(session.loadout);
  const ship = session.world.ship;
  ship.maxHp = session.loadout.maxHp;
  ship.hp = session.loadout.hp;
  ship.weapon = buildWeapon(session.loadout.weapon);
  session.specialChoices = [];
  session.rewardNotice = '';
  session.phase = 'playing';
  session.nextBossAt = session.world.time + BOSS_INTERVAL;
  session.toast = { text: `特別強化 ・ ${upgrade.name}`, until: session.world.time + 2.4 };
  return true;
}
