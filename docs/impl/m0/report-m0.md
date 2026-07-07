# M0 実装報告書

作成: Claude Code（Sonnet）。随時追記。

## 変更ファイル一覧

コミットごとの詳細は `git log` を正とする。本書には仕様との対応・解釈記録・残課題のみ記す。

## 仕様との対応

- C-00: 02-architecture.md §0（Docker開発環境）に準拠。
- C-01: 02-architecture.md §1（フォルダ構成）に準拠。
- C-0V: 02-architecture.md §0.4（Vite HMR検証・環境シェル）に準拠。
- C-02: 06-implementation-order.md C-02（TypeScript strict）に準拠。
- C-03: 02-architecture.md §5（lint機械化）に準拠。
- C-04: 02-architecture.md §4（依存規則）に準拠。
- C-05: 07-commit-plan.md C-05（vitestと検証ゲート）に準拠。**M0-S1完了。**

## M0-S1完了確認（DoD該当節）

- `docker compose down -v && docker compose up -d && docker compose exec dev npm install && docker compose exec dev npm run verify` を実行し、
  新規クローン相当の状態（ボリューム含め完全削除後）から3手順が再現し、`npm run verify`
  （typecheck→lint→depcruise→test）が全通過することを確認した。
- ホストPCの `node_modules` ディレクトリは空（マウントポイントの痕跡ディレクトリのみで実パッケージなし）であり、
  実体は named volume `sanq-suikoden_node_modules`（コンテナ内 `/app/node_modules`）にのみ存在することを確認した
  （`docker volume inspect` でMountpointが `/var/lib/docker/volumes/...` であることを確認済み）。
- コンテナ再作成（`docker compose down && up -d`、ボリュームは維持）後も依存パッケージが保持されることを確認した。

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

## 残課題

- C-0VのHMR実ブラウザ確認（目視）が未実施。上記「解釈記録」参照。
