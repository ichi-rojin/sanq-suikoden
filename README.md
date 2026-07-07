# sanq-suikoden

水滸世界シミュレーション（英雄譚生成エンジン）。水滸伝を最初の世界パックとする。

## Docker開発環境

Node.js・npmの実行はコンテナ内のみで行う。ホストPCで `npm install` を実行しない。

```
docker compose up -d                       # 起動
docker compose exec dev npm install        # 依存導入（コンテナ内のみ）
docker compose exec dev npm run verify     # 検証ゲート
docker compose exec dev npm run dev:env    # Vite環境シェル起動（HMR確認時のみ）
```

## ドキュメント

- `docs/ai-kit/` — 開発体制・行動規範（Master Prompt等）
- `docs/design/` — 凍結済み設計書群
- `docs/impl/m0/` — M0実装文書（アーキテクチャ・実装順序・DoD等）
- `docs/ledgers/` — 決定記録（台帳）

実装作業を行う場合は `CLAUDE.md` を先に読むこと。
