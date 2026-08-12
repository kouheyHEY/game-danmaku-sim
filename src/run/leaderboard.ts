/**
 * 端末内ランキングの保存・読み込み・順位計算を扱う。
 */
export const LEADERBOARD_LIMIT = 10;
export const LEADERBOARD_STORAGE_KEY = 'danmaku-sim.leaderboard.v1';

/** ランキングに保存する1件分のスコア記録。 */
export interface LeaderboardEntry {
  id: string;
  score: number;
  reachedBoss: string;
  rebirths: number;
  createdAt: number;
}

/** スコア記録後にUIへ返すランキング一覧と今回順位。 */
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  rank: number;
}

/** localStorage相当だけに依存させ、テストで差し替えられる保存先。 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorageから読んだ未知データがランキング項目として妥当か確認する。 */
function validEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return typeof entry.id === 'string'
    && typeof entry.score === 'number' && Number.isFinite(entry.score)
    && typeof entry.reachedBoss === 'string'
    && typeof entry.rebirths === 'number' && Number.isFinite(entry.rebirths)
    && typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt);
}

/** スコア、転生数、作成時刻の順でランキングを降順に並べる。 */
export function sortLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) =>
    b.score - a.score
    || b.rebirths - a.rebirths
    || b.createdAt - a.createdAt);
}

/** 保存済みランキングを読み込み、不正データを除外して上位だけ返す。 */
export function loadLeaderboard(storage: KeyValueStorage): LeaderboardEntry[] {
  try {
    const raw = storage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? sortLeaderboard(parsed.filter(validEntry)).slice(0, LEADERBOARD_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/** 新しいスコアを保存し、今回順位とTOP10を返す。 */
export function recordScore(storage: KeyValueStorage, entry: LeaderboardEntry): LeaderboardResult {
  const ranked = sortLeaderboard([...loadLeaderboard(storage), entry]);
  const rank = ranked.findIndex((candidate) => candidate.id === entry.id) + 1;
  const entries = ranked.slice(0, LEADERBOARD_LIMIT);
  try {
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ストレージが無効でも、今回のランキング表示は継続する。
  }
  return { entries, rank };
}

/** 現在のゲーム結果からランキング保存用の項目を作る。 */
export function makeLeaderboardEntry(
  score: number,
  reachedBoss: string,
  rebirths: number,
  createdAt = Date.now(),
): LeaderboardEntry {
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
    score: Math.max(0, score),
    reachedBoss,
    rebirths: Math.max(0, Math.floor(rebirths)),
    createdAt,
  };
}
