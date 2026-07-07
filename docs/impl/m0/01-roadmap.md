# M0実装ロードマップ ―（成果物①）

対象: マイルストーンM0「世界パックスキーマ凍結＋固有名詞監査の機械化」（フローチャート§2、比重 設計8:実装1:検証1の実装・検証部分）
凍結仕様: world-sim-packschema-design-v1.md（型の元本）／world-sim-detector-spec-v1.md §5.1（固有名詞監査）
実装者: Claude Code（Sonnet）。本ロードマップと同階層の 02〜09 だけで実装可能なこと。

---

## Sprint構成（3スプリント、依存順）

```
M0-S1 リポジトリ基盤 ──▶ M0-S2 パックスキーマ型＋検証器 ──▶ M0-S3 固有名詞監査＋検証ゲート統合
```

---

## M0-S1: リポジトリ基盤

- **目的**: 技術規約（TypeScript strict／層分離／規約lint）が**機械検査として**稼働する空のコードベースを作る。以後の全コミットはこの検査群を通過し続ける。
- **実装内容**:
  1. npm workspaces モノレポ（`packages/core`, `packages/cli`, `tools/audit`）
  2. TypeScript strict 設定（`tsconfig.base.json`、各パッケージが継承）
  3. ESLint（flat config）: `any`禁止・`Math.random`禁止・import順アルファベット・ファイル冒頭責務コメント必須（カスタムルール）
  4. dependency-cruiser: 層分離規則（02-architecture.md §4）の機械検査
  5. vitest 設定
  6. `scripts/verify.sh`: 型検査→lint→依存検査→テストの直列実行（この時点で全てグリーン）
- **完了条件**: `npm run verify` が空パッケージ状態で全通過。**規約違反を意図的に書いた自己試験ファイル**（any使用・Math.random使用・依存逆行）がそれぞれ検査で落ちることをテストで確認後、削除。
- **次Sprintへの引き継ぎ**: グリーンな骨格。以後のSprintは `verify` を壊す状態でコミットしてはならない。

## M0-S2: パックスキーマ型＋検証器

- **目的**: パックスキーマ設計書§2の全型をTypeScriptに書き起こし、§4の検証4類を実装する。M0ゲート「パックスキーマ凍結」の実体化。
- **実装内容**:
  1. ブランドID型・共通型（03-class-design.md §1）
  2. WorldPack 型ツリー（スキーマ設計書§2.1〜2.10と一対一。05-data-structures.md が正）
  3. WorldEvent封筒型・EventBusインターフェース（**型のみ**。実装はM1）
  4. PackValidator＋検証ルール4類（構造/憲法/境界/数値）
  5. JsonPackParser・FilePackRepository・LoadPackUseCase
  6. 検証用ミニパック `packs/fixtures/mini/`（架空語彙の最小データ。水滸データはM3）
  7. CLI `validate-pack` コマンド（Composition Root）
- **完了条件**: ミニパックの検証が通る／**逐条突合テスト**（スキーマ設計書§2の各節⇔型の対応表テスト）が通る／憲法違反パック（初期怨恨を仕込んだfixture）が**拒否される**テストが通る／`npm run verify` 全通過。
- **次Sprintへの引き継ぎ**: 語彙テーブルを持つロード可能なパックが存在する状態（監査の禁止リスト生成元）。

## M0-S3: 固有名詞監査＋検証ゲート統合

- **目的**: 検出器仕様書§5.1の固有名詞監査を機械化し、検証ゲート（verify）に常設する。M0ゲートのもう一方の完了。
- **実装内容**:
  1. BanLexiconBuilder: 全パックの語彙・実体名から禁止リスト生成
  2. SourceScanner: エンジン層ソースの完全一致トークン照合（識別子・文字列・コメント）
  3. AuditReport 出力＋非ゼロ終了
  4. `verify.sh` への統合（パック検証＋固有名詞監査を追加）
  5. M0 DoDチェックリスト（08-dod.md）の全項目実行と実装報告書
- **完了条件**: **自己試験**——fixtureパックの語彙1語を`packages/core/src`に意図的に混入させたテストケースで監査が検出する（確認後、混入は削除）／08-dod.md 全項目チェック／台帳更新（凍結API記帳）。
- **次Sprintへの引き継ぎ**: M0完了。M1（世界骨格・シード乱数・イベントバス実装・observatory器・性能予算D-1）へ。M1の設計入力はG11イベントスキーマ設計ラウンド（未実施）が先行する。

---

## Sprint横断の規律

- 各Sprintの成果はP6（プロンプトライブラリ）形式の実装発注として 09-implementation-prompts.md に完成済み。
- 仕様の曖昧さを発見したら：最も保守的な解釈で実装し、実装報告書に「解釈記録」を残す（P6）。仕様の欠陥なら CR起票して停止（勝手な改善の禁止）。
- コミット粒度は 07-commit-plan.md に従う。常にビルド可能（verify通過）でコミットする。
