import type { CollisionEvent } from './collision';
import type { Mode, Objective, Outcome, Score } from './objective';
import type { Pattern } from './pattern';
import type { World } from './world';

export type Cue = 'none' | 'color-flip' | 'flash';

export type PhaseEnd =
  | { type: 'afterSeconds'; seconds: number } // 時間で次へ
  | { type: 'objectiveCleared'; deadline: number } // 達成で次へ。期限超過で敗北
  | { type: 'whenClear'; minSeconds?: number }; // 敵弾が消えたら次へ（遷移の lull 用）

export interface Phase {
  id: string;
  objective: Objective;
  pattern: Pattern | null; // この区間の敵弾。null＝撃たない
  end: PhaseEnd;
  lull?: boolean; // 遷移の「間（弾なし）」区間か
  cue?: Cue;
}

/** 描画/演出が「いま反転が近い」を知るための信号。 */
export interface TelegraphSignal {
  active: boolean;
  upcomingMode: Mode;
  cue: Cue;
}

/**
 * 進行（Director）。フェーズ列を進め、各フェーズの敵弾パターンを場に適用する。
 *
 * 設計ルール（全ステージ①開始・遷移は無弾の瞬間に）：
 *  - 実モードの間に必ず lull（pattern=null）フェーズを挟む。
 *  - lull に入った瞬間に敵の発射を止め（firingEnabled=false）、
 *    画面の敵弾が消えてから次モードへ進む（whenClear）。
 *  - こうすればどのモードからどのモードへ遷移しても、切替時は必ず弾がない。
 */
export interface Director {
  current(): Objective;
  phaseId(): string;
  begin(world: World): void; // 初期フェーズを場に適用
  onCollision(e: CollisionEvent, score: Score): void;
  update(world: World, score: Score): Outcome;
  telegraph(world: World): TelegraphSignal | null;
}

export function makeDirector(phases: Phase[]): Director {
  if (phases.length === 0) throw new Error('Director には最低 1 フェーズ必要');
  let index = 0;
  let phaseStart = 0;

  const phase = () => phases[index];
  const next = () => phases[index + 1];

  const applyPhase = (world: World) => {
    world.enemyPattern = phase().pattern;
    world.firingEnabled = phase().pattern !== null;
    phaseStart = world.time;
  };

  return {
    current: () => phase().objective,
    phaseId: () => phase().id,

    begin(world) {
      index = 0;
      applyPhase(world);
    },

    onCollision: (e, score) => phase().objective.onCollision(e, score),

    update(world, score) {
      const objOutcome = phase().objective.evaluate(score, world);
      if (objOutcome === 'failed') return 'failed';

      const inPhase = world.time - phaseStart;
      const end = phase().end;

      let advance = false;
      switch (end.type) {
        case 'afterSeconds':
          advance = inPhase >= end.seconds;
          break;
        case 'objectiveCleared':
          if (objOutcome === 'cleared') advance = true;
          else if (inPhase >= end.deadline) return 'failed';
          break;
        case 'whenClear': {
          const noEnemyBullets = !world.bullets.some((b) => b.owner === 'enemy');
          advance = noEnemyBullets && inPhase >= (end.minSeconds ?? 0);
          break;
        }
      }

      if (!advance) return 'ongoing';
      if (index >= phases.length - 1) return 'cleared';
      index += 1;
      applyPhase(world);
      return 'ongoing';
    },

    telegraph() {
      const upcoming = next();
      if (!phase().lull || !upcoming) return null;
      return {
        active: true,
        upcomingMode: upcoming.objective.mode,
        cue: phase().cue ?? 'color-flip',
      };
    },
  };
}
