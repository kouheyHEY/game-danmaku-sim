import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_LIMIT,
  LEADERBOARD_STORAGE_KEY,
  loadLeaderboard,
  makeLeaderboardEntry,
  recordScore,
  type KeyValueStorage,
} from '../../src/run/leaderboard';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('leaderboard', () => {
  it('records score order and keeps only the top ten', () => {
    const storage = new MemoryStorage();
    for (let score = 1; score <= 12; score++) {
      recordScore(storage, makeLeaderboardEntry(score, 'リバーサ', 0, score));
    }
    const entries = loadLeaderboard(storage);
    expect(entries).toHaveLength(LEADERBOARD_LIMIT);
    expect(entries.map((entry) => entry.score)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('reports a rank outside the saved top ten without losing the top scores', () => {
    const storage = new MemoryStorage();
    const entries = Array.from({ length: 10 }, (_, index) => makeLeaderboardEntry(100 - index, 'プリースト', 1, index));
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
    const result = recordScore(storage, makeLeaderboardEntry(1, 'リバーサ', 0, 99));
    expect(result.rank).toBe(11);
    expect(result.entries).toHaveLength(10);
    expect(result.entries.at(-1)?.score).toBe(91);
  });
});
