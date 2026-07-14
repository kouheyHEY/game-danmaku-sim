import { Application } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import type { ShipInput } from '../domain/entities';
import { titleSession, beginSession, stepSession, chooseSpecialUpgrade, type Session } from '../run/session';
import { SessionRenderer, specialRewardCardRects } from '../render/sessionRenderer';
import { mountDebugPanel, debugEnabled, type DebugButton } from '../render/debugPanel';
import {
  debugSpawnBoss, debugSpawnStrongBoss, debugSpawnMob, debugLevelUp, debugGiveUpgrade, debugFullHeal,
  debugAddMaxHp, debugHurt, debugToggleInvuln, debugClearBullets, debugAddScore, WEAPON_UPGRADES,
} from '../run/debug';

const STEP = 1 / 120; // 固定タイムステップ（決定論・当たり判定の安定）
const MAX_FRAME = 0.25; // スパイク時の暴走防止

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: FIELD.w,
    height: FIELD.h,
    background: 0x0b0d12,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);
  const canvas = app.canvas as HTMLCanvasElement;

  // 縦画面をビューポートに収める（スマホ対応）。レイアウト確定前に0にならないよう
  // ResizeObserver で自己修復し、scale が正のときだけ反映する。
  const fit = () => {
    const scale = Math.min(window.innerWidth / FIELD.w, window.innerHeight / FIELD.h);
    if (!(scale > 0)) return;
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

  const renderer = new SessionRenderer(app.stage);
  let session: Session = titleSession();
  let acc = 0;

  // ドラッグで自機を相対追従。復帰スライド完了時は指へ瞬間移動しないようつかみ直す。
  let dragging = false;
  let pointerActive = false;
  let target: { x: number; y: number } | null = null;
  let grab = { x: 0, y: 0 };
  let finger = { x: 0, y: 0 };
  let wasLocked = false;
  const toField = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * FIELD.w, y: ((e.clientY - r.top) / r.height) * FIELD.h };
  };
  const regrab = () => {
    const ship = session.world.ship;
    grab = { x: ship.pos.x - finger.x, y: ship.pos.y - finger.y };
    target = { x: ship.pos.x, y: ship.pos.y };
  };

  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (session.phase === 'title' || session.phase === 'gameover') {
      session = beginSession(); // Tap to Start / restart
      acc = 0;
      wasLocked = false;
      return;
    }
    if (session.phase === 'reward') {
      const p = toField(e);
      const index = specialRewardCardRects().findIndex((r) =>
        p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (index >= 0) chooseSpecialUpgrade(session, index);
      return;
    }
    pointerActive = true;
    finger = toField(e);
    regrab();
    dragging = session.world.ship.respawnUntil <= session.world.time;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    finger = toField(e);
    if (dragging) target = { x: finger.x + grab.x, y: finger.y + grab.y };
  });
  const endDrag = () => {
    pointerActive = false;
    dragging = false;
    target = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // デバッグパネル（開発時 or ?debug 付きURL）：任意の動作を好きに発動できる。
  if (debugEnabled()) {
    const buttons: DebugButton[] = [
      { label: 'ボス出現', onClick: () => debugSpawnBoss(session) },
      { label: '強敵ボス出現', onClick: () => debugSpawnStrongBoss(session) },
      { label: '雑魚出現', onClick: () => debugSpawnMob(session) },
      { label: 'Lv+強化', onClick: () => debugLevelUp(session) },
      { label: '全回復', onClick: () => debugFullHeal(session) },
      { label: '最大HP+1', onClick: () => debugAddMaxHp(session, 1) },
      { label: '被弾', onClick: () => debugHurt(session) },
      { label: '無敵', onClick: () => debugToggleInvuln(session) },
      { label: '弾消し', onClick: () => debugClearBullets(session) },
      { label: 'スコア+100', onClick: () => debugAddScore(session, 100) },
      { label: 'リスタート', onClick: () => { session = beginSession(); acc = 0; wasLocked = false; } },
      ...WEAPON_UPGRADES.map((u) => ({ label: '⚑' + u.name, onClick: () => debugGiveUpgrade(session, u) })),
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
      const input: ShipInput = dragging && target ? { moveX: 0, moveY: 0, target } : { moveX: 0, moveY: 0 };
      while (acc >= STEP) {
        stepSession(session, input, STEP);
        acc -= STEP;
        if (session.phase !== 'playing') break;
      }
    } else {
      wasLocked = false;
    }
    renderer.draw(session);
  });
}

void main();
