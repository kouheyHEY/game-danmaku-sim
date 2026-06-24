# 骨格設計（最小ドメイン駆動 ＋ 仕様駆動）

> 前提となるアイデアは [00_idea.md](00_idea.md)。本書はそれを「動く骨格」に翻訳する。

## 0. 確定した前提

| 軸 | 決定 | 設計への影響 |
|---|---|---|
| 技術 | **Web / TypeScript / PixiJS** | 描画はPixiに隔離。ドメインは純粋TSで決定論的に書く。 |
| プレイ形態 | **1人プレイ（対AI・ステージ制）** | 敵＝事前設計の弾幕パターン＋簡易AI。ネット同期不要 → ドメイン最小。 |
| モード反転 | **バトル中にシームレス反転** | Objective（勝敗ルール）を時間で差し替える「進行（Director）」が必須。 |

---

## 1. 設計の核 — 「反転」は本質、「弾幕」は土台

アイデアの3パターンは、独立した2軸の掛け合わせに分解できる。

| | 当たってはいけない（avoid） | 当たらねばならない（hit） |
|---|---|---|
| **敵が撃つ** | ① 通常の弾幕STG | ② 逆弾幕（敵弾に当たりに行く） |
| **自分が撃つ** | ④ 撃つが当ててはいけない | ③ 弾幕を出して敵に当てる |

`誰が撃つか（firer） × 当てるべきか避けるべきか（goal）` の2×2。

**したがって本質は「弾幕」そのものではなく、弾幕シミュレーションの上で勝敗条件を反転させることにある。**
この見立てから、設計上の最重要決定が1つ導かれる：

> **シミュレーションは「誰と誰が当たったか」という事実だけを出す。
> その当たりが「良い」か「悪い」かの意味づけは、差し替え可能な Objective が持つ。**

新モードは「新しいObjectiveを1つ書く」だけで増える。これが最小ドメインの効き所。

---

## 2. レイヤリング — ドメインをPixiから守る

```
input ──▶ domain（純粋・決定論・Pixi非依存）──▶ render（PixiJS）
                     ▲ ここだけをテストする
```

- **domain** … 状態と規則。`step(dt, input)` で進む。乱数はシード付き。Pixiもブラウザも一切importしない。
- **render** … `World` を読んで描くだけ。状態を持たない／変えない。
- **input / app** … キー入力を `ShipInput` に変換し、ループを配線する糊。

この境界が崩れなければ、ゲームの面白さ（＝反転のフェアさと気持ちよさ）を**ブラウザを開かずテストできる**。

---

## 3. 最小ドメインモデル（型スケッチ）

実装の確定形ではなく、要素と関係を固定するための骨。

```ts
// ----- 値 -----
type Vec2 = { x: number; y: number };
type Faction = 'player' | 'enemy';
type EntityId = number;

// ----- 場（Field）-----
interface World {
  time: number;          // 固定dtで進める（決定論）
  rng: Rng;              // シード付き乱数
  bounds: Rect;
  ship: Ship;            // 自機は常に1体
  enemies: Enemy[];
  bullets: Bullet[];
}

interface Ship   { pos: Vec2; vel: Vec2; hitRadius: number; }      // 食らい判定は小さく（弾幕STG流）
interface Enemy  { id: EntityId; pos: Vec2; hitRadius: number; hp?: number; }
interface Bullet { id: EntityId; pos: Vec2; vel: Vec2; radius: number; owner: Faction; }

// ----- 弾幕パターン（発生規則）-----
// 時間とソース位置から弾を生むだけの純粋関数。AIや見た目を含まない。
interface Pattern {
  emit(t: number, dt: number, source: Vec2, rng: Rng): BulletSpawn[];
}

// ----- 衝突（事実だけ。良し悪しは判断しない）-----
type CollisionEvent =
  | { kind: 'bullet-hits-ship';  bullet: EntityId; owner: Faction }
  | { kind: 'bullet-hits-enemy'; bullet: EntityId; enemy: EntityId; owner: Faction };

// ----- 進行の一歩 -----
// 副作用なし。新しい状態と、その間に起きたイベントを返す。
function step(w: World, input: ShipInput, dt: number): { world: World; events: CollisionEvent[] };
```

ポイント：`step` は衝突を**イベントとして外に出すだけ**。そのイベントを得点にするか失点にするかは次章の Objective が決める。

---

## 4. 反転の仕組み — Mode / Objective / Director / Telegraph

### 4.1 Mode（2軸）
```ts
type Firer = 'enemy' | 'player';   // 主役の弾を撃つのは誰か
type Goal  = 'avoid' | 'hit';      // その弾は避ける / 当てに行くべきか
interface Mode { firer: Firer; goal: Goal; }
// ①{enemy,avoid} ②{enemy,hit} ③{player,hit} ④{player,avoid}
```

### 4.2 Objective（勝敗の意味づけ）
衝突イベントを「良い当たり／悪い当たり」に翻訳し、勝敗を判定する。**モードごとに1つ。** これがゲームの差し替え単位。
```ts
interface Objective {
  mode: Mode;
  onCollision(e: CollisionEvent, score: Score): void;  // 得点 or 失点へ翻訳
  evaluate(score: Score, w: World): 'ongoing' | 'cleared' | 'failed';
}
```

### 4.3 Director（進行）— シームレス反転の主役
バトルを「フェーズの列」として持ち、時間や達成条件で**今アクティブなObjectiveを差し替える**。
```ts
interface Phase {
  id: string;
  objective: Objective;     // この区間の勝敗解釈
  patterns: PatternRef[];   // この区間に走る弾幕
  telegraph: Telegraph;     // 反転の予告（次項・必須）
  until: PhaseEnd;          // 次へ進む条件（経過時間 / クリア / 撃破 …）
}
interface BattleSpec { id: string; phases: Phase[]; }
```

### 4.3.1 遷移ルール（確定）— 「全モード①開始・無弾の瞬間に切替」
シームレス反転は許すが、**切替は必ず弾のない瞬間に行う**。実装は次の通り：

- **全ステージ① 弾幕で開始**（基本のスタート地点を統一）。
- 実モードの間に必ず **lull フェーズ（`pattern=null`）** を挟む。lull に入った瞬間に**敵の発射を止め（`firingEnabled=false`）**、画面の**敵弾が消えてから**（`whenClear`）次モードへ進む。
- こうすると **どのモードからどのモードへ遷移しても、切替時は必ず弾がない** → 遷移の安全性が構造的に保証される。
- **敵の発射はモード依存**：① 弾幕（回転n-way）／②③ 通常の一方向発射／④ 発射なし。
- lull の間は `transition` Objective（失点も達成もしない）で、次モードを Telegraph 予告する。

### 4.3.2 弾幕パターンのライブラリ（敵・自機 共通）
弾の出し方は `Pattern` 工場として束ね、敵にも自機にも差し替えられる。共通コア `fan` の
偶奇・回転・揺らぎの組合せで主要な型を表現する：
- `oddSpread`（奇数弾＝正面に1発）／`evenSpread`（偶数弾＝**正面に隙間**）
- `rotating`（回転弾幕）／`randomSpread`（ランダム弾）／`oneWay`（一方向）

**自機の武器も `Ship.weapon: Pattern`** で差し替え可能。④「当ててはいけない」では
`evenSpread`（正面に隙間）を使い、**敵を正面の隙間に収め続ければ当たらない＝制御して避ける**設計にした。

### 4.4 Telegraph（予告）— シームレス反転を選んだ責任
バトル中に勝敗ルールが変わるなら、**変わる前にプレイヤーへ伝えねば理不尽になる。**
これは演出ではなく**ドメインの公平性要件**として骨格に入れる。
現在は上記 lull（発射停止＋無弾＋次モード予告）がその役割を担う。
```ts
interface Telegraph {
  leadTime: number;   // 反転の何秒前から予告するか（適応の猶予）
  cue: 'color-flip' | 'flash' | 'slowmo' | string;  // 何で知らせるか
}
```
> 設計則：**「避ける」と「当てに行く」の切替は、色やフレームで事前に必ず告知し、適応のための猶予（leadTime）を与える。** 不意打ちで殺さない／当てさせない。

---

## 5. 仕様駆動 — バトルは「宣言的データ」

弾幕パターンもバトル進行も、コードではなく**データ（spec）**として書く。

```ts
// 例：①通常 → ②逆弾幕 へ1回シームレス反転する最小バトル
const battle01: BattleSpec = {
  id: 'tutorial-flip',
  phases: [
    { id: 'avoid', objective: avoidEnemyBullets, patterns: ['aimed-spread'],
      telegraph: { leadTime: 0, cue: 'none' }, until: { afterSeconds: 15 } },
    { id: 'catch', objective: catchEnemyBullets, patterns: ['slow-wall'],
      telegraph: { leadTime: 1.5, cue: 'color-flip' }, until: { afterSeconds: 15 } },
  ],
};
```

### テスト戦略（決定論ゆえに可能）
`step` が決定論的（固定dt＋シード乱数）なので、**入力列を流して結果を断言**できる。
- given：`BattleSpec` ＋ 台本化した `ShipInput` の時系列
- then：最終結果が `cleared` / `failed`、主要不変条件（例：予告中は反転しない）を満たす

ブラウザ不要・1msで回る仕様テストが、面白さの土台を守る回帰網になる。

---

## 6. ディレクトリ構成案

```
src/
  domain/        # 純粋TS・決定論。Pixi/DOM非依存
    world.ts  entities.ts  pattern.ts  collision.ts
    objective.ts  director.ts  rng.ts
  spec/          # 宣言的データ
    patterns/    # 弾幕パターン
    battles/     # バトル進行（フェーズ列）
  render/        # PixiJS。worldを描くだけ
  input/         # key -> ShipInput
  app/           # step -> render のループ配線
tests/
  domain/        # 決定論シミュレーションの仕様テスト
docs/            # 00_idea, 01_skeleton, ...
```

---

## 7. 最小マイルストーン（垂直スライス）

各段で「動いて触れる」ことを死守する。最大のリスク＝**シームレス反転は面白くフェアか**を最速で検証する順に並べる。

| # | できること | 検証する仮説 |
|---|---|---|
| **M0** ✅ | 自機が動く＋敵弾1パターン＋①回避だけ成立 | ドメイン⇄Pixiの配線が通る |
| **M1** ✅ | Director導入。①→②へ**1回だけ**シームレス反転＋Telegraph | ★**反転は面白くフェアか**（最重要） |
| **M2** ✅ | ③④（自機が撃つ側）を追加。2×2が揃う | 主体反転が同じ骨格に乗るか |
| **M3** | バトル/パターンを外部spec化＋仕様テスト整備 | 増やすコストが「データ1枚」に収まるか |

> M1が本プロジェクトの賭けの中心。骨格はM1へ最短到達できるよう、M0で `Objective` と `Director` の差し込み口だけは先に空けておく。

---

## 8. 未決事項（次に潰す）

- 自機が撃つ際の操作（③④）：自動連射か、撃つ/撃たないをプレイヤーが選ぶか。④「当ててはいけない」は**撃つ責任**が要るので操作設計と直結。
- 敗北条件の粒度：HP制か一撃ミスか、モードごとに変えるか。
- Telegraph の表現（色/音/スローモー）の既定値。
- 簡易AIの最小形（②③で敵が動く必要があるか、初期は固定でよいか）。
