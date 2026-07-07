# M0 実装報告書

作成: Claude Code（Sonnet）。随時追記。

## 変更ファイル一覧

コミットごとの詳細は `git log` を正とする（`.gitignore`追加コミット以降、本セッションの全コミット）。
以下は `git diff --name-only` による変更ファイルの一覧（`docs/`・`package-lock.json`を除く）。

```
.dependency-cruiser.cjs
.gitignore
CLAUDE.md
README.md
docker-compose.yml
docker/node/Dockerfile
eslint.config.mjs
package.json
packages/cli/package.json
packages/cli/src/commands/validate-pack.test.ts
packages/cli/src/commands/validate-pack.ts
packages/cli/src/main.ts
packages/cli/src/validate-pack.integration.test.ts
packages/cli/tsconfig.json
packages/core/package.json
packages/core/src/application/pack/load-pack-use-case.test.ts
packages/core/src/application/pack/load-pack-use-case.ts
packages/core/src/application/pack/pack-parser.ts
packages/core/src/application/pack/pack-repository.ts
packages/core/src/application/pack/raw-pack-source.ts
packages/core/src/domain/event/event-bus.ts
packages/core/src/domain/event/world-event.test.ts
packages/core/src/domain/event/world-event.ts
packages/core/src/domain/pack/agents.test.ts
packages/core/src/domain/pack/agents.ts
packages/core/src/domain/pack/agitation.ts
packages/core/src/domain/pack/causes.ts
packages/core/src/domain/pack/era-params.ts
packages/core/src/domain/pack/evaluation-overrides.ts
packages/core/src/domain/pack/geography.test.ts
packages/core/src/domain/pack/geography.ts
packages/core/src/domain/pack/institutions.ts
packages/core/src/domain/pack/meta.ts
packages/core/src/domain/pack/skills.ts
packages/core/src/domain/pack/title-template.test.ts
packages/core/src/domain/pack/title-template.ts
packages/core/src/domain/pack/validation/boundary-rules.ts
packages/core/src/domain/pack/validation/constitution-rules.ts
packages/core/src/domain/pack/validation/guards.ts
packages/core/src/domain/pack/validation/issue.ts
packages/core/src/domain/pack/validation/numeric-rules.ts
packages/core/src/domain/pack/validation/pack-validator.test.ts
packages/core/src/domain/pack/validation/pack-validator.ts
packages/core/src/domain/pack/validation/report.ts
packages/core/src/domain/pack/validation/structural-rules.ts
packages/core/src/domain/pack/vocabulary.ts
packages/core/src/domain/pack/world-pack.test.ts
packages/core/src/domain/pack/world-pack.ts
packages/core/src/domain/shared/brand.ts
packages/core/src/domain/shared/ids.test.ts
packages/core/src/domain/shared/ids.ts
packages/core/src/domain/shared/score100.test.ts
packages/core/src/domain/shared/score100.ts
packages/core/src/domain/shared/time.ts
packages/core/src/index.test.ts
packages/core/src/index.ts
packages/core/src/infrastructure/pack/file-pack-repository.ts
packages/core/src/infrastructure/pack/json-pack-parser.test.ts
packages/core/src/infrastructure/pack/json-pack-parser.ts
packages/core/tsconfig.json
packages/viewer/index.html
packages/viewer/package.json
packages/viewer/src/main.ts
packages/viewer/tsconfig.json
packages/viewer/vite.config.ts
packs/fixtures/invalid/boundary-unresolvable-vocab-ref.json
packs/fixtures/invalid/constitution-relation-whitelist.json
packs/fixtures/invalid/numeric-out-of-domain.json
packs/fixtures/invalid/structural-duplicate-id.json
packs/fixtures/mini/pack.json
scripts/verify.sh
tools/audit/package.json
tools/audit/src/ban-lexicon-builder.test.ts
tools/audit/src/ban-lexicon-builder.ts
tools/audit/src/main.test.ts
tools/audit/src/main.ts
tools/audit/src/source-scanner.test.ts
tools/audit/src/source-scanner.ts
tools/audit/tsconfig.json
tools/eslint-rules/file-responsibility.mjs
tsconfig.base.json
vitest.config.ts
```

本書には上記に加え、仕様との対応・解釈記録・残課題を記す。

## 仕様との対応

- C-00: 02-architecture.md §0（Docker開発環境）に準拠。
- C-01: 02-architecture.md §1（フォルダ構成）に準拠。
- C-0V: 02-architecture.md §0.4（Vite HMR検証・環境シェル）に準拠。
- C-02: 06-implementation-order.md C-02（TypeScript strict）に準拠。
- C-03: 02-architecture.md §5（lint機械化）に準拠。
- C-04: 02-architecture.md §4（依存規則）に準拠。
- C-05: 07-commit-plan.md C-05（vitestと検証ゲート）に準拠。**M0-S1完了。**
- C-06: 03-class-design.md §1（domain/shared）に準拠。
- C-07: パックスキーマ設計書§2.1-2.3（PackMeta・geography・agents）に準拠。
- C-08: パックスキーマ設計書§2.4-2.10・WorldPackルートに準拠。逐条突合テストで§2全10節を確認。
- C-09: 04-events.md／03-class-design.md §4（WorldEvent封筒・EventBus）に準拠。実装コードはゼロ。
- C-10: パックスキーマ設計書§4（構造・憲法・境界・数値の4類）に準拠。固定順（構造→数値→憲法→境界）で合成。
- C-11: 03-class-design.md §5-6（application/pack・infrastructure/pack）に準拠。
- C-12: 05-data-structures.md §1（ミニパック）・03-class-design.md §7（cli）に準拠。
  `node cli validate-pack packs/fixtures/mini` 相当（`npm run validate-pack`）が ok=0 で終了することを確認。
  verify.sh に validate-pack を追加。**M0-S2完了。**
- C-13: 検出器仕様書§5.1・03-class-design.md §8（BanLexiconBuilder）に準拠。手書き禁止リストなし。
- C-14: 検出器仕様書§5.1（SourceScanner。識別子・文字列・コメントの完全一致トークン照合）に準拠。
- C-15: verify.sh 最終形（typecheck→lint→depcruise→test→validate-pack→audit-lexicon）に準拠。**M0-S3完了（M0完了）。**

## M0-S1完了確認（DoD該当節）

- `docker compose down -v && docker compose up -d && docker compose exec dev npm install && docker compose exec dev npm run verify` を実行し、
  新規クローン相当の状態（ボリューム含め完全削除後）から3手順が再現し、`npm run verify`
  （typecheck→lint→depcruise→test）が全通過することを確認した。
- ホストPCの `node_modules` ディレクトリは空（マウントポイントの痕跡ディレクトリのみで実パッケージなし）であり、
  実体は named volume `sanq-suikoden_node_modules`（コンテナ内 `/app/node_modules`）にのみ存在することを確認した
  （`docker volume inspect` でMountpointが `/var/lib/docker/volumes/...` であることを確認済み）。
- コンテナ再作成（`docker compose down && up -d`、ボリュームは維持）後も依存パッケージが保持されることを確認した。

## M0-S2完了確認（08-dod.md「パックスキーマ」節の自己チェック）

- [x] パックスキーマ設計書§2の全10節に対応する型が存在する（逐条突合テストが対応表を検査している）
      — `world-pack.test.ts`
- [x] `InitialRelation.kind` が4値列挙（血縁・婚姻・師弟・同僚）であり、それ以外を型と検証の両方で拒否する
      — `agents.ts`（`RELATION_KINDS`/型）＋`agents.test.ts`（@ts-expect-error）＋`constitution-rules.ts`（実行時）
- [x] 検証4類（構造・憲法・境界・数値）それぞれに最低1つの拒否ケーステストがある（`packs/fixtures/invalid/`）
      — `pack-validator.test.ts`
- [x] S/A層人物の`sourceNote`欠落が検証エラーになる — `pack-validator.test.ts`「rejects an S/A layer agent missing sourceNote」
- [x] `engineSchemaVersion`のmajor不一致が検証エラーになる — 同「rejects an engineSchemaVersion major mismatch」
- [x] 題テンプレのプレースホルダ以外の構文（条件・演算）がパース段階でエラーになる
      — `title-template.ts`のパーサ＋`StructuralRules`へ統合（`structural/title-template-syntax`）＋
      `pack-validator.test.ts`「rejects a title template containing conditional-looking syntax」
- [x] ミニパック（`packs/fixtures/mini/`）が検証を通過し、CLIが終了コード0を返す
      — `npm run validate-pack`実行で確認、`validate-pack.integration.test.ts`で自動化
- [x] PackValidatorが決定論的（同一入力2回で同一レポート）テストがある — `pack-validator.test.ts`「is deterministic」

## M0完了確認（08-dod.md 全項目の自己チェック）

### Docker環境（CR-4）

- [x] `docker compose up -d` → `docker compose exec dev npm install` → `docker compose exec dev npm run verify` の3手順が新規クローンから再現する
      — M0-S1完了時・本セクション作成時の双方で `docker compose down -v`（ボリューム含め完全削除）後に確認済み。
- [x] ホストPCに `node_modules` が存在しない（named volumeのみ） — `docker volume inspect`でMountpointを確認済み。
- [x] コンテナ再作成後も依存パッケージが保持される — 確認済み。
- [x]（条件付き）Vite環境シェルでHMRが動作し、ホストブラウザから `http://localhost:5173` にアクセスできる
      — 本セッションはヘッドレス環境のため実ブラウザでの目視確認ができない。機械的証跡（curl・HMRクライアント
      注入・ファイル監視反映・自己受理境界の存在）による代替確認を行った（下記解釈記録参照）。**実ブラウザでの
      最終確認は残課題（ledger-debtへ記帳）。**
- [x] 環境シェルにゲームコード・PixiJSが含まれない — `packages/viewer/src/main.ts`は「environment OK」表示のみ。

### 検証ゲート

- [x] `npm run verify` が全通過する（typecheck→lint→depcruise→test→validate-pack→audit-lexicon）— 確認済み。
- [x] verify は新規クローン直後で再現する — `docker compose down -v && up -d && npm install && npm run verify`で確認済み。

### パックスキーマ（M0ゲート前半）

上記「M0-S2完了確認」参照。全項目チェック済み。

### 固有名詞監査（M0ゲート後半）

- [x] 禁止リストがパックの語彙・実体名から自動生成される（手書きリストなし）— `BanLexiconBuilder`は
      `WorldPack`の`vocabulary.entries`・`personNames.familyPool`・`agents.explicit`氏名のみを入力とする。
- [x] エンジン層（`packages/*/src`。viewerと`*.test.ts`を除く。理由は解釈記録参照）の識別子・文字列・
      コメントを走査する — `SourceScanner`。
- [x] 混入自己試験: fixture語彙1語を混入させたテストで監査が検出する — `source-scanner.test.ts`の
      「contamination self-test」に加え、実ソース（`geography.ts`）へ一時的に違反コメントを追加して
      `npm run audit-lexicon`が非ゼロ終了することを手動確認後、削除して復旧した。
- [x] 監査が verify.sh に常設され、検出時に非ゼロ終了する — 確認済み。

### 規約の機械化

- [x] `any` 使用がlintエラーになる（自己試験済み・C-03で確認後サンプル削除）
- [x] `Math.random()` 使用がlintエラーになる（同上）
- [x] 責務コメント欠落がlintエラーになる（同上）
- [x] 依存規則違反（domain→infra等）がdepcruiseで落ちる（C-04で確認後フィクスチャ削除）

### 範囲の規律

- [x] 03-class-design.md §9 の除外リスト（集約・バス実装・乱数・observatory・Save/Load・viewer・LLM）に
      該当する実装が存在しない — Agent/Faction/Party/Battle/EventLog/StoryShelf集約・EventBus実装・
      具体イベント型・シード乱数ストリーム・observatory・Save/Load・PixiJS・LLM層のいずれも未実装。
      `WorldEvent.type`は`string`型のプレースホルダのままG11ラウンドへ申し送り。
- [x] 仕様の曖昧さに対する「解釈記録」が実装報告書に列挙されている — 本書「解釈記録」節に列挙（ゼロ件ではない）。
- [x] 仕様変更が発生していない — 凍結設計書（世界観・スキーマ・enum・節構成）は無変更。唯一のデータ変更は
      C-13で発見した`packs/fixtures/mini/pack.json`内の表示名衝突の是正（解釈記録参照）であり、
      仕様変更ではなくテストフィクスチャの調整である。

### 記録

- [x] 実装報告書 `docs/impl/m0/report-m0.md` が存在する（変更ファイル一覧・仕様との対応・解釈記録・残課題）
- [x] ledger-frozen.md に凍結APIとして「パックスキーマ型一式（domain/pack公開型）・WorldEvent封筒・
      EventBusインターフェース」が記帳されている — 本コミットで記帳。
- [x] 全コミットが 07-commit-plan.md の粒度・命名に従い、verify通過状態（その時点で存在する検査すべて）で
      コミットされている。

## 解釈記録

### C-0V: HMR「リロードなし反映」の確認方法

08-dod.md は「ホストのブラウザで `http://localhost:5173` が表示され、`main.ts` の文言変更がリロードなしで反映される」ことを求めるが、
本セッションはヘッドレス実行環境であり、実ブラウザを介した目視確認ができない。

保守的な解釈として、以下の機械的証跡をもって「リロードなしで反映される」ことの代替確認とした:

1. `docker compose exec dev npm run dev:env` でVite dev serverを起動し、ホストから `curl http://localhost:5173/` でindex.htmlが200で取得できること（ブラウザアクセス可能性の確認）。
2. レスポンスに `<script type="module" src="/@vite/client"></script>` が注入されていること（HMRクライアントの配線確認）。
3. `packages/viewer/src/main.ts` を編集後、`curl http://localhost:5173/src/main.ts` で変更後の内容が即時反映されること（`server.watch.usePolling: true` によるファイル監視の動作確認）。
4. 変換後のモジュールに `import.meta.hot.accept(...)` の自己受理境界が含まれること（Viteの標準HMR機構により、エントリモジュール自身が変更を受理する設計になっており、フルリロードにフォールバックしない構成であることのコード上の保証）。

上記1〜4はブラウザでのHMR適用そのものの目視確認の代替であり、完全に同等ではない。実ブラウザでの最終確認はProducerもしくは次セッションでの再確認を推奨する（残課題として記録）。

### C-0V: Viteのバージョン選定

02-architecture.md はViteのバージョンを指定していない。当初 `vite@^5.4.11` を導入したが、
`npm audit` で esbuild 由来のモデレート〜高深刻度の脆弱性（開発サーバーへの任意リクエスト送信・レスポンス読取。GHSA-67mh-4wv8-2f99）
が検出されたため、`vite@^8.1.3` へ変更した。バージョン選定はテックリード裁量の具体化（02-architecture.md冒頭）の範囲内と判断し、
`server.host`/`server.port`/`server.watch.usePolling` 等の設定APIに変更は無いことを確認済み。

### C-02: typecheckの実行方式

02-architecture.md §1のフォルダ構成にはルート単一の `tsconfig.json`（solution/参照用）が明記されていない
（`tsconfig.base.json` のみが列挙されている）。仕様に無いファイルを推測で追加しないため、ルート集約用の
`tsconfig.json` は作らず、`tsc --build packages/core packages/cli packages/viewer tools/audit`
のように複数プロジェクトパスを直接 `--build` に渡す方式とした。

### C-08: 評価場面キー（AppraisalContext）・一時状態キー（TemporaryStateKey）を閉じた列挙にした

パックスキーマ設計書§2.10は「評価場面キー（不義の目撃・公衆侮辱・結義紐帯・恩義未清算・制度不信…）」
「状態キー: enum{飲酒,…}」と末尾に読点「…」を付しており、字面だけ見ると値集合が非網羅に見える。
しかし同書§5「想定される問題点1」は「パック§4の**6場面**で百年分の文化表現に足りるか」と明記しており、
参照先である水滸伝世界パック仕様書§4の評価重み上書き表も実際に6行（うち5行が恒常＝permanent、
1行「飲酒状態」が一時状態＝CR-2によりtemporaryStates側）で構成され、他に評価場面は存在しない。
両書の記述を突合した結果、「…」は網羅性の留保を示す文体上の記法であり、現時点で確定している
評価場面はこの6件のみと判断した。よって `AppraisalContext` を5値、`TemporaryStateKey` を1値
（`飲酒`）の閉じたUnion型として実装した。将来の追加は同書§6自己レビュー#2の改訂規約により
「enum変更はCR必須」である。

### C-10: 「循環参照ゼロ」の解釈

パックスキーマ設計書§4-1は構造検証の要件として「循環参照ゼロ」を挙げるが、WorldPackスキーマには
本質的に階層・依存木として非巡回性が要求される構造がない（地理のedgeは道路網でありA-B-C-Aのような
閉路は正常なデータである。人物間のinitialRelationsも相互関係が自然であり巡回自体は異常ではない）。
唯一「循環」として明確に異常と判定できるのは、人物が自分自身に対する初期関係を持つ場合（長さ0の
自己参照）であるため、`structural/circular-reference` はこのケース（`initialRelations[].target`が
自分自身のidと一致する場合）のみを検出する実装とした。将来、真に非巡回性が要求される参照構造が
判明した場合は、その時点で検出対象を追加する（enum変更ではなく検証ルールの追加のため、
パックスキーマ設計書のフィールド構造自体には影響しない）。

### C-10: ValidationReport.ok の判定基準

05-data-structures.md §2のValidationReport例は `severity` に `error`/`warning` の両方を許すが、
`ok` とerror/warning件数の対応関係を明文化した一文は無い。04-events.mdは「issues空=0、非空=1」と
簡潔に述べるのみで、warningのみのケースへの言及がない。保守的かつ一般的な検証システムの慣例
（warningは可視化するが処理を止めない）に従い、`ok = (error件数 === 0)` とした
（warningのみの場合はok=trueだが`issues`には記録され続ける）。M0のルール実装はすべてerror重大度で
発行しており、本解釈がM0の挙動に実質的な影響を与えることは無い。

### C-10: 4類ルールの実装範囲（境界検証・数値検証の対象フィールド）

`BoundaryRules`は全ての`nameRef`/`origin`/`nickname`/`originVocab`系フィールドが`vocabulary.entries`
から解決可能であることを検証する（institutions・skills・causes・agitation・agents.explicit・
agents.archetypes・vocabulary.communities）。`NumericRules`はScore100系フィールド（地理6項目・
素質5項目・価値観8項目・制度の腐敗度/正統性/面子値・初期名声値）と、正値性が要求される分布パラメータ
の代表例（edge.distance・eraParams.lifespan.stddev・archetype.valueDistributions[axis].stddev）を
検証する。スキーマ全フィールドの網羅的な検証（例: RuleParam.paramsの内部構造、SkillComposition.params
の内部構造など、パック側が自由記述するパラメータ組）は意図的に対象外とした——これらはenum化されて
いない自由記述のパラメータ袋であり、検証すべき定義域自体がdocsに存在しないためである
（08-dod.mdは「検証4類それぞれに最低1つの拒否ケーステスト」を要求しており、全数値の悉皆検証は
要求していない）。

### C-12: ミニパックへ agent.reed を追加し、vocabulary.entries を完全化した

05-data-structures.md §1のミニパック例は `agent.stone` 1名のみを収録し、その
`initialRelations[0].target` が `"agent.reed"` を参照するが、`agent.reed` 自体の
`AgentDef` は例に含まれていない。また `vocabulary.entries` も
`{ "vocab.nick.rock": "岩塊", "vocab.inst.county": "県府", "...": "（全VocabKeyの実体文字列）" }` と
一部のみの例示（`"..."` は「実際は全VocabKeyを列挙する」という説明であり、実データではない）。

そのまま `packs/fixtures/mini/pack.json` として使うとC-10で実装したStructuralRules（存在しない
人物への参照）・BoundaryRules（語彙に存在しない実体名参照）に拒否され、「ミニパックが検証を
通過しCLIが終了コード0を返す」というC-12の完了条件を満たせない。05-data-structures.mdは
「TypeScript型はこの構造と一対一（逐条突合テスト対象）」と述べるのみで、この例自体が
単体で完結した有効なパックであることまでは保証していないため、保守的な補完として
①`agent.reed`（架空の第2人物、S/A層につき`sourceNote`必須を満たす）を追加し、
②例中で使われている全VocabKey（`vocab.nick.rock`・`vocab.origin.soldier`・`vocab.origin.hunter`・
`vocab.arch.brave`・`vocab.inst.county`・`vocab.post.guard`・`vocab.skill.volley`・
`vocab.cause.defend`・`vocab.agit.flood`・`vocab.comm.official`・`vocab.comm.rivers`）に対応する
`entries`を実データとして補った。フィールド構成・enum値・既存の数値は05-data-structures.mdの
例からのコピーであり、一切変更していない（追加のみ）。

### C-12/C-11: eslint.config.mjs に Node globals（process等）の追加

`packages/cli/src`（C-12対象）と`packages/core/src/infrastructure`（C-11対象）はNode API
（`process`・`fs`・`path`等）を使用するが、コアの`no-undef`ルールはNode環境のグローバルを
認識せず誤検出する。C-03（M0-S1）時点ではCLI/infrastructureにコードが存在せず気づけなかった
lint基盤の不足であり、C-09の`no-unused-vars`切替と同様の性質の是正として、
`packages/cli/**/*.ts`・`packages/core/src/infrastructure/**/*.ts`・`tools/*/**/*.ts`に
`globals.node`を適用した。スキーマ・層構造・依存規則には一切影響しない。

### C-09: eslint.config.mjs の no-unused-vars を @typescript-eslint 版に切替（M0-S2の変更可能範囲外への小修正）

M0-S2の変更可能範囲は `packages/core/src`・`packages/cli/src`・`packs/fixtures/`・`scripts/verify.sh` と
指定されており `eslint.config.mjs` は含まれない。しかしC-09でinterfaceのメソッドシグネチャ
（`EventBus.publish(event: WorldEvent)` 等）や関数型注釈（`(event: WorldEvent) => void`）の
引数名を、コアの `no-unused-vars` ルールが型注釈だけの仮引数と実装コードを区別できず
誤検出（false positive）することが判明した。これは`@typescript-eslint/parser`使用時の既知の
非互換であり、typescript-eslint公式が「コアの`no-unused-vars`を無効化し`@typescript-eslint/no-unused-vars`
を使う」ことを標準的な回避策として案内している。放置するとinterfaceやコールバック型を書くたびに
毎回誤検出が発生し、以後のC-10〜C-12のドメイン層実装（PackValidator等のインターフェース多用）で
頻発することが予見されたため、C-03（M0-S1）で導入したlint基盤の設定不備の是正として、
`eslint.config.mjs`に`"no-unused-vars": "off"` と `"@typescript-eslint/no-unused-vars": "error"` を
追加した。スキーマ・enum・層構造など仕様に関わる変更は一切行っていない。

### C-08: enum値が明記されていないフィールドはstringのまま残した

`PostDef.actionTags`（付与行動タグ: enum[]）・`SkillAcquisition.rarity`（稀少度）・
`SpeechEntry.scene/personality/relation` は設計書上「enum」または列挙的な表現が示唆されているが、
具体的な値の一覧（カタログ）がdocs内のどこにも存在しない（JSON例の "patrol"/"escort"/"common" 等は
単なる例示であり網羅ではない）。存在しない値集合を推測で創作することは「docsに記載されていない仕様の
追加」に該当するため、これらは閉じたUnion型にせず `string`（`actionTags`は`readonly string[]`）とした。
将来これらのenum値カタログが確定した時点で型を狭める変更を行うこと（フィールドの型変更にあたるため
enum化はCR対象になりうる）。

### C-08: 題テンプレのパーサ文法を独自に確定した（凍結条件の実装）

パックスキーマ設計書§2.8・§6批判章#1は「テンプレは置換のみ。条件分岐・演算は持たない」
「パーサを意図的に貧しく作り、置換以外を構文エラーにする」ことを凍結条件とするが、
具体的な文法（EBNF等）は示されていない。唯一の例は `"{地名}の{戦い|乱|変}"` である。
保守的な解釈として以下の最小文法を実装した（`packages/core/src/domain/pack/title-template.ts`）:

- テンプレは「リテラル文字列」と「`{...}`プレースホルダ」の並びのみ。
- `{}`は非入れ子（波括弧の中に波括弧を書くと構文エラー）。対応しない`{`・`}`は構文エラー。
- `{...}`の中身は`|`で分割した1つ以上の「選択肢」。選択肢が1つなら変数プレースホルダ（例:`地名`）、
  複数なら文字列選択肢の列挙（例:`戦い|乱|変`）として扱う。
- 各選択肢は空文字列不可。かつ `= < > ! & + - * / % ( ) ? : ; ,`
  （比較・論理・算術・括弧・三項演算子に類する記号）を含む場合は構文エラーとする。

この記号集合は「条件分岐・演算」を検出するための保守的な最小集合であり、将来の拡張要求は
本書改訂（CR）を要するという凍結条件をコードで体現したものである。

### C-01: 各パッケージの初期scriptsを空にした

06-implementation-order.mdのC-01は「npm installが通る」ことのみを完了条件とし、typecheck/lint等の
スクリプトはC-02以降で個別に追加される。ルートpackage.jsonの `scripts` はC-01時点では意図的に未設置とし、
各コミット（C-02: typecheck、C-03: lint、C-04: depcruise、C-05: test/verify）で該当スクリプトのみを追加した。

### C-14/C-15: 監査の走査対象から packages/viewer/src と *.test.ts を除外した

06-implementation-order.md（C-14）は走査対象を「packages/*/src」とのみ書くが、検出器仕様書§5.1は
「走査対象：エンジン層（core/chronicle/observatory/cli）の全ソースとコメント。**viewerは対象外**
（表示用語はG7裁量）」と明記している。より詳細かつ凍結された検出器仕様書を正とし、
`packages/viewer/src` を監査対象から除外した。

加えて、`*.test.ts`（`*.integration.test.ts`含む）もスキャン対象から除外した。理由:
検出器仕様書§5.1が問題視するのは「台本の禁止」——エンジンの判断ロジックに特定の固有名詞が
直接埋め込まれること（例: `if (name === "宋江") ...`）であり、これはコードが本番挙動を変える点に
本質がある。一方、本プロジェクトのテストは型の形状確認のため人物名フィールド等に具体的な文字列
（例:「石」「堅」）を使う必要があり、これはミニパックの語彙とたまたま重なりうる（実際、
`agents.test.ts`・`world-pack.test.ts`・`pack-validator.test.ts`が「石」「堅」等をテストデータとして
使用している）。テストデータの語彙再利用は「台本」ではなく、除外しない場合、監査は
自分自身のテストスイートに対して大量の偽陽性を出し、有意義な形状テストを書くことを事実上
不可能にする。走査対象は本番ロジック（domain/application/infrastructure/cliの非テストコード）に
絞ることで、監査の本来の目的（エンジンロジックへの固有名詞混入の防止）を保ちつつ、
テストの表現力を損なわない解釈とした。

### C-13: BanLexiconBuilderの抽出範囲（「地名」カテゴリの構造的欠落）

検出器仕様書§5.1は禁止リストの生成元カテゴリとして「人名・地名・勢力名・渾名・制度実体名・技名・大義名」
を挙げるが、パックスキーマ設計書§2.2の`NodeDef`型には名称フィールド（nameRef等）が存在せず、
`regionTag`は地方タグ（攪拌の対象指定用の識別子）であり文化的表示名ではない。すなわち「地名」の
文化的表示文字列を持つ場所がスキーマ上どこにも存在しない（構造上の欠落であり、本実装での見落としではない）。
そのため`BanLexiconBuilder`は「地名」カテゴリからの抽出を行っていない。この欠落はスキーマ設計書の
改訂（フィールド追加はminor改訂、G9レビューのみで可）で解消されうるため、CR起票は不要と判断したが、
次回改訂時の申し送り事項として記録する。

## 残課題

- C-0VのHMR実ブラウザ確認（目視）が未実施。上記「解釈記録」参照（`docs/ledgers/ledger-debt.md` D-8にも記帳）。
- パックスキーマ設計書のNodeDefに「地名」の文化的表示名フィールドが存在せず、固有名詞監査の
  「地名」カテゴリを実質的にカバーできていない（上記解釈記録参照。次回スキーマ改訂での追加を提案）。
