# Claude Code実装プロンプト ―（成果物⑨）

各Sprint開始時に、以下をそのままClaude Codeセッションへ貼る。`{ }` 編集不要（完成版）。
前提: リポジトリのクローンとnpm利用可能。プロンプトはP6（実装依頼）形式に準拠。

---

## Sprint M0-S1 用プロンプト

```
あなたはこのプロジェクトの実装担当である。docs/ai-kit/01-master-prompt.md の技術規約と
docs/impl/m0/ の実装文書群（01〜08）に従え。

実装対象: Sprint M0-S1「リポジトリ基盤」。
仕様書: docs/impl/m0/02-architecture.md（§1フォルダ構成・§4依存規則・§5lint規約）。
実装順序とコミット: docs/impl/m0/06-implementation-order.md および 07-commit-plan.md の C-01〜C-05 に厳密に従え。
コミットは1ステップ1コミット。各コミット前に npm run verify（その時点で存在する検査すべて）を通せ。

変更可能範囲: リポジトリルートの設定ファイル群、packages/core・packages/cli・tools/audit の骨格、
scripts/verify.sh、tools/eslint-rules/。docs/ 以下は実装報告書以外変更禁止。
凍結API: docs/ledgers/ledger-frozen.md 記載の設計書群（変更禁止。矛盾を見つけたらCR起票して停止）。

技術規約: TypeScript strict／層分離（Domain→App→Infra→Presentation、逆依存禁止）／
Composition Rootでのみ配線／any禁止／Math.random禁止／マジックナンバー禁止／
アルファベット順import／新規ファイル冒頭に「// 責務: 」コメント。

完了の定義: C-05完了時点で npm run verify（typecheck→lint→depcruise→test）が全通過。
規約違反サンプル（any・Math.random・依存逆行・責務コメント欠落）がそれぞれ検査で落ちることを
確認するテストを一時的に作成し、確認後削除した記録をコミットメッセージに残せ。

仕様に曖昧さを見つけたら、最も保守的な解釈で実装し「解釈記録」として
docs/impl/m0/report-m0.md（新規作成可）に残せ。仕様を黙って拡張するな。
```

## Sprint M0-S2 用プロンプト

```
あなたはこのプロジェクトの実装担当である。docs/ai-kit/01-master-prompt.md の技術規約と
docs/impl/m0/ の実装文書群に従え。前提: M0-S1完了（npm run verify がグリーン）。

実装対象: Sprint M0-S2「パックスキーマ型＋検証器」。
仕様書（正）: docs/design/world-sim-packschema-design-v1.md §2（型）・§4（検証4類）、
JSON構造は docs/impl/m0/05-data-structures.md §1〜§3、クラス責務は 03-class-design.md §1〜§7。
実装順序とコミット: 06-implementation-order.md／07-commit-plan.md の C-06〜C-12。

変更可能範囲: packages/core/src、packages/cli/src、packs/fixtures/、scripts/verify.sh（validate-pack追加のみ）。
凍結API: 凍結設計書群。特にスキーマ設計書の enum値・節構成を変えるな（フィールド追加すら本Sprintでは不要のはず。
必要を感じたらCR起票して停止）。

絶対規則:
- InitialRelation.kind は「血縁・婚姻・師弟・同僚」の4値列挙。それ以外が書けない型にせよ（白紙原則の構造的強制）。
- WorldPack型ツリーは全てreadonly。可変状態を持たせるな。
- 題テンプレのパーサは意図的に貧しく作れ: プレースホルダ置換のみを受理し、条件分岐・演算は構文エラー（凍結条件）。
- domain層からNode API（fs/path等）を参照するな（depcruiseが落とす）。
- WorldEvent/EventBusは型定義のみ。実装を書き始めたら停止せよ（M1の範囲）。

完了の定義: C-12完了時点で、逐条突合テスト（スキーマ§2全節⇔型）・検証4類の拒否テスト・
ミニパックのE2E検証（CLI終了コード0）・npm run verify 全通過。
docs/impl/m0/08-dod.md の「パックスキーマ」節の項目を自己チェックし、結果を実装報告書に記せ。
```

## Sprint M0-S3 用プロンプト

```
あなたはこのプロジェクトの実装担当である。docs/ai-kit/01-master-prompt.md の技術規約と
docs/impl/m0/ の実装文書群に従え。前提: M0-S2完了。

実装対象: Sprint M0-S3「固有名詞監査＋検証ゲート統合」。
仕様書（正）: docs/design/world-sim-detector-spec-v1.md §5.1（固有名詞監査の要件）、
クラス責務は docs/impl/m0/03-class-design.md §8、出力形式は 05-data-structures.md §4。
実装順序とコミット: 06-implementation-order.md／07-commit-plan.md の C-13〜C-16。

変更可能範囲: tools/audit/src、scripts/verify.sh、docs/impl/m0/report-m0.md、docs/ledgers/（C-16の記帳のみ）。
凍結API: packages/core の公開型（本Sprintで変更禁止。監査はcoreの型を読み取り専用で利用する）。

絶対規則:
- 禁止リストはパックの語彙・実体名から自動生成。手書きの禁止リストファイルを作るな（パックが唯一の真実源）。
- 照合は完全一致トークン（識別子・文字列リテラル・コメント）。部分一致にするな（偽陽性の洪水になる）。
- 走査対象は packages/*/src。packs/・docs/・tools/ 自身は対象外。
- 監査の検出ゼロ＝正常終了0、検出あり＝非ゼロ終了。

完了の定義: C-16完了時点で、混入自己試験の通過記録・verify最終形
（typecheck→lint→depcruise→test→validate-pack→audit-lexicon）の全通過・
docs/impl/m0/08-dod.md 全項目のチェック・実装報告書の完成・
ledger-frozen.md への凍結API記帳（パックスキーマ型一式・WorldEvent封筒・EventBusインターフェース）。
これをもってM0完了である。M1の実装を始めるな（M1はG11イベントスキーマ設計ラウンドの完了が前提）。
```
