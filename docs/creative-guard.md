# Creative Guard の導入

新しいアイデアは `Idea` テンプレートで Issue に残します。現在の制作方針を変える前に、開いている `creative-guard:focus` Issue を一つだけ選び、Outcome・Done when・Scope・Lock until を記入してください。

PR の説明には `Creative Guard Focus: #番号` を1行入れます。緊急で別方向の作業が必要な場合は `Exception` テンプレートで理由と期限を記入し、所有者の承認コメントを得てから `Creative Guard Exception: #番号` を PR に入れます。

この PR をマージした後、4種類の `creative-guard:*` ラベルを作り、Focus Issue を一つ作成してください。試験 PR で check の成功・失敗を確認してから、既定ブランチの ruleset で PR と `check` を必須にします。既存のデプロイ workflow はそのままです。

AI エージェントによるアイデア分類には [共通プロンプト](https://github.com/kouheyHEY/creative-guard/blob/v1.0.1/AI_PROMPT.md)を使えます。判定ルールと例外申請の詳細は [共通仕様](https://github.com/kouheyHEY/creative-guard/blob/v1.0.1/README.md)にあります。
