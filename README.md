# danmaku-sim

弾幕シューティング × ローグライト。**敵を1体ずつ撃破し、撃破ごとに3択強化で自機を育てて**
敵の列を踏破する。自機HPが尽きたらラン終了。

🎮 **プレイ：** https://kouheyhey.github.io/game-danmaku-sim/

## 操作

- 移動：ドラッグ（スマホ可）／ 矢印・WASD
- 発射：自動
- 強化選択：`1` `2` `3` キー または カードをタップ
- リスタート：`R`

## 流れ

敵を倒す → 3択から強化を1つ選ぶ（拡散・連射・威力・最大HP・回復 など）→ 次の敵へ →
…→ 全部倒せば踏破。敵は段階的に強くなり、弾幕も奇数弾/偶数弾/回転/ランダムと変化する。

> ベースには「誰が撃つか × 当てる/避ける」の2×2で勝敗ルールが**反転**する仕組みがあり
> （[docs/01_skeleton.md](docs/01_skeleton.md)）、これは今後「特殊な敵／イベント」として差し込む。
> ローグライト化の設計は [docs/02_roguelite.md](docs/02_roguelite.md)。

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
