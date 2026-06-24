import { Application } from 'pixi.js';
import { FIELD } from '../spec/stage0';
import type { ShipInput } from '../domain/entities';
import { startRun, stepRun, chooseReward, type Run } from '../run/run';
import { RunRenderer, rewardCardRects } from '../render/runRenderer';
import { createKeyboard } from '../input/keyboard';

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
  const hint = document.getElementById('hint');
  const focusGame = () => {
    canvas.focus();
    hint?.classList.add('hidden');
  };
  window.addEventListener('focus', () => hint?.classList.add('hidden'));

  // 縦画面をビューポートに収める（スマホ対応）。
  const fit = () => {
    const controlsH = document.getElementById('controls')?.offsetHeight ?? 0;
    const scale = Math.min(window.innerWidth / FIELD.w, (window.innerHeight - controlsH - 24) / FIELD.h);
    canvas.style.width = `${Math.floor(FIELD.w * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.h * scale)}px`;
  };
  window.addEventListener('resize', fit);
  fit();

  const kb = createKeyboard();
  const renderer = new RunRenderer(app.stage);

  let run: Run = startRun();
  let acc = 0;

  // ドラッグで自機を相対追従（指で隠れないようつかみ位置を保持）。reward 中はカード選択。
  let dragging = false;
  let target: { x: number; y: number } | null = null;
  let grab = { x: 0, y: 0 };
  const toField = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * FIELD.w, y: ((e.clientY - r.top) / r.height) * FIELD.h };
  };
  const rewardHitTest = (p: { x: number; y: number }): number =>
    rewardCardRects().findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', (e) => {
    focusGame();
    if (run.phase === 'reward') {
      const i = rewardHitTest(toField(e));
      if (i >= 0) chooseReward(run, i);
      return;
    }
    dragging = true;
    const p = toField(e);
    grab = { x: run.world.ship.pos.x - p.x, y: run.world.ship.pos.y - p.y };
    target = { x: run.world.ship.pos.x, y: run.world.ship.pos.y };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toField(e);
    target = { x: p.x + grab.x, y: p.y + grab.y };
  });
  const endDrag = () => {
    dragging = false;
    target = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  if (document.hasFocus()) focusGame();

  app.ticker.add((ticker) => {
    if (run.phase === 'reward') {
      for (const key of ['1', '2', '3']) if (kb.pressed(key)) chooseReward(run, Number(key) - 1);
    }
    if ((run.phase === 'gameover' || run.phase === 'win') && kb.pressed('r')) {
      run = startRun();
      acc = 0;
    }

    if (run.phase === 'fighting') {
      acc += Math.min(ticker.deltaMS / 1000, MAX_FRAME);
      const input: ShipInput = dragging && target ? { moveX: 0, moveY: 0, target } : kb.sample();
      while (acc >= STEP) {
        stepRun(run, input, STEP);
        acc -= STEP;
        if (run.phase !== 'fighting') break;
      }
    }

    renderer.draw(run);
  });
}

void main();
