# 実装アーキテクチャ ―（成果物②）

凍結設計からの導出: 世界設計書§12（レイヤ・パッケージ・決定論）／観測系設計書§6（CQRS）／パックスキーマ設計書（境界）。
技術選定（npm workspaces・vitest・dependency-cruiser・tsx）はテックリード裁量の具体化であり、仕様変更ではない。

---

## 1. フォルダ構成（M0時点の完全形）

```
sanq-suikoden/
├─ package.json                  # npm workspaces ルート。scripts: verify / test / lint / typecheck / depcruise
├─ tsconfig.base.json            # strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true
├─ eslint.config.mjs             # flat config（§5）
├─ .dependency-cruiser.cjs       # 層分離規則（§4）
├─ scripts/
│  └─ verify.sh                  # 検証ゲート: typecheck→lint→depcruise→test→validate-pack→audit-lexicon
├─ packages/
│  ├─ core/                      # @world/core — Domain + Application（世界設計書§12.2）
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ domain/
│  │     │  ├─ shared/           # ブランドID・Tick・共通値オブジェクト
│  │     │  ├─ pack/             # WorldPack型ツリー（スキーマ設計書§2）
│  │     │  │  └─ validation/    # PackValidator＋検証ルール4類（同§4）
│  │     │  └─ event/            # WorldEvent封筒・EventBusインターフェース（M0は型のみ）
│  │     ├─ application/
│  │     │  └─ pack/             # LoadPackUseCase / PackRepositoryインターフェース
│  │     └─ infrastructure/
│  │        └─ pack/             # JsonPackParser / FilePackRepository
│  └─ cli/                       # @world/cli — Presentation（ヘッドレス）＋Composition Root
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ main.ts              # Composition Root（配線はここのみ）
│        └─ commands/
│           └─ validate-pack.ts
├─ tools/
│  └─ audit/                     # @world/tools-audit — 固有名詞監査（製品外の開発検査具）
│     └─ src/
│        ├─ ban-lexicon-builder.ts
│        ├─ source-scanner.ts
│        └─ main.ts
├─ packs/
│  └─ fixtures/
│     ├─ mini/pack.json          # 検証用ミニパック（架空語彙）
│     └─ invalid/                # 拒否ケース群（初期怨恨仕込み等、テスト専用）
└─ docs/                         # （既存）設計書・台帳・本実装文書群
```

将来パッケージ（M0では作らない。名前だけ予約）: `@world/chronicle`（M4）／`@world/observatory`（M1）／`@world/viewer`（M3人物帳から）／`@world/llm`（M4以降）。

## 2. レイヤ構成と責務

| レイヤ | 場所 | 責務 | 禁止事項 |
|---|---|---|---|
| Domain | core/src/domain | 純粋ロジック・型・検証規則。**依存ゼロ**（Node API・fsも不可） | I/O、`Date.now()`、`Math.random()`、固有名詞 |
| Application | core/src/application | ユースケース編成・リポジトリ**インターフェース**定義 | 具象インフラへの参照 |
| Infrastructure | core/src/infrastructure | fs読取・JSONパース・（M1以降）シード乱数・永続化 | ドメイン規則の実装 |
| Presentation | cli/src | コマンド解釈・出力整形・**Composition Rootでの配線** | 業務判断 |

## 3. DDD境界（M0の範囲）

- M0に**集約は存在しない**（シミュレーション未実装。Agent/Faction等の集約はM1以降、世界設計書§13.1が正）。
- M0のドメインは「**パック境界**」のみ: WorldPackは不変の値オブジェクトツリーであり、エンティティ・可変状態を持たない。
- ECSは**採用しない**。凍結設計はDDD集約＋イベント駆動を規定しており（世界設計書§12〜14）、ECSへの置換は仕様変更（CR対象）である。本項は「採用する場合の責務」への回答＝**採用しない旨の明記**。

## 4. 依存規則（dependency-cruiserで機械強制）

```
許可される import 方向:
  domain      → domain のみ
  application → application, domain
  infrastructure → infrastructure, domain, application（インターフェース実装のため）
  cli(presentation) → すべて（ただし配線は main.ts のみ。commands は application 経由）
禁止（明示ルール化）:
  domain → application/infrastructure/presentation/Node組込み(fs,path等)
  application → infrastructure 具象
  core → cli / tools
  （将来）viewer → core 内部（observatory の公開APIのみ許可）
```

自己試験: 違反importを含む一時ファイルで depcruise が非ゼロ終了することをM0-S1で確認。

## 5. 規約のlint機械化（eslint flat config）

| 規約（Master Prompt束縛） | 機械化 |
|---|---|
| `any`禁止 | `@typescript-eslint/no-explicit-any: error` |
| `Math.random()`禁止 | `no-restricted-properties`（object: Math, property: random） |
| import順アルファベット | `sort-imports` ＋ import文のグループ順 |
| ファイル冒頭責務コメント | カスタムルール `tools/eslint-rules/file-responsibility.mjs`（先頭コメント行 `// 責務:` で始まらないファイルをerror） |
| マジックナンバー禁止 | `no-magic-numbers`（0,1,-1と定数定義ファイルを許容） |

## 6. DI構成

- フレームワーク不使用。**コンストラクタ注入＋Composition Root**（`cli/src/main.ts`）のみ。
- インターフェースは application 層が所有し（依存性逆転）、infrastructure が実装、main.ts が結線する。
- M0の結線は1本: `new LoadPackUseCase(new FilePackRepository(), new JsonPackParser(), new PackValidator())`。

## 7. Event Bus構成（M0は型定義のみ）

- `domain/event/` に `WorldEvent`（封筒型。世界設計書§13.3の転写、05-data-structures.md §3）と `EventBus` インターフェース（`publish(e)` / `subscribe(type, handler)`）を定義。
- 配送規律（同期・tick内固定順・翌tick持ち越し・打消イベント——世界設計書§14.3）は**M1実装**。M0で実装しない理由: 具体イベント型のカタログはG11設計ラウンド（未実施）の成果物であり、先に実装すると幽霊仕様になる。
- M0の完了条件はコンパイルが通る型と、封筒型の形状テストのみ。

## 8. Repository構成

- M0: `PackRepository`（読取専用。`load(packDir): RawPackSource`）のみ。実装は `FilePackRepository`（fs読取）。
- M1以降: `EventLogStore`（append-only）・`SnapshotStore`。形式は 05-data-structures.md §5 の転写DTOを草案とし、G12ラウンドで凍結。M0では作らない。

## 9. Save/Load構成（M0該当なし・方針のみ固定）

- 世界設計書§15の転写: セーブ＝スナップショット＋以降のログ差分。シード＋ログで完全リプレイ。observatoryインデックスはセーブに含めず再構築。**M0に保存対象の実行時状態は存在しない**（パックは入力データであってセーブ対象ではない）。

## 10. Pixi責務・UI責務（M0該当なし・依存規則のみ予約）

- viewer（将来）は PixiJS で observatory のクエリAPIのみを購読して描画する（観測系設計書§6.1）。coreへの直接参照は依存規則で禁止済み（§4）。演出はイベント購読の後付けであり、停止してもログ同一（憲法②）。
- M0のUIはCLIのみ: `validate-pack`（終了コード＋整形済みValidationReport）と `tools/audit`（同AuditReport）。
