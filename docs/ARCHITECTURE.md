# 技術構成

## 採用

| 要素 | 選択 | 理由 |
| --- | --- | --- |
| 言語 | TypeScript / strict | 状態、行動、セーブ形式を型で明示できる |
| UI | HTML + CSS + SVG | ターン制マップと情報パネルに適し、キーボード操作やレスポンシブ対応が容易 |
| 開発・配布 | Vite | 軽い開発サーバーと静的ファイルへのビルド |
| ルール検証 | Vitest | DOM なしで行動・資源・勝敗・保存検証をテスト |
| 操作検証 | Playwright + Cloud 標準 Chromium | ビルド成果物の実操作、保存復元、モバイル幅を確認 |
| 保存 | localStorage / version 1 | バックエンド不要。端末間同期は対象外 |

Node.js 24.19.0 / npm 11.9.0 を Cloud で使用。npm キャッシュは `.npmrc` でチェックアウト内の無視対象 `.cache/npm` に配置する。新規導入で lockfile を作成し、以後 `npm ci` で再現する。

React などの UI フレームワークや Phaser / Godot は、現段階の小さなターン制 UI には導入しない。アニメーション、戦闘、広いマップが必要になった時点で再評価する。ルールと UI の分離によって描画方式を変更しやすくする。

## ディレクトリ

```text
AGENTS.md              開発ルール
docs/                  仕様・設計・進捗・Cloud 操作手順
src/game/              型、固定マップ、行動処理、セーブ検証、ユニットテスト
src/main.ts            UI、入力、保存の接続
src/style.css          レスポンシブな画面
public/                配布する静的アセット
tests/                 本番ビルドに対するブラウザテスト
dist/                  配布成果物（Git 対象外）
```

## 状態と処理

入力 → `act(state, action)` → 新しい状態 → 保存 → 再描画。ルール関数は入力を変更しない。不可能な行動は状態を変えない。乱数は状態に保持する固定シードの疑似乱数で、再現可能にする。未探索地点と探索済み地点を別々に管理する。

保存データはバージョン・値域・配列・列挙値を読み込み時に検証する。外部由来の文字列を `innerHTML` に埋める箇所は必ずエスケープする。

## 配信

`npm run build` で `dist/` を生成。`base: './'` により GitHub Pages のリポジトリ配下などのサブパスでもアセットを読み込める。クライアントルーターは使わず、サーバーの URL 書き換え設定は不要。

実行時は外部通信・API キー・DB が不要。開発時に npm レジストリが必要。Cloud の `/usr/bin/chromium` をブラウザテストに利用する。GitHub Actions では Playwright 管理の Chromium をインストールして同じテストを実行する。

公開先は GitHub Pages。`.github/workflows/pages.yml` の build ジョブが検証済み成果物をアップロードし、依存する deploy ジョブが公開する。PR では検証のみ、`main` への push と手動実行では公開まで行う。Actions は公式リポジトリのコミット SHA で固定する。公開ジョブにのみ `pages: write` と `id-token: write` を付与する。初回の Pages 有効化はリポジトリ設定で行う必要があり、通常の `GITHUB_TOKEN` での自動有効化は前提にしない。
