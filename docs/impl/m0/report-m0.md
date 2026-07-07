# M0 実装報告書

作成: Claude Code（Sonnet）。随時追記。

## 変更ファイル一覧

コミットごとの詳細は `git log` を正とする。本書には仕様との対応・解釈記録・残課題のみ記す。

## 仕様との対応

- C-00: 02-architecture.md §0（Docker開発環境）に準拠。
- C-01: 02-architecture.md §1（フォルダ構成）に準拠。
- C-0V: 02-architecture.md §0.4（Vite HMR検証・環境シェル）に準拠。

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

## 残課題

- C-0VのHMR実ブラウザ確認（目視）が未実施。上記「解釈記録」参照。
