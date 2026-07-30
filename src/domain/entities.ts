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
  // ローグライト用：耐久・無敵・復帰演出
  hp: number;
  maxHp: number;
  invulnUntil: number; // この time までは被弾無効（点滅）
  respawnUntil: number; // この time までは復帰スライド中（操作不可・無発射）
  deathPos: Vec2; // 直近の被弾位置（死亡エフェクト用）
}

export interface Enemy {
  id: EntityId;
  pos: Vec2;
  vel: Vec2; // 移動量（雑魚は下へ降下、ボスは横に往復）
  hitRadius: number;
  hp: number;
  maxHp: number;
  pattern: Pattern | null; // この敵が撃つ弾幕（自分の位置から発射）
  role?: 'mob' | 'boss' | 'sniper' | 'guard';
  visible?: boolean; // false の間は描画しない（スナイパーの潜伏など）
  targetable?: boolean; // false の間は自弾が透過する
}

export interface Bullet {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  owner: Faction;
  bouncesRemaining?: number; // 画面端で反射できる残り回数
  bounceSpeedUp?: number; // 反射時の速度倍率
  maxBounceSpeed?: number; // この速度へ達したら反射を終える
  reversaBaseVel?: Vec2; // リバーサ反転弾の、反転前の速度ベクトル
  reversaTurnAt?: number; // この時刻から徐々に速度ベクトルを反転する
  expired?: boolean; // 特殊寿命を終え、次の整理で消える
  style?: 'normal' | 'reversa' | 'sniper' | 'wave' | 'orb' | 'side' | 'tank';
}

/** プレイヤーの1フレーム入力。方向(-1..1)・発射・タッチ目標位置。 */
export interface ShipInput {
  moveX: number;
  moveY: number;
  fire?: boolean; // 手動発射（autoFire と OR を取る）
  target?: Vec2; // タッチ/ドラッグ時の移動先（場座標）。あれば直接追従
}
