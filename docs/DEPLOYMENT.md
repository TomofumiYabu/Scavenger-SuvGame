# GitHub Pages 公開

## 構成

- リポジトリ: `TomofumiYabu/Scavenger-SuvGame`
- 公開ブランチ: `main`
- 配信URL: `https://tomofumiyabu.github.io/Scavenger-SuvGame/`（2026-10-16にユーザーが設定・動作確認を完了）
- 配信方式: GitHub Actions → 検証済み `dist/` → GitHub Pages
- ワークフロー: `.github/workflows/pages.yml`

`gh-pages` ブランチやビルド成果物のコミットは不要。個人アクセストークンを Actions のシークレットへ登録する必要もない。デプロイジョブは GitHub の `GITHUB_TOKEN` と OIDC を利用する。

## 初回の Pages 有効化

GitHub API に必要なアクセスがある場合、Codex が Cloud から現在の設定を調べ、Pages の `build_type` を `workflow` に設定する。通常の Actions 用 `GITHUB_TOKEN` では Pages の初回有効化ができないため、ワークフローでは自動有効化を要求しない。

API にアクセスできない場合は、ブラウザでリポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を選ぶ。これはローカル PC への開発環境構築やファイル操作を必要としない。公開リポジトリか、契約プランが Pages に対応する非公開リポジトリであることが必要。リポジトリ自体の可視性は勝手に変更しない。

設定後、Actions の **Test and deploy GitHub Pages → Run workflow → main** を実行するか、失敗した実行を再実行する。

## 日常の更新

1. Codex Cloud で変更し、`npm run check` を成功させる。
2. 意味のある変更単位でコミットする。リモートとの差分を確認し、通常の push を行う。履歴の上書きや force push はしない。
3. `main` への push により Actions が動き、47件のユニットテスト・型チェック・ビルド・9件のブラウザテストを行う（件数は実装追加で増える）。
4. すべて成功した成果物だけを Pages へ配信する。ビルド・検証の失敗時は、前回の公開版が残る。
5. Actions の成功と、公開 URL での読み込み・探索・セーブを確認する。プッシュ成功だけで公開済みと報告しない。

大きな変更は作業ブランチに保存し、PR で検証してから統合する。PR のコードに公開権限は与えない。単一の公開処理が完了するまで次の公開を直列化する。

## Cloud の通信

Git の通信が成功しても、GitHub API にアクセスできるとは限らない。環境設定の許可先に `api.github.com` と `tomofumiyabu.github.io` が必要。現在の設定ドラフトには追加済み。ドラフト保存だけでは現在のネットワークに適用されない。

設定反映後は `gh api repos/TomofumiYabu/Scavenger-SuvGame/pages` で確認する。既存の認証を使い、トークン値をログやチャットに表示しない。外部 API の認証を Actions へコピーする必要はない。

## 確認と復旧

`gh run list --repo TomofumiYabu/Scavenger-SuvGame` で対象コミットの実行を確認し、失敗時は `gh run view <run-id> --log-failed` で原因を特定する。Pages が未有効なら初回設定を行ってから再実行する。コードの不具合なら Cloud で修正・検証後にコミットしてプッシュする。

以前の状態へ戻す場合も履歴を消さず、必要な変更を revert して検証・プッシュする。公開の更新で URL と保存形式が同じなら既存プレイヤーのセーブは維持される。セーブ形式を変更する際は移行方針を先に決める。
