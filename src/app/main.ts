import { Application } from 'pixi.js';
import { FIELD, type Stage } from '../spec/stage0';
import { stage1 } from '../spec/stage1';
import { stage2 } from '../spec/stage2';
import { stage3 } from '../spec/stage3';
import { step } from '../domain/world';
import type { Outcome } from '../domain/objective';
import type { ShipInput } from '../domain/entities';
import { Renderer, type View } from '../render/renderer';
import { createKeyboard } from '../input/keyboard';

const STEP = 1 / 120; // 固定タイムステップ（決定論・当たり判定の安定）
const MAX_FRAME = 0.25; // スパイク時の暴走防止

const STAGES: Record<string, () => Stage> = {
  '1': stage1, // ① avoid → ② catch（シームレス反転）
  '2': stage2, // ③ 敵に当てる
  '3': stage3, // ④ 撃つが当ててはいけない
};

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
  const appEl = document.getElementById('app')!;
  appEl.appendChild(app.canvas);

  const canvas = app.canvas as HTMLCanvasElement;
  const hint = document.getElementById('hint');
  const focusGame = () => {
    canvas.focus();
    hint?.classList.add('hidden');
  };
  window.addEventListener('focus', () => hint?.classList.add('hidden'));

  // 縦画面をビューポートに収める（スマホ対応）。CSS サイズだけ変え、内部解像度は固定。
  const fit = () => {
    const controlsH = document.getElementById('controls')?.offsetHeight ?? 0;
    const availW = window.innerWidth;
    const availH = window.innerHeight - controlsH - 24;
    const scale = Math.min(availW / FIELD.w, availH / FIELD.h);
    canvas.style.width = `${Math.floor(FIELD.w * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.h * scale)}px`;
  };
  window.addEventListener('resize', fit);
  fit();

  const kb = createKeyboard();

  let stageKey = '1';
  let stage: Stage = STAGES[stageKey]();
  let outcome: Outcome = 'ongoing';
  let acc = 0;

  const load = (key: string) => {
    stageKey = key;
    stage = STAGES[key]();
    outcome = 'ongoing';
    acc = 0;
  };

  // タッチ/マウスのドラッグで自機を相対追従させる（指で隠れないようつかみ位置を保持）。
  let dragging = false;
  let target: { x: number; y: number } | null = null;
  let grab = { x: 0, y: 0 };
  const toField = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * FIELD.w,
      y: ((e.clientY - r.top) / r.height) * FIELD.h,
    };
  };
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', (e) => {
    focusGame();
    dragging = true;
    const p = toField(e);
    grab = { x: stage.world.ship.pos.x - p.x, y: stage.world.ship.pos.y - p.y };
    target = { x: stage.world.ship.pos.x, y: stage.world.ship.pos.y };
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

  const renderer = new Renderer(app.stage);

  app.ticker.add((ticker) => {
    for (const key of Object.keys(STAGES)) {
      if (kb.pressed(key) && key !== stageKey) load(key);
    }
    if (kb.pressed('r') && outcome !== 'ongoing') load(stageKey);

    if (outcome === 'ongoing') {
      acc += Math.min(ticker.deltaMS / 1000, MAX_FRAME);
      const input: ShipInput =
        dragging && target ? { moveX: 0, moveY: 0, target } : kb.sample();
      while (acc >= STEP) {
        const events = step(stage.world, input, STEP);
        for (const ev of events) stage.director.onCollision(ev, stage.score);
        outcome = stage.director.update(stage.world, stage.score);
        acc -= STEP;
        if (outcome !== 'ongoing') break;
      }
    }

    const view: View = {
      mode: stage.director.current().mode,
      telegraph: stage.director.telegraph(stage.world),
    };
    renderer.draw(stage.world, stage.score, outcome, view);
  });
}

void main();
