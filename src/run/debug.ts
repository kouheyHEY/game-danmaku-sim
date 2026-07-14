import type { Session } from './session';
import { makeBoss, makeMob, makeStrongBoss } from './content';
import { WEAPON_UPGRADES, randomWeaponUpgrade, type WeaponUpgrade } from './upgrades';
import { buildWeapon } from './weapon';

/**
 * デバッグ用アクション集。任意の動作を好きに発動するための入口。
 * すべて Session を直接操作するだけの純粋な副作用関数なのでテストしやすい。
 */

export function debugSpawnBoss(s: Session): void {
  if (s.bossId != null) return; // 既にボスがいれば何もしない
  const id = s.nextEnemyId++;
  s.world.enemies.push(makeBoss(id, s.level, s.world.bounds, s.rng));
  s.bossId = id;
  s.bossIsStrong = false;
}

export function debugSpawnStrongBoss(s: Session): void {
  if (s.bossId != null) return;
  const id = s.nextEnemyId++;
  s.world.enemies.push(makeStrongBoss(id, s.level, s.world.bounds, s.rng));
  s.bossId = id;
  s.bossIsStrong = true;
}

export function debugSpawnMob(s: Session): void {
  const id = s.nextEnemyId++;
  const b = s.world.bounds;
  const x = b.x + 20 + s.rng.next() * (b.w - 40);
  s.world.enemies.push(makeMob(id, x, s.level, b, s.rng));
}

/** ボス撃破報酬と同じ：レベル+1・HP+1回復・ランダム強化。 */
export function debugLevelUp(s: Session): void {
  s.level += 1;
  s.world.ship.hp = Math.min(s.world.ship.maxHp, s.world.ship.hp + 1);
  s.loadout.hp = s.world.ship.hp;
  const name = randomWeaponUpgrade(s.rng, s.loadout);
  s.world.ship.weapon = buildWeapon(s.loadout.weapon);
  s.toast = { text: `DEBUG: Lv${s.level} ${name}`, until: s.world.time + 2 };
}

/** 指定の武器強化を1つ付与。 */
export function debugGiveUpgrade(s: Session, u: WeaponUpgrade): void {
  if (u.available && !u.available(s.loadout)) return;
  u.apply(s.loadout);
  s.world.ship.weapon = buildWeapon(s.loadout.weapon);
  s.toast = { text: `DEBUG: ${u.name}`, until: s.world.time + 1.5 };
}

export function debugFullHeal(s: Session): void {
  s.world.ship.hp = s.world.ship.maxHp;
  s.loadout.hp = s.world.ship.maxHp;
}

export function debugAddMaxHp(s: Session, n: number): void {
  s.world.ship.maxHp += n;
  s.world.ship.hp = Math.min(s.world.ship.maxHp, s.world.ship.hp + n);
  s.loadout.maxHp = s.world.ship.maxHp;
  s.loadout.hp = s.world.ship.hp;
}

/** 自機に1ダメージ相当（被弾演出の確認）。 */
export function debugHurt(s: Session): void {
  const ship = s.world.ship;
  if (s.world.time < ship.invulnUntil) return;
  ship.hp -= 1;
  ship.deathPos = { x: ship.pos.x, y: ship.pos.y };
  ship.invulnUntil = s.world.time + 2.0;
  ship.respawnUntil = s.world.time + 0.7;
  if (ship.hp <= 0) s.phase = 'gameover';
}

/** 無敵を ON/OFF トグル。 */
export function debugToggleInvuln(s: Session): boolean {
  const on = s.world.ship.invulnUntil > s.world.time + 1e6;
  s.world.ship.invulnUntil = on ? 0 : s.world.time + 1e9;
  return !on;
}

export function debugClearBullets(s: Session): void {
  s.world.bullets = [];
}

export function debugAddScore(s: Session, n: number): void {
  s.world.dodged += n;
  s.score = s.world.dodged;
}

export { WEAPON_UPGRADES };
