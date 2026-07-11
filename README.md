# danmaku-sim

**Tap to Start → ひたすら弾を避けるだけ**のエンドレス弾幕回避。自機は自動発射。
たまに出るボスを倒すと **HP+1回復＆弾幕がランダム強化**。避けた弾の数がスコア。

🎮 **プレイ：** https://kouheyhey.github.io/game-danmaku-sim/

## 操作

- **タップでスタート／リスタート**
- **ドラッグで移動**（避ける）
- 発射・強化は自動

## 流れ

弾を避け続ける（右上に避けた弾数＝スコア）→ たまにボスが出現 → 自弾で撃破すると
HP+1 と弾幕強化（弾数/連射/威力/弾速/拡散をランダム）→ だんだん激しくなる。HP0 で終了。

> 設計メモ：[docs/03_endless.md](docs/03_endless.md)。
> 反転(2×2)やローグライト版の名残は [docs/01_skeleton.md](docs/01_skeleton.md) / [docs/02_roguelite.md](docs/02_roguelite.md)。

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm test         # ドメインの仕様テスト
npm run build    # 本番ビルド（dist/）
```

設計の骨格は [docs/01_skeleton.md](docs/01_skeleton.md) を参照。
ドメイン（`src/domain`）は描画(PixiJS)非依存・決定論で、ブラウザ無しでテストできる。

### デバッグパネル（dev-loop 組み込み）

任意の動作を好きに発動できるパネルを備える。左上の **🐞 DEBUG** を開くと、
ボス/雑魚出現・Lv+強化・全回復・最大HP+1・被弾・無敵・弾消し・スコア加算・リスタート・
各武器強化の個別付与、が押せる。

- **表示条件**：`npm run dev`（`import.meta.env.DEV`）なら常時表示。本番でも URL に **`?debug`** を付けると表示（例：`…github.io/game-danmaku-sim/?debug`）。通常プレイには出ない。
- アクション本体は [src/run/debug.ts](src/run/debug.ts)（`Session` を操作する純関数群、`tests/run/debug.test.ts` でテスト）。UI は [src/render/debugPanel.ts](src/render/debugPanel.ts)。
- 新しい検証項目は `debug.ts` に関数を足し、`main.ts` のボタン配列に1行追加するだけで増やせる（＝開発ループに組み込み済み）。

## デプロイ

`main` への push で GitHub Actions が自動ビルドし GitHub Pages へ公開する
（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）。
