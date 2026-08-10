import type { Bullet } from '../domain/entities';
import type { Session } from '../run/session';

export type SfxCue =
  | 'player-shot'
  | 'enemy-shot-aimed'
  | 'enemy-shot-burst'
  | 'enemy-shot-heavy'
  | 'enemy-defeat'
  | 'player-hit'
  | 'power-up';

const ALL_CUES: SfxCue[] = [
  'player-shot',
  'enemy-shot-aimed',
  'enemy-shot-burst',
  'enemy-shot-heavy',
  'enemy-defeat',
  'player-hit',
  'power-up',
];

const VOLUME: Record<SfxCue, number> = {
  'player-shot': 0.085,
  'enemy-shot-aimed': 0.05,
  'enemy-shot-burst': 0.045,
  'enemy-shot-heavy': 0.06,
  'enemy-defeat': 0.14,
  'player-hit': 0.2,
  'power-up': 0.18,
};

const MIN_INTERVAL: Record<SfxCue, number> = {
  'player-shot': 75,
  'enemy-shot-aimed': 90,
  'enemy-shot-burst': 100,
  'enemy-shot-heavy': 120,
  'enemy-defeat': 45,
  'player-hit': 250,
  'power-up': 180,
};

export function enemyShotCue(bullet: Bullet): SfxCue | null {
  if (bullet.style === 'side') return null;
  if (bullet.style === 'sniper') return 'enemy-shot-aimed';
  if (bullet.style === 'tank' || bullet.style === 'orb' || bullet.style === 'wave') return 'enemy-shot-heavy';
  if (bullet.style === 'reversa') return 'enemy-shot-burst';
  // 通常弾も発射ごとに音色を混ぜ、雑魚の射撃へ単発・連射らしい差を出す。
  if (bullet.id % 9 === 0) return 'enemy-shot-heavy';
  return bullet.id % 3 === 0 ? 'enemy-shot-burst' : 'enemy-shot-aimed';
}

/** 可変フレーム描画から、ゲーム状態の変化を一度だけ効果音イベントへ変換する。 */
export class SfxTracker {
  private bulletIds = new Set<number>();
  private hp = 0;
  private kills = 0;
  private level = 0;

  reset(session: Session): void {
    this.bulletIds = new Set(session.world.bullets.map((bullet) => bullet.id));
    this.hp = session.world.ship.hp;
    this.kills = session.kills;
    this.level = session.level;
  }

  collect(session: Session): SfxCue[] {
    const cues = new Set<SfxCue>();
    const currentIds = new Set<number>();
    let playerShot = false;
    let enemyShot: SfxCue | null = null;
    for (const bullet of session.world.bullets) {
      currentIds.add(bullet.id);
      if (this.bulletIds.has(bullet.id)) continue;
      if (bullet.owner === 'player') playerShot = true;
      else if (enemyShot == null) enemyShot = enemyShotCue(bullet);
    }
    this.bulletIds = currentIds;
    if (playerShot) cues.add('player-shot');
    if (enemyShot) cues.add(enemyShot);

    if (session.kills > this.kills) cues.add('enemy-defeat');
    if (session.world.ship.hp < this.hp) cues.add('player-hit');
    if (session.level > this.level && session.phase !== 'reward') cues.add('power-up');
    this.hp = session.world.ship.hp;
    this.kills = session.kills;
    this.level = session.level;
    return [...cues];
  }
}

export class GameSfx {
  private readonly tracker = new SfxTracker();
  private readonly buffers = new Map<SfxCue, AudioBuffer>();
  private readonly pending = new Set<SfxCue>();
  private readonly lastPlayed = new Map<SfxCue, number>();
  private context: AudioContext | null = null;

  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    for (const cue of ALL_CUES) {
      // Vite開発サーバーのpublicはルート、本番の相対baseは配置先ディレクトリを基準にする。
      const assetBase = import.meta.env.DEV ? '/' : import.meta.env.BASE_URL;
      const src = new URL(`${assetBase}sfx/${cue}.mp3`, document.baseURI).href;
      void this.load(cue, src);
    }
  }

  reset(session: Session): void {
    this.tracker.reset(session);
  }

  /** iOSを含むブラウザの自動再生制限を、開始タップ内の単一AudioContext再開で解除する。 */
  async unlock(): Promise<void> {
    if (!this.context || this.context.state === 'closed') return;
    try {
      if (this.context.state !== 'running') await this.context.resume();
      this.flushPending();
    } catch {
      // 次のユーザー操作でもう一度resumeを試す。
    }
  }

  update(session: Session): void {
    for (const cue of this.tracker.collect(session)) this.play(cue);
  }

  play(cue: SfxCue): void {
    const now = performance.now();
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < MIN_INTERVAL[cue]) return;
    this.lastPlayed.set(cue, now);
    if (!this.context || this.context.state !== 'running' || !this.buffers.has(cue)) {
      this.pending.add(cue);
      return;
    }
    this.playNow(cue);
  }

  private async load(cue: SfxCue, src: string): Promise<void> {
    if (!this.context) return;
    try {
      const response = await fetch(src);
      if (!response.ok) return;
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(cue, buffer);
      this.flushPending();
    } catch {
      // 効果音が取得できなくてもゲーム進行は止めない。
    }
  }

  private flushPending(): void {
    if (!this.context || this.context.state !== 'running') return;
    for (const cue of [...this.pending]) {
      if (!this.buffers.has(cue)) continue;
      this.pending.delete(cue);
      this.playNow(cue);
    }
  }

  private playNow(cue: SfxCue): void {
    const context = this.context;
    const buffer = this.buffers.get(cue);
    if (!context || !buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(VOLUME[cue], context.currentTime);
    source.connect(gain);
    gain.connect(context.destination);
    source.addEventListener('ended', () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start();
  }
}
