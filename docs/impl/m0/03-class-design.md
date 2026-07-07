# クラス設計 ―（成果物③）

M0で実装する全クラス・型の一覧。コードは含まない。型の正確な形状は 05-data-structures.md が正であり、本書は責務と依存の設計図。
記法: 種別は VO=値オブジェクト / SVC=ドメインサービス / UC=ユースケース / IF=インターフェース / INFRA=インフラ実装 / CMD=CLIコマンド。

---

## 1. domain/shared（共通基盤）

| 型 | 種別 | 責務 | 所有データ | 依存先 | 公開API |
|---|---|---|---|---|---|
| `Brand<T, B>` | 型ユーティリティ | ID型の混同をコンパイル時に禁止 | — | なし | 型のみ |
| `PackId, NodeId, EdgeId, AgentId, ArchetypeId, InstitutionId, PostId, SkillId, CauseId, AgitationId, CommunityId, VocabKey` | VO(ブランド文字列) | 境界内の全参照をID化（スキーマ設計書§0.2-3） | string | Brand | 型のみ＋`asNodeId(s)`系の生成関数（検証付き） |
| `Tick, EventId` | VO | 時間・イベント識別（M0は型予約のみ） | number / string | Brand | 型のみ |
| `Score100` | VO | 0〜100の定義域付き数値（素質・価値観・腐敗度・正統性） | number | なし | `asScore100(n)`（域外でエラー） |

## 2. domain/pack（WorldPack型ツリー）

すべて readonly の VO。スキーマ設計書§2の節と一対一対応（対応表テストの対象）。

| 型 | 対応節 | 責務 |
|---|---|---|
| `WorldPack` | §2.1 | ルート。meta＋9セクションの不変ツリー |
| `PackMeta` | §2.1 | packId・version・engineSchemaVersion（互換判定の入力） |
| `NodeDef` / `EdgeDef` / `NodeType`(enum) / `EdgeKind`(enum) | §2.2 | 地理。事実のみ、規則を持たない |
| `AgentDef` / `InitialRelation` / `RelationKind`(enum: 血縁・婚姻・師弟・同僚) / `ScopedFame` | §2.3 | 人物S/A層。**RelationKindの4値列挙が白紙原則の構造的強制** |
| `ArchetypeDef` / `GenerationParams` | §2.3 | B層・世代交代の分布（乱数はエンジン側） |
| `InstitutionDef` / `RuleParam` / `RuleKind`(enum: 課税・登用・処罰・叙勲・治安・移送) / `PostDef` | §2.4 | 制度の器。処罰パラメータに烙印（CR-1の器） |
| `SkillDef` / `PrimitiveKind`(enum: 投射・面制圧・延焼汚染・地形改変・恐慌士気・目標上書き・隠密偽装・移動強制・近接) | §2.5 | 技＝プリミティブ合成レシピ |
| `CauseTemplate` / `HostilityTarget`(enum) / `LegitimacyBase`(enum) | §2.6 | 大義テンプレート |
| `AgitationEntry` / `AgitationKind`(enum: 災害・収奪・政変・外圧・疫病・大赦) | §2.7 | 攪拌テーブル |
| `Vocabulary` / `NicknameRule` / `TitleTemplate` / `SpeechTable` / `CommunityDef` | §2.8 | 語彙。TitleTemplateは**置換のみ**（パーサは意図的に貧しく作る＝凍結条件） |
| `EraParams` | §2.9 | 時代数値 |
| `EvaluationOverrides` / `AppraisalContext`(enum) / `TemporaryStateKey`(enum: 飲酒…) | §2.10 | 評価重み上書き（CR-2の器） |

## 3. domain/pack/validation（検証4類）

| 型 | 種別 | 責務 | 依存先 | 公開API |
|---|---|---|---|---|
| `PackValidator` | SVC | 4ルール群を固定順で実行し報告を合成。**決定論的**（同一入力→同一報告） | 下記4クラス | `validate(candidate: unknown): ValidationReport` |
| `StructuralRules` | SVC | 必須フィールド・ID参照解決・ID重複・循環参照（スキーマ設計書§4-1） | domain/pack | `check(pack): ValidationIssue[]` |
| `ConstitutionRules` | SVC | 白紙原則（RelationKind外の拒否）・偏在の禁止（特別フラグ不存在）・S/A層出典注記の存在（同§4-2） | domain/pack | 同上 |
| `BoundaryRules` | SVC | 全名詞フィールドが禁止リスト生成可能な位置にあること（同§4-3） | domain/pack | 同上 |
| `NumericRules` | SVC | 定義域（Score100等）・分布パラメータ正値性（同§4-4） | domain/pack | 同上 |
| `ValidationIssue` | VO | `{ruleId, severity(error/warning), path, message}` | なし | 型のみ |
| `ValidationReport` | VO | issues集約と合否 | ValidationIssue | `ok: boolean` / `issues` / `toJson()` |

## 4. domain/event（M0は型のみ・実装なし）

| 型 | 種別 | 責務 | 公開API |
|---|---|---|---|
| `WorldEvent` | IF(封筒型) | 世界設計書§13.3の転写: `{id, tick, type, actors[], witnesses[], location, causes[], payload, salience}` | 型のみ |
| `EventBus` | IF | `publish(e: WorldEvent): void` / `subscribe(type: string, h: (e) => void): void`。配送規律の実装はM1 | 型のみ |

## 5. application/pack

| 型 | 種別 | 責務 | 依存先 | 公開API |
|---|---|---|---|---|
| `PackRepository` | IF | パックの原文取得を抽象化 | domain/shared | `load(source: string): Promise<RawPackSource>` |
| `RawPackSource` | VO | 未検証のJSONテキスト＋出所 | なし | 型のみ |
| `LoadPackUseCase` | UC | 取得→パース→検証を編成。**検証失敗時はWorldPackを返さない**（不正パックの流出防止） | PackRepository, JsonPackParser(IF: `PackParser`), PackValidator | `execute(source): Promise<{pack?: WorldPack, report: ValidationReport}>` |

## 6. infrastructure/pack

| 型 | 種別 | 責務 | 依存先 | 公開API |
|---|---|---|---|---|
| `FilePackRepository` | INFRA | fsからpack.jsonを読む（Node API使用はここが上限） | application/pack | `load(dir)` |
| `JsonPackParser` | INFRA(PackParser実装) | JSON→未検証構造体。構文エラーをValidationIssueへ変換 | domain/pack | `parse(raw): {candidate?: unknown, issues: ValidationIssue[]}` |

## 7. cli

| 型 | 種別 | 責務 | 依存先 | 公開API |
|---|---|---|---|---|
| `main` | Composition Root | 全結線と引数分岐。**newはここのみ** | 全層 | `main(argv)` |
| `ValidatePackCommand` | CMD | `validate-pack <dir>`: 実行→報告整形→終了コード（ok=0 / issues=1） | LoadPackUseCase | `run(dir): Promise<number>` |

## 8. tools/audit（固有名詞監査。検出器仕様書§5.1）

| 型 | 種別 | 責務 | 依存先 | 公開API |
|---|---|---|---|---|
| `BanLexiconBuilder` | SVC | 全パックの語彙＋実体名（表示名フィールド網羅）から禁止トークン集合を生成。**手書きリスト禁止**（パックが唯一の真実源） | domain/pack（型のみ） | `build(packs: WorldPack[]): BanLexicon` |
| `BanLexicon` | VO | `{token, sourcePack, sourcePath}[]` | なし | `has(token)` / `entries` |
| `SourceScanner` | SVC | 対象ソース（packages/*/src、viewer除外）の識別子・文字列・コメントを完全一致トークン照合 | BanLexicon | `scan(files): AuditHit[]` |
| `AuditHit` / `AuditReport` | VO | `{file, line, token, context}` ／ 集約と合否 | なし | `ok` / `toJson()` |
| `auditMain` | CMD | 走査→報告→終了コード。verify.shから呼ぶ | 上記 | `main(argv)` |

## 9. M0で実装しないもの（明示的除外——幽霊仕様の防止）

集約Agent/Faction/Party/Battle/EventLog/StoryShelf（M1以降、世界設計書§13.1）／EventBus実装・具体イベント型（G11ラウンド後のM1）／シード乱数ストリーム（M1）／observatory（M1）／Save/Load（M1以降）／viewer・PixiJS（M3以降）／LLM層（M4以降）。
