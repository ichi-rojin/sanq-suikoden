#!/usr/bin/env bash
# 責務: 検証ゲート（typecheck→lint→depcruise→test）を直列実行する
set -euo pipefail

npm run typecheck
npm run lint
npm run depcruise
npm run test
