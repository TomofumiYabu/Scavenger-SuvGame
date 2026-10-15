# 進捗

更新日: 2026-10-16（日本時間）

## 目標

Codex Cloud 内で開発と検証が完結し、静的配信できるサバイバルゲームの最小版を作る。

## 状況

- [x] 空リポジトリと Cloud の Node.js / npm / Chromium を確認
- [x] 舞台を「荒廃した近未来の都市」に決定
- [x] TypeScript + Vite を選定し、開発ルール・仕様・設計を記録
- [x] 探索・資源管理・勝敗・保存を実装
- [x] レスポンシブ UI を実装
- [x] ユニットテスト・型検査・本番ビルドを実行
- [x] Chromium で主要操作と復元、サブパス配信を検証
- [x] Cloud 再利用設定を保存（`install_script` / `start_skill`）

## 実装済み

仮称「AFTERLIGHT — 残光の街」。7×7 の固定マップと発見範囲、地形ごとの有限な物資収集、資源消費、負傷、休息、物資使用、48時間の制限、通信塔での脱出、死亡・時間切れ、探索ログ、ブラウザ内自動保存と復元。日本語 UI、操作説明、再開始の確認、デスクトップ・狭幅のレイアウトを実装。

## 検証結果

現在の Cloud インスタンスで以下を確認。失敗・スキップ・未解決の必須チェックはなし。

| 対象 | 結果 |
| --- | --- |
| `npm ci` | lockfile から再導入成功 |
| `npm test` | 47件成功（ゲームルール21件、保存検証26件） |
| `npm run typecheck` | 成功 |
| `npm run build` | 成功、`dist/` を生成 |
| `npm run test:e2e` | Chromium 9件成功 |
| `npm run check` | 再導入後の一括実行成功 |
| `npm audit --audit-level=high` | 報告された既知の脆弱性0件 |
| `npm run dev` | 起動成功。HTTP 応答と Chromium で探索後の残り時間・物資更新を確認。ページエラー0件 |

ブラウザでは、探索・移動・アイテム使用、通常の保存復元、初期状態から脱出までの操作、終了状態の復元、リセット確認、破損セーブ、保存禁止環境、キーボードのヘルプ開閉、390px/320px 幅を確認。通常の静的 HTTP サーバーの `/Scavenger-SuvGame/` 配下で JS/CSS を読み込み、実操作できることも確認した。外部 API/CDN への実行時リクエストなし。

初回検証で見つかった不要な CSS import とテストの曖昧なボタン指定は修正済み。モバイルの見出し改行と目標表示も調整済み。スクリーンショットは `test-results/` の生成物として保持し、Git 管理しない。

## Cloud の保存状態

`install_script`（依存導入とビルド）および `start_skill`（既存チェックアウト利用、開発サーバー起動、検証、公開との区別）を設定ドラフトへ保存済み。ネットワーク許可・秘密情報の追加は不要だった。

ドラフト保存は公開操作ではない。環境設定で確認・保存したうえで環境を公開する必要がある。別 Cloud タスクへの復元は未検証。GitHub への反映とサイト公開は次の節を参照。

## GitHub と Pages 公開

- ゲーム本体を初回コミット `fe2e970` として `main` へプッシュ済み。
- ユーザーの指示により、今後は検証が通った機能単位・作業の区切りでコミットとプッシュを行う。方針を `AGENTS.md` に記録した。
- `.github/workflows/pages.yml` を追加。main ではテスト・ビルド後に Pages へ公開し、PR では検証のみ実施する。Actions は公式タグのコミット SHA で固定。
- Cloud の Chromium と CI の Playwright 管理ブラウザに対応する起動設定を追加。型定義 `@types/node` を固定バージョンで追加。
- 変更後に `npm run check` が成功（47件のユニットテスト、型検査、ビルド、9件のE2E）。`actionlint 1.7.7` によるワークフロー検証も成功。
- Cloud から `api.github.com` への接続はプロキシの CONNECT 403 で拒否された。Git の読み取り・プッシュは成功しており、GitHub 認証全体の不足とは判断していない。
- `api.github.com` と公開確認先 `tomofumiyabu.github.io` を Cloud の許可先ドラフトへ追加済み。既存の許可先とプリセットは保持した。ネットワーク反映後に Pages 設定・Actions の結果・公開サイトの実操作を確認する。
- 公開用構成をコミット `47e5e6e` として `main` へプッシュ済み。
- [GitHub Actions 初回実行](https://github.com/TomofumiYabu/Scavenger-SuvGame/actions/runs/38818951859) の **Test and build は成功**（47秒）。**Deploy to GitHub Pages は失敗**（4秒）。`Configure GitHub Pages` が `Get Pages site failed / 404 Not Found` を報告し、Pages の有効化と GitHub Actions ソースの設定を要求している。
- 必要な外部作業は Pages の初回有効化。API のネットワーク許可を反映して Codex から設定するか、[Settings → Pages](https://github.com/TomofumiYabu/Scavenger-SuvGame/settings/pages) の Source を **GitHub Actions** に設定し、上記の実行を再実行する。アプリケーションの修正は不要。
- 公開成功と公開サイトの実操作は未確認。公開予定URLは `https://tomofumiyabu.github.io/Scavenger-SuvGame/`。初回設定・復旧手順は `docs/DEPLOYMENT.md` に記録。
- この実行結果の追記は文書だけの変更のため `[skip ci]` で保存し、未有効の Pages に対する同じ失敗の再実行は避けた。アプリ・公開構成は上記の検証済みコミットから変更していない。

## 保留事項

公開先は GitHub Pages に決定。正式タイトルは未確定。

次の候補は、Pages 公開の確認、探索イベントの追加とバランス調整、戦闘・クラフト・装備・重量制限、生成マップ。優先順位はこの最小版の評価をもとに決める。

既知の制限: 固定マップ、単一の脱出目標、セーブはブラウザ内のみ。端末間同期・セーブの書き出し、サウンド、オフラインキャッシュは未実装。Firefox/Safari/実機タッチ操作・長時間のゲームバランスは未検証。現在表示する天候・気温は雰囲気用の固定情報で、ルールに影響しない。
