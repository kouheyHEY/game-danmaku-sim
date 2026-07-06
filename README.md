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

## デプロイ

`main` への push で GitHub Actions が自動ビルドし GitHub Pages へ公開する
（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）。
