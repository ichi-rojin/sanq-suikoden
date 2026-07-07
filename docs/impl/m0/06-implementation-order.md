# 実装順序 ―（成果物⑥）

原則: **常に `npm run verify` が通る状態でしか進まない。** 各ステップは前ステップのみに依存する。
ステップ番号は 07-commit-plan.md のコミット番号と一致する。

---

## M0-S1: リポジトリ基盤

1. **C-01 ワークスペース骨格**
   ルートpackage.json（workspaces: packages/*, tools/*）、空の `@world/core` `@world/cli` `@world/tools-audit`（各 package.json＋src/index.ts プレースホルダ＋責務コメント）。`npm install` が通る。
2. **C-02 TypeScript strict**
   tsconfig.base.json（strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, isolatedModules）＋各パッケージtsconfig。`npm run typecheck` が通る。
3. **C-03 ESLint規約**
   eslint.config.mjs＋カスタムルール file-responsibility（責務コメント必須）。§5規約（02-architecture.md）全点。`npm run lint` が通る。
4. **C-04 依存規則**
   .dependency-cruiser.cjs（02-architecture.md §4の規則）。違反フィクスチャで非ゼロ終了を確認するテスト（確認後フィクスチャ削除）。`npm run depcruise` が通る。
5. **C-05 テスト基盤と検証ゲート**
   vitest設定＋サンプルテスト1件。`scripts/verify.sh`（typecheck→lint→depcruise→test）。`npm run verify` 全通過。**ここがM0-S1完了点。**

## M0-S2: パックスキーマ型＋検証器

6. **C-06 共通型**
   domain/shared: Brand・全ブランドID・Tick・EventId・Score100（生成関数＋域外拒否テスト）。
7. **C-07 スキーマ型（前半）**
   domain/pack: PackMeta・geography（NodeDef/EdgeDef/enum）・agents（AgentDef/InitialRelation/RelationKind/ArchetypeDef/ScopedFame）。形状テスト。
8. **C-08 スキーマ型（後半）**
   institutions・skills・causes・agitation・vocabulary・eraParams・evaluationOverrides・WorldPackルート。**逐条突合テスト**（スキーマ設計書§2の節⇔型対応表）。
9. **C-09 イベント封筒型**
   domain/event: WorldEvent・EventBusインターフェース（型のみ）＋形状テスト。
10. **C-10 検証器**
    domain/pack/validation: ValidationIssue/Report＋StructuralRules→NumericRules→ConstitutionRules→BoundaryRules＋PackValidator（固定順合成）。ルールごとの拒否ケーステスト（packs/fixtures/invalid/ に違反fixture群）。
11. **C-11 ロード経路**
    application/pack（PackRepository IF・LoadPackUseCase）＋infrastructure/pack（JsonPackParser・FilePackRepository）。パース失敗→Issue変換テスト。
12. **C-12 ミニパックとCLI**
    packs/fixtures/mini/pack.json（05-data-structures.md §1準拠の完全データ）＋cli main.ts（Composition Root）＋validate-packコマンド。`node cli validate-pack packs/fixtures/mini` が ok=0。verify.sh に validate-pack を追加。**ここがM0-S2完了点。**

## M0-S3: 固有名詞監査＋検証ゲート統合

13. **C-13 禁止リスト生成**
    tools/audit: BanLexiconBuilder（vocabulary.entries＋全nameRef実体＋人名プールを網羅）＋生成テスト（ミニパック→既知トークン数）。
14. **C-14 ソース走査**
    SourceScanner（識別子・文字列・コメントの完全一致トークン照合。対象: packages/*/src）＋**混入自己試験**（ミニパック語彙1語をテスト用一時ファイルに置き検出→削除）。
15. **C-15 監査CLIとゲート統合**
    auditMain＋verify.sh へ audit-lexicon 追加（最終形: typecheck→lint→depcruise→test→validate-pack→audit-lexicon）。全通過。
16. **C-16 M0検収**
    08-dod.md 全項目のチェック実行。実装報告書（docs/impl/m0/report-m0.md: 変更ファイル一覧・仕様との対応・解釈記録・残課題）。台帳更新（ledger-frozen へ「パックスキーマ型＝凍結API」の列挙、必要なら ledger-debt 追記）。**M0完了。**

## 依存の要点

- C-10（検証器）は C-07/C-08（型）に依存。C-12（CLI）は C-10/C-11 に依存。C-13以降は C-12 のミニパックに依存。
- どのステップも将来実装（シミュレーション・observatory）への参照を持たない。03-class-design.md §9 の除外リスト外のものを作り始めたら、それは仕様逸脱である（CR起票して停止）。
