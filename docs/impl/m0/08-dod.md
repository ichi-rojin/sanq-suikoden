# M0 Definition of Done ―（成果物⑧）

M0完了の判定はこのチェックリストのみで行う。全項目にチェックが付かない限りM0は未完了。
検収者: G14の帽子（実行はClaude Code、最終確認はProducer）。

## 検証ゲート

- [ ] `npm run verify` が全通過する（typecheck → lint → depcruise → test → validate-pack → audit-lexicon の順で直列実行）
- [ ] verify は新規クローン直後（`npm install` のみ）で再現する

## パックスキーマ（M0ゲート前半）

- [ ] パックスキーマ設計書§2の全10節に対応する型が存在する（逐条突合テストが対応表を検査している）
- [ ] `InitialRelation.kind` が4値列挙（血縁・婚姻・師弟・同僚）であり、それ以外を型と検証の両方で拒否する
- [ ] 検証4類（構造・憲法・境界・数値）それぞれに最低1つの拒否ケーステストがある（`packs/fixtures/invalid/`）
- [ ] S/A層人物の `sourceNote` 欠落が検証エラーになる
- [ ] `engineSchemaVersion` のmajor不一致が検証エラーになる
- [ ] 題テンプレのプレースホルダ以外の構文（条件・演算）がパース段階でエラーになる
- [ ] ミニパック（`packs/fixtures/mini/`）が検証を通過し、CLIが終了コード0を返す
- [ ] PackValidator が決定論的である（同一入力2回で同一レポート）テストがある

## 固有名詞監査（M0ゲート後半）

- [ ] 禁止リストがパックの語彙・実体名から自動生成される（手書きリストが存在しない）
- [ ] エンジン層（packages/*/src）の識別子・文字列・コメントを走査する
- [ ] 混入自己試験: fixture語彙1語を混入させたテストで監査が検出する
- [ ] 監査が verify.sh に常設され、検出時に非ゼロ終了する

## 規約の機械化

- [ ] `any` 使用がlintエラーになる（自己試験済み）
- [ ] `Math.random()` 使用がlintエラーになる（自己試験済み）
- [ ] 責務コメント欠落がlintエラーになる（自己試験済み）
- [ ] 依存規則違反（domain→infra等）がdepcruiseで落ちる（自己試験済み）

## 範囲の規律

- [ ] 03-class-design.md §9 の除外リスト（集約・バス実装・乱数・observatory・Save/Load・viewer・LLM）に該当する実装が存在しない
- [ ] 仕様の曖昧さに対する「解釈記録」が実装報告書に列挙されている（ゼロ件ならその旨明記）
- [ ] 仕様変更が発生していない（発生した場合はCRが起票され、勝手な変更がない）

## 記録

- [ ] 実装報告書 `docs/impl/m0/report-m0.md` が存在する（変更ファイル一覧・仕様との対応・解釈記録・残課題）
- [ ] ledger-frozen.md に凍結APIとして「パックスキーマ型一式（domain/pack公開型）・WorldEvent封筒・EventBusインターフェース」が記帳されている
- [ ] 全コミットが 07-commit-plan.md の粒度・命名に従い、verify通過状態でコミットされている
