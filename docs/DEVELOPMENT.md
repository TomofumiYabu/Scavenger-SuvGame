# Codex Cloud の開発・検証

すべて既存チェックアウト `/workspace/Scavenger-SuvGame` で実行する。ユーザーのローカル PC 操作は不要。Cloud タスクは隔離済みなので新しい Git worktree は作らない。

## 必要なツール

- Node.js 24.19.0 / npm 11.9.0（`.node-version` に記録）
- Chromium: `/usr/bin/chromium`（この Cloud の標準ツール）。存在しない CI 環境では Playwright 管理の Chromium を使用する。必要に応じて `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` で実行ファイルを指定できる。
- Python 3: 静的配信のテスト専用
- 外部サービス・API キー・DB: 不要
- 導入時の通信先: `registry.npmjs.org`。GitHub の設定・Actions 確認には `api.github.com`、公開確認には `tomofumiyabu.github.io` を使う。

## 環境の再構築

```bash
cd /workspace/Scavenger-SuvGame
npm ci
chromium --version
python3 --version
npm run check
```

`.npmrc` により npm キャッシュを `.cache/npm` へ保存する。書き込みが許可されないホームディレクトリにキャッシュを作ろうとする問題を避ける。依存バージョンと integrity は lockfile で固定し、検証を無効にしない。

## 開発サーバー

```bash
cd /workspace/Scavenger-SuvGame
npm run dev
```

5173番ポートで待ち受ける。Cloud の継続プロセスとして起動し、同じサーバーが必要なら再利用する。確認には Cloud 内から `curl -fsS http://127.0.0.1:5173/` でタイトルとエントリを確認し、Chromium で操作する。ループバック URL をユーザー向けプレビューとして案内しない。

環境を再開したときは実行中プロセスが残っていると仮定しない。ポート競合時は既存サービスを確認し、自分が起動したものだけを停止する。無関係なサービスを終了しない。

## 検証コマンド

| コマンド | 検証範囲 |
| --- | --- |
| `npm test` | 移動、探索、資源消費、回復、勝敗、保存形式 |
| `npm run typecheck` | TypeScript strict の型検査 |
| `npm run build` | 型検査と静的成果物の生成 |
| `npm run test:e2e` | 事前ビルドを Chromium で操作 |
| `npm run check` | 上記の必須チェックを一括実行 |
| `npm audit --audit-level=high` | npm の既知の脆弱性情報（外部通信あり） |

E2E は4173番の Vite preview と4174番の通常の静的 HTTP サーバーを自動起動・停止する。既存サーバーを流用せず、このビルドを検証する。静的配信では `dist/` のコピーを一時ディレクトリの `Scavenger-SuvGame/` に置き、SPA フォールバックなしで相対アセット参照を確認する。テストは2ワーカーで実行する。

失敗時のスクリーンショットと trace、確認用のデスクトップ・モバイル画像は `test-results/` に生成される。Git 管理対象にはしない。テストが0件で成功した状態を完了とは扱わない。

## エージェントのオーケストレーション

複数エージェントを使う場合、root が計画、タスク分割、モデル選択、統合、最終レビューを担う。ゲームロジック、機能、修正、重要なテストは `gpt-6.1-sol`、範囲の明確な文書作業、単純な変更、定型確認は `gpt-6-luna` に割り当てる。担当には必要な文脈だけを渡し、並行編集ではファイル所有範囲を分ける。作業を細分化しすぎず、複雑さが増したら Sol または root に引き上げる。必要に応じて独立レビューを依頼し、レビュー担当から根拠、再現手順、影響、修正案を集める。root が各提案を採用・保留・見送りに分け、その理由を記録する。採用分は実装と必要な検証を済ませてから統合する。Cloud 上で必要な検証を実行し、未実行の確認は成功と混同せず明記する。統合後のコミットとプッシュは root が行う。

## 公開と保存設定

Cloud の設定ドラフトはインストール手順と起動手順を保存するだけで、公開は行わない。公開後に復元されるファイルと、再起動が必要なプロセスを区別する。新しい Cloud タスクでの復元は、実際に別タスクで確認するまでは未検証と記録する。

ユーザーは今後の適切な頻度でのコミットとプッシュを継続的に許可している。root が統合後、検証が通った機能単位や作業の区切りで変更内容が分かるコミットを作り、プッシュする。毎回の確認は不要。公開先は GitHub Pages で、`main` の変更は GitHub Actions による検証後に公開する。具体的な手順と復旧方法は `docs/DEPLOYMENT.md` を参照する。
