# 凍結台帳 ledger-frozen.md

> **復元注記（2026-07-07）**：前セッションの台帳ファイルが引き継がれなかったため再設置。
> 設計書5書の投入（2026-07-07、docs/design/）を受けて監査済み。
> 凍結の定義（運用仕様書§2）：①Owner設計完了 ②必須レビュー通過 ③批判章と自己レビューあり
> ④二重検問の回答文あり ⑤ファイルとして保存済み。

## 凍結済み節

| 対象 | 版 | 凍結日 | 状態 | 監査所見（2026-07-07） |
|---|---|---|---|---|
| world-sim-structure-design-v1.md（構造設計書） | v1 | 2026-07-07（Producer承認、R-11） | **凍結** | ①③⑤確認。批判3件＋自己レビュー4回。④は本書が二重検問の定義元（§7第4回） |
| world-sim-design-v1.md（世界設計書） | v1 | 同上 | **凍結** | ①③⑤確認。批判5件（§17）＋自己レビュー4回（§18）。④は成書が二重検問成立以前のため回答文なし（負債D-6） |
| world-sim-observation-design-v1.md（観測系設計書） | v1 | 同上 | **凍結** | ①③⑤確認。批判3件（§8）＋自己レビュー3回（§9）。④同上（負債D-6） |
| world-sim-design-org-v1.md（設計組織設計書） | v1 | 同上 | **凍結** | ①③⑤確認。自己レビュー4回、④回答文あり（§7第4回）。対立軸A〜F・責務マトリクスの正典 |
| suikoden-worldpack-spec-v1.md（水滸伝世界パック仕様書） | v1 | 同上 | **凍結** | ①③⑤確認。Owner=G6・レビューG5/G16/G4・批判G17の帽子宣言あり。④回答文あり（§15第3回） |
| AI Development Kit v1（00〜06、docs/ai-kit/） | v1 | 有効（運用規範） | 有効 | 2026-07-07確認。リポジトリ内に保存済み |
| world-sim-detector-spec-v1.md（検出器仕様書） | v1 | 2026-07-07（R-12） | **凍結** | 軽量レビューによる凍結（Producer指示R-12の逸脱記録あり）。次回改訂時フルレビュー必須。閾値は全て仮ラベル付き（確定M明記） |
| world-sim-packschema-design-v1.md（パックスキーマ設計書） | v1 | 2026-07-07（R-12） | **凍結** | 同上。改訂規約二段（フィールド追加=minor/G9レビューのみ、変更削除・enum変更=CR必須） |

**共通所見**：②必須レビュー通過の記録（レビュー所見ファイル）は5書すべてで喪失。凍結の根拠と経緯は裁定R-2（凍結推定）→R-11（Producer正式承認）を参照。**次回改訂時は責務マトリクス（組織書§2）通りのフルレビューを必須とする。**

## 凍結API一覧

**M0完了（2026-07-07、Claude Code実装、docs/impl/m0/report-m0.md参照）を受けて記帳。**
以下は `packages/core` の公開API（`packages/core/src/index.ts`）。変更にはCR起票を要する
（フィールド追加はパックスキーマ設計書§6の改訂規約によりminor/G9レビューのみ可、
enum値・節構成の変更削除はCR必須）。

| 対象 | 所在 | 内容 | 凍結範囲 |
|---|---|---|---|
| パックスキーマ型一式 | `packages/core/src/domain/pack/*` | `WorldPack`ルートと全10節の型（`PackMeta`・`Geography`・`Agents`・`InstitutionDef`・`SkillDef`・`CauseTemplate`・`AgitationEntry`・`Vocabulary`・`EraParams`・`EvaluationOverrides`）＋`RelationKind`等の全enum型＋`parseTitleTemplate` | 型定義・enum値・節構成 |
| 検証器 | `packages/core/src/domain/pack/validation/*` | `PackValidator`と構造/数値/憲法/境界の4ルールクラス、`ValidationIssue`/`ValidationReport` | 公開APIの型・実行順序（構造→数値→憲法→境界） |
| ロード経路 | `packages/core/src/application/pack/*`・`packages/core/src/infrastructure/pack/*` | `PackRepository`/`PackParser`インターフェース、`LoadPackUseCase`、`FilePackRepository`、`JsonPackParser` | 公開API型 |
| WorldEvent封筒 | `packages/core/src/domain/event/world-event.ts` | `{id, tick, type, actors[], witnesses[], location, causes[], payload, salience}`（型のみ・実装ゼロ） | 型定義（`type`の具体カタログはG11ラウンドで別途凍結） |
| EventBusインターフェース | `packages/core/src/domain/event/event-bus.ts` | `publish(e)`/`subscribe(type, handler)`（型のみ・実装ゼロ） | 型定義（配送規律の実装はM1） |
| 共通基盤 | `packages/core/src/domain/shared/*` | `Brand`・全ブランドID型＋生成関数・`Score100`・`Tick`/`EventId` | 型定義・生成関数の検証規則 |

## 凍結予定（M0ゲート）

- ~~世界パックスキーマ（エンジン/パック境界の型）——Owner=G9~~ **解消（2026-07-07、M0完了）**：上記「凍結API一覧」参照。
- 戦闘インターフェース（入力：参加勢力と地形／出力：イベント束）——世界設計書§18第4回で凍結方針決定済み、型定義はM0〜M1
