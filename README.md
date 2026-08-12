# danmaku-sim

**v1.0.0** — 避けて、倒して、弾幕を育てるボス連戦型の縦画面シューティング正式版。

## Pause

- 画面上部の `II` で一時停止し、停止中は画面タップで再開
- PCでは `P` または `Esc` でも一時停止・再開

**Tap to Start → ひたすら弾を避けるだけ**のエンドレス弾幕回避。自機は自動発射。
次々に出る大ボスを倒すと **HP+1回復＆特別強化の2択**。スコアは「与えたダメージ＋かすり得点」×倍率で、プリースト撃破ごとに倍率が1.2倍。

🎮 **プレイ：** https://kouheyhey.github.io/game-danmaku-sim/

## 操作

- **タップでスタート／リスタート**
- **ドラッグで移動**（避ける）
- **PCでは十字キーでも移動**
- 発射・強化は自動

## 流れ

大ボスの弾を避け続ける（右上にかすり数・倍率・スコア）→ 自弾で撃破すると
HP+1 と特別強化の2択 → だんだん激しくなる。HP0 で終了。
ゲームオーバー時には、順位・スコア・到達ボス・転生回数を端末内TOP10へ記録する。

すべてのボスは専用弾幕を持つ大ボス。撃破するとゲームが一時停止して特別強化が2つ表示される。
どちらかをタップすると強化を獲得し、進行を再開する。
武器強化にはレベルと上限があり、上限後は「凝縮」で対象能力を初期値へ戻し、蓄積倍率を威力へ変換して再育成できる。ライフコアは上限なし。

> 設計メモ：[docs/03_endless.md](docs/03_endless.md)。
> 特徴ボス仕様：[docs/04_bosses.md](docs/04_bosses.md)。
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
ボス出現・Lv+強化・全回復・最大HP+1・被弾・無敵・弾消し・スコア加算・リスタート・
各武器強化の個別付与、が押せる。

- **表示条件**：`npm run dev`（`import.meta.env.DEV`）なら常時表示。本番でも URL に **`?debug`** を付けると表示（例：`…github.io/game-danmaku-sim/?debug`）。通常プレイには出ない。
- 通常進行自体が大ボス連戦のため、`?debug`でも通常URLでもゲーム内容は同じ。
- アクション本体は [src/run/debug.ts](src/run/debug.ts)（`Session` を操作する純関数群、`tests/run/debug.test.ts` でテスト）。UI は [src/render/debugPanel.ts](src/render/debugPanel.ts)。
- 新しい検証項目は `debug.ts` に関数を足し、`main.ts` のボタン配列に1行追加するだけで増やせる（＝開発ループに組み込み済み）。

## デプロイ

`main` への push で GitHub Actions が自動ビルドし GitHub Pages へ公開する
（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）。

itch.io向けのカバー画像・説明文・HTML5 ZIPは、v1.0.0公開成果物として `release/` に生成する。
素材とライセンスは [docs/credits.md](docs/credits.md) を参照。
