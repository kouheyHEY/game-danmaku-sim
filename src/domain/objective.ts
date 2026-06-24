import type { CollisionEvent } from './collision';
import type { World } from './world';

export type Firer = 'enemy' | 'player'; // 主役の弾を撃つのは誰か
export type Goal = 'avoid' | 'hit'; // その弾は避ける / 当てに行くべきか

export interface Mode {
  firer: Firer;
  goal: Goal;
}

export interface Score {
  hp: number;
  goodHits: number;
  badHits: number;
}

export type Outcome = 'ongoing' | 'cleared' | 'failed';

/**
 * 勝敗の意味づけ。衝突イベントを得点/失点に翻訳し、勝敗を判定する。
 * モードごとに 1 つ。これがゲームの差し替え単位（反転の正体）。
 *
 * evaluate が返す cleared/failed は「このフェーズの達成/即敗北」を表す。
 * フェーズをいつ次へ進めるか・全体の勝敗は Director が束ねる。
 */
export interface Objective {
  readonly mode: Mode;
  onCollision(e: CollisionEvent, score: Score): void;
  evaluate(score: Score, world: World): Outcome;
}

export function makeScore(hp: number): Score {
  return { hp, goodHits: 0, badHits: 0 };
}

/**
 * 遷移の「間（lull）」用の何もしない Objective。失点も達成もしない。
 * 弾が消えるのを待つ無弾フェーズに使う。表示用に直前のモードを持たせる。
 */
export function transition(mode: Mode): Objective {
  return {
    mode,
    onCollision() {},
    evaluate() {
      return 'ongoing';
    },
  };
}

/** ① 通常弾幕：敵弾に当たってはいけない。被弾で HP を失い、尽きたら即敗北。 */
export function avoidEnemyBullets(): Objective {
  return {
    mode: { firer: 'enemy', goal: 'avoid' },
    onCollision(e, score) {
      if (e.kind === 'bullet-hits-ship' && e.owner === 'enemy') {
        score.hp -= 1;
        score.badHits += 1;
      }
    },
    evaluate(score) {
      return score.hp <= 0 ? 'failed' : 'ongoing';
    },
  };
}

/** ② 逆弾幕：敵弾に当たりに行く。B＝一撃成立（1 発触れれば達成）。 */
export function catchEnemyBullets(): Objective {
  return {
    mode: { firer: 'enemy', goal: 'hit' },
    onCollision(e, score) {
      if (e.kind === 'bullet-hits-ship' && e.owner === 'enemy') {
        score.goodHits += 1;
      }
    },
    evaluate(score) {
      return score.goodHits >= 1 ? 'cleared' : 'ongoing';
    },
  };
}

/** ③ 自分が撃つ：自弾を敵に当てる。規定数当てれば達成。 */
export function hitEnemy(opts: { quota: number }): Objective {
  return {
    mode: { firer: 'player', goal: 'hit' },
    onCollision(e, score) {
      if (e.kind === 'bullet-hits-enemy' && e.owner === 'player') {
        score.goodHits += 1;
      }
    },
    evaluate(score) {
      return score.goodHits >= opts.quota ? 'cleared' : 'ongoing';
    },
  };
}

/** ④ 自分が撃つ：撃ってよいが敵に当ててはいけない。1 発でも当てたら即敗北。 */
export function dontHitEnemy(): Objective {
  return {
    mode: { firer: 'player', goal: 'avoid' },
    onCollision(e, score) {
      if (e.kind === 'bullet-hits-enemy' && e.owner === 'player') {
        score.badHits += 1;
      }
    },
    evaluate(score) {
      return score.badHits >= 1 ? 'failed' : 'ongoing';
    },
  };
}
