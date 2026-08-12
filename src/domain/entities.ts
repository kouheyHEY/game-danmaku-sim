/**
 * 自機・敵・弾など、ゲーム世界に存在するエンティティの型を定義する。
 */
import type { Vec2 } from './math';
import type { Pattern } from './pattern';

export type Faction = 'player' | 'enemy';
export type EntityId = number;

export type EnemyHitbox =
  | { kind: 'rect'; halfWidth: number; halfHeight: number }
  | { kind: 'circle'; radius: number };

/** プレイヤー自機の状態。見た目サイズではなく、ゲーム進行に必要な値だけを持つ。 */
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

/** 敵1体の状態。ボス・雑魚・ガード・スナイパーを同じ型で扱う。 */
export interface Enemy {
  id: EntityId;
  pos: Vec2;
  vel: Vec2; // 移動量（雑魚は下へ降下、ボスは横に往復）
  hitRadius: number;
  /** 自弾との衝突形状。未指定の敵は hitRadius を半幅とする矩形。 */
  hitbox?: EnemyHitbox;
  hp: number;
  maxHp: number;
  pattern: Pattern | null; // この敵が撃つ弾幕（自分の位置から発射）
  role?: 'mob' | 'boss' | 'sniper' | 'guard';
  visible?: boolean; // false の間は描画しない（スナイパーの潜伏など）
  targetable?: boolean; // false の間は自弾が透過する
  reflectPlayerBullets?: boolean; // 当たった自弾を敵弾として来た方向へ返す
}

/** Enemyに設定された当たり判定を返す。未指定なら旧来の矩形判定へフォールバックする。 */
export function enemyHitbox(enemy: Enemy): EnemyHitbox {
  return enemy.hitbox ?? {
    kind: 'rect',
    halfWidth: enemy.hitRadius,
    halfHeight: enemy.hitRadius,
  };
}

/** 弾1発の状態。特殊ボス用の追加挙動も任意プロパティとして持つ。 */
export interface Bullet {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  owner: Faction;
  bouncesRemaining?: number; // 画面端で反射できる残り回数
  bounceSpeedUp?: number; // 反射時の速度倍率
  maxBounceSpeed?: number; // この速度へ達したら反射を終える
  explodesOnBounce?: boolean; // 最初の壁反射時に拡散弾を発生させる
  explosionWays?: number; // 爆発時に発生する拡散弾数
  explosionSpeed?: number; // 爆発弾の速度
  explosionRadius?: number; // 爆発弾の半径
  reversaBaseVel?: Vec2; // リバーサ反転弾の、反転前の速度ベクトル
  reversaTurnAt?: number; // この時刻から徐々に速度ベクトルを反転する
  angularVelocity?: number; // 速度ベクトルを毎秒回転させる角速度 [rad/s]
  curveUntil?: number; // この時刻まで angularVelocity を適用する
  expired?: boolean; // 特殊寿命を終え、次の整理で消える
  style?: 'normal' | 'reversa' | 'sniper' | 'wave' | 'orb' | 'side' | 'tank' | 'bomb' | 'reflected';
  grazed?: boolean; // プレイヤーのかすりゾーンで一度得点済み
}

/** プレイヤーの1フレーム入力。方向(-1..1)・発射・タッチ目標位置。 */
export interface ShipInput {
  moveX: number;
  moveY: number;
  fire?: boolean; // 手動発射（autoFire と OR を取る）
  target?: Vec2; // タッチ/ドラッグ時の移動先（場座標）。あれば直接追従
}
