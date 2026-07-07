# CLAUDE.md

このファイルは、本リポジトリで作業する全Claudeセッションの入口である。

1. `docs/ai-kit/01-master-prompt.md` を行動規範として採用せよ。
2. `docs/ledgers/` が唯一の決定記録である。台帳に無い決定は存在しない決定として扱え。
3. 実装は `docs/impl/m0/` の文書群（アーキテクチャ・実装順序・コミット計画・DoD・実装プロンプト）に厳密に従え。
4. npm・Node.jsの実行はDockerコンテナ内のみ（`docker compose exec dev npm ...`）。ホストPCで `npm install` を実行するな。
5. 仕様変更は禁止。凍結済み設計書（`docs/ledgers/ledger-frozen.md`）との矛盾を見つけたら、独自に解決せず、CRを起票して停止せよ。
