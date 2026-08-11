export const LEADERBOARD_LIMIT = 10;
export const LEADERBOARD_STORAGE_KEY = 'danmaku-sim.leaderboard.v1';

export interface LeaderboardEntry {
  id: string;
  score: number;
  reachedBoss: string;
  rebirths: number;
  createdAt: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  rank: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function validEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return typeof entry.id === 'string'
    && typeof entry.score === 'number' && Number.isFinite(entry.score)
    && typeof entry.reachedBoss === 'string'
    && typeof entry.rebirths === 'number' && Number.isFinite(entry.rebirths)
    && typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt);
}

export function sortLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) =>
    b.score - a.score
    || b.rebirths - a.rebirths
    || b.createdAt - a.createdAt);
}

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
