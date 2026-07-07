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

### C-01: 各パッケージの初期scriptsを空にした

06-implementation-order.mdのC-01は「npm installが通る」ことのみを完了条件とし、typecheck/lint等の
スクリプトはC-02以降で個別に追加される。ルートpackage.jsonの `scripts` はC-01時点では意図的に未設置とし、
各コミット（C-02: typecheck、C-03: lint、C-04: depcruise、C-05: test/verify）で該当スクリプトのみを追加した。

## 残課題

- C-0VのHMR実ブラウザ確認（目視）が未実施。上記「解釈記録」参照。
