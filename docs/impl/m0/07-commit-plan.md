# コミット設計 ―（成果物⑦）

粒度: 1コミット＝30〜90分。番号は 06-implementation-order.md と一致。
共通完了条件（全コミット）: `npm run verify` 全通過／新規ファイル全てに責務コメント／コミットメッセージ末尾に `Co-Authored-By: Claude <noreply@anthropic.com>`。

| # | コミット名 | 目的 | 主な変更ファイル | 固有の完了条件 |
|---|---|---|---|---|
| C-01 | `chore(repo): npm workspaces骨格` | モノレポ成立 | package.json, packages/{core,cli}/package.json, tools/audit/package.json, 各src/index.ts | `npm install` 成功 |
| C-02 | `chore(repo): TypeScript strict設定` | 型検査の床 | tsconfig.base.json, 各tsconfig.json | `npm run typecheck` 通過 |
| C-03 | `chore(repo): ESLint規約の機械化` | any/Math.random/import順/責務コメントのlint化 | eslint.config.mjs, tools/eslint-rules/file-responsibility.mjs | 違反サンプルが落ちる確認テスト（確認後削除） |
| C-04 | `chore(repo): 依存規則の機械検査` | 層分離の構造的強制 | .dependency-cruiser.cjs | 違反importフィクスチャで非ゼロ終了確認（確認後削除） |
| C-05 | `chore(repo): vitestと検証ゲート` | verify一本化 | vitest.config.ts, scripts/verify.sh, package.json(scripts) | `npm run verify` 全通過（M0-S1完了） |
| C-06 | `feat(core): ブランドID・Score100等の共通型` | 参照のID化と定義域 | core/src/domain/shared/* | 域外値拒否テスト |
| C-07 | `feat(core): パックスキーマ型（地理・人物）` | スキーマ§2.2-2.3の型化 | core/src/domain/pack/{geography,agents}.ts | RelationKindが4値列挙であること（型テスト） |
| C-08 | `feat(core): パックスキーマ型（制度〜評価上書き）＋ルート` | スキーマ§2.4-2.10の型化 | core/src/domain/pack/*.ts | 逐条突合テスト（§2全節⇔型） |
| C-09 | `feat(core): WorldEvent封筒とEventBusインターフェース` | M1への型の橋（実装なし） | core/src/domain/event/* | 形状テストのみ。実装コードゼロ |
| C-10 | `feat(core): パック検証器（構造/憲法/境界/数値）` | スキーマ§4の機械化 | core/src/domain/pack/validation/*, packs/fixtures/invalid/* | 4類それぞれの拒否テスト（白紙原則違反fixture含む） |
| C-11 | `feat(core): パックのロード経路` | 取得→パース→検証の編成 | core/src/application/pack/*, core/src/infrastructure/pack/* | 構文エラー→Issue変換テスト。検証失敗時にpack非返却 |
| C-12 | `feat(cli): validate-packコマンドとミニパック` | E2E成立＋ゲート組込 | cli/src/*, packs/fixtures/mini/pack.json, scripts/verify.sh | ミニパック検証ok=0。verifyにvalidate-pack追加（M0-S2完了） |
| C-13 | `feat(audit): 禁止リスト生成` | パック語彙→禁止トークン | tools/audit/src/ban-lexicon-builder.ts | ミニパックから既知トークン数生成テスト |
| C-14 | `feat(audit): エンジン層ソース走査` | 完全一致トークン照合 | tools/audit/src/source-scanner.ts | 混入自己試験（検出→削除） |
| C-15 | `feat(audit): 監査CLIと検証ゲート最終形` | M0ゲート常設化 | tools/audit/src/main.ts, scripts/verify.sh | verify最終形が全通過 |
| C-16 | `docs(m0): 検収・実装報告書・台帳更新` | M0完了の記録 | docs/impl/m0/report-m0.md, docs/ledgers/* | 08-dod.md全項目チェック済み。凍結API記帳 |

Sprint境界: C-05（S1完了）／C-12（S2完了）／C-16（S3=M0完了）。
差戻し規律: 同一コミットの完了条件を2回失敗したら、原因を実装報告書に記録してから3回目に入る（無限リトライで時間を溶かさない）。
