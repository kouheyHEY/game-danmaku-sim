import type { Vec2 } from './math';
import type { Pattern } from './pattern';

export type Faction = 'player' | 'enemy';
export type EntityId = number;

export interface Ship {
  pos: Vec2;
  vel: Vec2;
  /** 食らい判定半径。弾幕STG流に小さく取る。 */
  hitRadius: number;
  speed: number;
  // 発射（③④で自機が撃つ側になるため）。武器も弾幕パターンで差し替え可能。
  autoFire: boolean; // 東方風：押さなくても自動で撃つ
  weapon: Pattern; // 自機の発射パターン（上向き）。④では制御可能な偶数弾など
}

export interface Enemy {
  id: EntityId;
  pos: Vec2;
  vel: Vec2; // 移動量。0なら静止（③では動く標的にする）
  hitRadius: number;
  hp: number;
}

export interface Bullet {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  owner: Faction;
}

/** プレイヤーの1フレーム入力。方向(-1..1)・発射・タッチ目標位置。 */
export interface ShipInput {
  moveX: number;
  moveY: number;
  fire?: boolean; // 手動発射（autoFire と OR を取る）
  target?: Vec2; // タッチ/ドラッグ時の移動先（場座標）。あれば直接追従
}
