# danmaku-sim

弾幕シューティングをベースに、**バトル中に勝敗ルールが反転する**ゲームの試作。
「誰が撃つか × 当てるべきか避けるべきか」の2×2でモードが切り替わる。

🎮 **プレイ：** https://kouheyhey.github.io/game-danmaku-sim/

## 操作

- 移動：ドラッグ（スマホ可）／ 矢印・WASD
- 発射：自動
- ステージ切替：`1` ①→②反転 ／ `2` ①→③ ／ `3` ①→④ ／ リトライ：`R`

## モード（2×2）

| | 当たってはいけない | 当たらねばならない |
|---|---|---|
| **敵が撃つ** | ① 通常弾幕 | ② 逆弾幕（当たりに行く） |
| **自分が撃つ** | ④ 当ててはいけない | ③ 敵に当てる |

遷移はいつも「弾のない瞬間」に行う（敵の発射を止め、画面の弾が消えてから切替）。

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
