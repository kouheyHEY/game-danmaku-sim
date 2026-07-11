export interface DebugButton {
  label: string;
  onClick: () => void;
}

/** デバッグパネルを表示すべきか（開発サーバ or ?debug 付きURL）。 */
export function debugEnabled(): boolean {
  return import.meta.env.DEV || /[?&]debug\b/.test(location.search);
}

const STYLE = `
#debug { position: fixed; top: 6px; left: 6px; z-index: 9999; font: 11px system-ui, sans-serif; touch-action: auto; }
#debug .bar { display: inline-flex; gap: 6px; align-items: center; }
#debug button { font: 11px system-ui, sans-serif; color: #e6ebf5; background: #1b2130; border: 1px solid #3b4253; border-radius: 5px; padding: 4px 7px; cursor: pointer; }
#debug button:active { background: #2a3346; }
#debug .toggle { background: #2b2130; border-color: #6b3b53; }
#debug .body { display: none; flex-wrap: wrap; gap: 4px; max-width: 230px; margin-top: 5px; padding: 6px; background: rgba(11,13,18,0.9); border: 1px solid #232a3a; border-radius: 6px; }
#debug .body.open { display: flex; }
`;

/** デバッグパネルをDOMに生成する。ボタンはタップ/クリックで即発火。 */
export function mountDebugPanel(buttons: DebugButton[]): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'debug';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const toggle = document.createElement('button');
  toggle.className = 'toggle';
  toggle.textContent = '🐞 DEBUG';
  bar.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'body';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      b.onClick();
    });
    body.appendChild(btn);
  }

  toggle.addEventListener('click', () => body.classList.toggle('open'));

  panel.appendChild(bar);
  panel.appendChild(body);
  document.body.appendChild(panel);
}
