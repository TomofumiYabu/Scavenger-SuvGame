# AFTERLIGHT — 残光の街

荒廃した近未来都市を探索し、物資を集め、最後の救難信号を送る。一人用・日本語のターン制サバイバルゲームの試作です。静的サイトとして配信でき、ゲーム実行にサーバーやアカウントは不要です。

## 現在できること

7行×7列の六角形マップを6方向に探索・移動し、空腹・渇き・気力を管理します。食料・水・包帯の使用、休息、通信塔からの脱出に対応。各行動で1時間が過ぎます。ブラウザ内に自動保存し、次回は続きから再開します。以前の四角形マップのセーブも引き続き使えます。戦闘やクラフトは今後の候補です。

行動ボタンのそばで、時間・資源消費・回復量と実行できない理由を確認できます。資源が尽きる行動、廃墟での負傷、最後の1時間には、実行前に危険を表示します。

## Codex Cloud で開発

ユーザーのローカル PC に環境を構築する必要はありません。以下はすべて Cloud ターミナル内で実行します。

```bash
cd /workspace/Scavenger-SuvGame
npm ci
npm run dev
```

開発サーバーはポート5173。本環境のオンボーディング画面ではブラウザ用プレビューリンクを提供できないため、Codex が Cloud 内の Chromium で表示・操作を検証します。

```bash
npm run check
```

ユニットテスト → 型チェック → 本番ビルド → ブラウザテストを実行します。Node.js 24.19.0、npm 11.9.0、Cloud にある `/usr/bin/chromium`、Python 3 を使用します。Python は静的サブパス配信のテスト用で、製品の依存ではありません。秘密情報や環境変数の追加は不要です。

## 配布

```bash
npm run build
```

公開先は GitHub Pages。[ブラウザで遊ぶ](https://tomofumiyabu.github.io/Scavenger-SuvGame/)。2026-10-16にユーザーが設定と動作確認を完了しました。確認の範囲は [進捗](docs/PROGRESS.md) に記録しています。

`main` にプッシュすると GitHub Actions が依存導入、ユニットテスト、型チェック、ビルド、ブラウザテストを行い、成功した `dist/` を公開します。Pull Request では検証だけを実行します。初回の Pages 有効化と、公開の確認方法は [公開手順](docs/DEPLOYMENT.md) を参照してください。

生成される `dist/` の**中身すべて**（`index.html`、`assets/`、`favicon.svg`）が配信対象です。サブディレクトリ配信に対応し、URL 書き換えは不要です。HTTP/HTTPS 配信を前提とし、`file://` で直接開く使い方は対象外です。

公開後のプレイに外部 API/CDN への通信はありません。セーブは配信元とブラウザに依存し、ブラウザのデータ削除や配信元の変更で失われます。

## 文書

- [開発ルール](AGENTS.md)
- [ゲーム仕様](docs/SPEC.md)
- [品質向上の行動計画](docs/ROADMAP.md)
- [次の開発課題](docs/BACKLOG.md)
- [NEO Scavenger参考調査の状況](docs/research/NEO_SCAVENGER.md)
- [技術構成・設計](docs/ARCHITECTURE.md)
- [Cloud のセットアップ・検証手順](docs/DEVELOPMENT.md)
- [GitHub Pages 公開手順](docs/DEPLOYMENT.md)
- [進捗・残課題](docs/PROGRESS.md)
