/**
 * ゲーム本体を起動し、描画・入力・効果音・デバッグUIを接続するエントリーポイント。
 */
import { Application, Assets, type Texture } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import type { ShipInput } from '../domain/entities';
import {
  titleSession, beginSession, stepSession, chooseSpecialUpgrade, pauseSession, resumeSession, type Session,
} from '../run/session';
import {
  SessionRenderer, pauseButtonRect, specialRewardCardRects, type EntityTextures,
} from '../render/sessionRenderer';
import { mountDebugPanel, debugEnabled, type DebugButton } from '../render/debugPanel';
import {
  debugSpawnBossKind, debugTriggerBossEvent, debugDefeatBoss, debugPriestMode,
  debugLevelUp, debugGiveUpgrade, debugFullHeal,
  debugAddMaxHp, debugHurt, debugToggleInvuln, debugClearBullets, debugAddScore, WEAPON_UPGRADES,
} from '../run/debug';
import { BOSS_NAMES, BOSS_ORDER, bossKindForLevel } from '../run/bosses';
import { nextDragTarget } from '../input/drag';
import { ARROW_KEYS, arrowKeyInput } from '../input/keyboard';
import { GameSfx } from '../audio/sfx';
import { makeLeaderboardEntry, recordScore } from '../run/leaderboard';
import { renderResolutionForViewport } from '../render/displayResolution';

const STEP = 1 / 120; // 固定タイムステップ（決定論・当たり判定の安定）
const MAX_FRAME = 0.25; // スパイク時の暴走防止
const GAME_FONT_FAMILY = 'PixelMplus12';

/** PIXIのText生成前に、日本語・英語共通のピクセルフォントを読み込む。 */
async function loadGameFont(): Promise<void> {
  const src = new URL(`${import.meta.env.BASE_URL}font/PixelMplus12-Regular.ttf`, window.location.href).href;
  const face = new FontFace(GAME_FONT_FAMILY, `url(${src})`, { weight: '400 900' });
  try {
    document.fonts.add(await face.load());
  } catch (error) {
    console.warn('Pixel font could not be loaded; using the fallback font.', error);
  }
}

/** public配下のエンティティ画像を読み込み、ピクセル絵向けに最近傍補間へ固定する。 */
async function loadEntityTextures(): Promise<EntityTextures> {
  const assets = [
    ['player', 'player'],
    ['reversa', 'reverser'],
    ['sniper', 'sniper'],
    ['shogun', 'shogun'],
    ['tank', 'tank'],
    ['priest', 'priest'],
  ] as const;
  const loaded = await Promise.all(
    assets.map(([, fileName]) => {
      const src = new URL(`${import.meta.env.BASE_URL}image/${fileName}.png`, window.location.href).href;
      return Assets.load<Texture>(src);
    }),
  );
  const textures = Object.fromEntries(
    assets.map(([key], index) => [key, loaded[index]]),
  ) as unknown as EntityTextures;
  for (const texture of loaded) texture.source.scaleMode = 'nearest';
  return textures;
}

/** PIXIアプリを起動し、入力・デバッグUI・固定ステップのゲームループを接続する。 */
async function main(): Promise<void> {
  await loadGameFont();
  const app = new Application();
  await app.init({
    width: FIELD.w,
    height: FIELD.h,
    background: 0x0b0d12,
    antialias: true,
    resolution: 1,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);
  const canvas = app.canvas as HTMLCanvasElement;
  const entityTextures = await loadEntityTextures();

  // 縦画面をビューポートに収める（スマホ対応）。レイアウト確定前に0にならないよう
  // ResizeObserver で自己修復し、scale が正のときだけ反映する。
  const fit = () => {
    const scale = Math.min(window.innerWidth / FIELD.w, window.innerHeight / FIELD.h);
    if (!(scale > 0)) return;
    const resolution = renderResolutionForViewport(scale, window.devicePixelRatio || 1);
    if (Math.abs(app.renderer.resolution - resolution) > 0.01) {
      app.renderer.resize(FIELD.w, FIELD.h, resolution);
    }
    canvas.style.width = `${Math.floor(FIELD.w * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.h * scale)}px`;
  };
  window.addEventListener('resize', fit);
  new ResizeObserver(fit).observe(document.documentElement);
  fit();

  // スマホの誤操作（スクロール/スワイプ/長押しメニュー/ピンチズーム）を無効化。
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const blockTouch = (e: Event) => {
    const t = e.target as Element | null;
    if (t?.closest?.('#debug')) return; // デバッグUIのタップは通す
    if ((e as { cancelable: boolean }).cancelable) e.preventDefault();
  };
  document.addEventListener('touchstart', blockTouch, { passive: false });
  document.addEventListener('touchmove', blockTouch, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const debug = debugEnabled();
  const renderer = new SessionRenderer(app.stage, entityTextures, debug);
  let session: Session = titleSession();
  const sfx = new GameSfx();
  sfx.reset(session);
  let acc = 0;
  let rankedSession: Session | null = null;

  /** ゲームオーバー時のスコアを一度だけ記録し、端末内TOP10をSessionへ反映する。 */
  const updateLeaderboard = () => {
    if (session.phase !== 'gameover' || rankedSession === session) return;
    rankedSession = session;
    const reachedKind = session.bossKind ?? bossKindForLevel(session.level);
    session.reachedBossName = BOSS_NAMES[reachedKind];
    const entry = makeLeaderboardEntry(session.score, session.reachedBossName, session.priestDefeats);
    const result = recordScore(window.localStorage, entry);
    session.leaderboard = result.entries;
    session.currentRank = result.rank;
  };

  // ドラッグで自機を相対追従。復帰スライド完了時は指へ瞬間移動しないようつかみ直す。
  let dragging = false;
  let pointerActive = false;
  let target: { x: number; y: number } | null = null;
  let grab = { x: 0, y: 0 };
  let finger = { x: 0, y: 0 };
  let wasLocked = false;
  const pressedArrows = new Set<string>();
  /** CSSピクセル上のポインタ座標を、固定サイズのフィールド座標へ変換する。 */
  const toField = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * FIELD.w, y: ((e.clientY - r.top) / r.height) * FIELD.h };
  };
  /** 復帰直後に古い指位置へ瞬間移動しないよう、ドラッグの掴み差分を取り直す。 */
  const regrab = () => {
    const ship = session.world.ship;
    grab = { x: ship.pos.x - finger.x, y: ship.pos.y - finger.y };
    target = { x: ship.pos.x, y: ship.pos.y };
  };
  /** タッチやマウス操作が終了・中断されたときにポインタ状態を消す。 */
  const stopDragging = () => {
    pointerActive = false;
    dragging = false;
    target = null;
    wasLocked = false;
  };
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', (e) => {
    void sfx.unlock();
    canvas.focus();
    if (session.phase === 'title' || session.phase === 'gameover') {
      session = beginSession(); // Tap to Start / リスタート
      sfx.reset(session);
      acc = 0;
      wasLocked = false;
      return;
    }
    if (session.phase === 'paused') {
      resumeSession(session);
      acc = 0;
      stopDragging();
      return;
    }
    const p = toField(e);
    if (session.phase === 'playing') {
      const r = pauseButtonRect();
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        pauseSession(session);
        acc = 0;
        stopDragging();
        return;
      }
    }
    if (session.phase === 'reward') {
      const index = specialRewardCardRects().findIndex((r) =>
        p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (index >= 0 && chooseSpecialUpgrade(session, index)) sfx.play('power-up');
      return;
    }
    pointerActive = true;
    finger = p;
    regrab();
    dragging = session.world.ship.respawnUntil <= session.world.time;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const nextFinger = toField(e);
    if (dragging) {
      target = nextDragTarget(grab, nextFinger);
    }
    finger = nextFinger;
  });
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);

  window.addEventListener('keydown', (e) => {
    if (ARROW_KEYS.has(e.key)) {
      pressedArrows.add(e.key);
      void sfx.unlock();
      e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() !== 'p' && e.key !== 'Escape') return;
    void sfx.unlock();
    if (session.phase === 'playing') pauseSession(session);
    else if (session.phase === 'paused') resumeSession(session);
    else return;
    acc = 0;
    stopDragging();
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (!ARROW_KEYS.has(e.key)) return;
    pressedArrows.delete(e.key);
    e.preventDefault();
  });
  window.addEventListener('blur', () => pressedArrows.clear());

  // デバッグパネル（開発時 or ?debug 付きURL）：任意の動作を好きに発動できる。
  if (debug) {
    const buttons: DebugButton[] = [
      ...BOSS_ORDER.map((kind) => ({ label: `BOSS ${BOSS_NAMES[kind]}`, onClick: () => debugSpawnBossKind(session, kind) })),
      { label: 'ボス撃破', onClick: () => debugDefeatBoss(session) },
      { label: 'ボスイベント発動', onClick: () => debugTriggerBossEvent(session) },
      { label: 'プリーストA 追跡', onClick: () => debugPriestMode(session, 'chase') },
      { label: 'プリーストB 旋回弾', onClick: () => debugPriestMode(session, 'orb') },
      { label: 'プリーストC 反射', onClick: () => debugPriestMode(session, 'reflect') },
      { label: 'Lv+強化', onClick: () => { debugLevelUp(session); sfx.play('power-up'); } },
      { label: '全回復', onClick: () => debugFullHeal(session) },
      { label: '最大HP+1', onClick: () => { debugAddMaxHp(session, 1); sfx.play('power-up'); } },
      { label: '被弾', onClick: () => debugHurt(session) },
      { label: '無敵', onClick: () => debugToggleInvuln(session) },
      { label: '弾消し', onClick: () => debugClearBullets(session) },
      { label: 'スコア+100', onClick: () => debugAddScore(session, 100) },
      { label: 'リスタート', onClick: () => { session = beginSession(); sfx.reset(session); acc = 0; stopDragging(); } },
      ...WEAPON_UPGRADES.map((u) => ({ label: '⚑' + u.name, onClick: () => { debugGiveUpgrade(session, u); sfx.play('power-up'); } })),
    ];
    mountDebugPanel(buttons);
  }

  app.ticker.add((ticker) => {
    if (session.phase === 'playing') {
      const ship = session.world.ship;
      const locked = ship.respawnUntil > session.world.time;
      if (wasLocked && !locked && pointerActive) regrab();
      if (locked) dragging = false;
      else if (pointerActive && !dragging) dragging = true;
      wasLocked = locked;

      acc += Math.min(ticker.deltaMS / 1000, MAX_FRAME);
      const input: ShipInput = dragging && target
        ? { moveX: 0, moveY: 0, target }
        : arrowKeyInput(pressedArrows);
      while (acc >= STEP) {
        stepSession(session, input, STEP);
        acc -= STEP;
        if (session.phase !== 'playing') break;
      }
    } else {
      wasLocked = false;
    }
    updateLeaderboard();
    sfx.update(session);
    renderer.draw(session);
  });
}

void main();
