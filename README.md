# fal Image Studio

fal.ai API を使用した画像生成・編集ツール。CLI とブラウザ UI の両方で操作可能。生成物を別モデルの入力にチェーンして段階的に編集するワークフローに対応。

## 対応モデル

| モデル | 用途 |
|--------|------|
| Reve Edit | 画像編集 |
| SeeDream Edit | 画像編集 |
| Nano Banana 2 | 画像編集 |
| Clarity Upscaler | 高画質アップスケール |

## セットアップ

### 前提

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- Node.js 20+ (Web UI 用)
- fal.ai API キー ([https://fal.ai/dashboard/keys](https://fal.ai/dashboard/keys))

### インストール

```bash
# Python CLI
cp .env.example .env
# .env に FAL_KEY を記入
uv sync

# Web UI
cd web
npm install
```

## CLI

```bash
# モデル一覧
uv run fal-studio models

# 画像生成（ローカルファイル）
uv run fal-studio run reve -p "make it sunset" -i ./photo.jpg

# 画像生成（URL指定）
uv run fal-studio run clarity-upscaler -p "upscale" -i https://example.com/img.jpg

# 追加パラメータ
uv run fal-studio run reve -p "edit prompt" -i ./photo.jpg --param guidance_scale=7.5

# 結果を保存せず標準出力のみ
uv run fal-studio run reve -p "test" --no-save
```

結果は `outputs/` に JSON として保存される。

## Web UI

```bash
cd web
npm run dev
```

ブラウザで `http://localhost:5173/fal-image-studio/` を開く。

- 初回起動時に fal.ai API キーを入力（localStorage に保存）
- カードごとにモデル選択・プロンプト入力・画像アップロード
- **チェーン**: 出力画像を別カードの Input にドラッグ&ドロップで接続
- 生成履歴は localStorage に保存

## GitHub Pages デプロイ

1. GitHub にリポジトリを作成して push
2. Settings > Secrets and variables > Actions > `FAL_KEY` を設定
3. Settings > Pages > Source を **GitHub Actions** に変更
4. main ブランチへの push で自動デプロイ

### GitHub Actions による画像生成

Actions タブ > **Generate Images** > Run workflow から手動実行可能。モデル・プロンプト・画像 URL を指定すると、CLI で生成した結果を `outputs/` にコミットする。

## プロジェクト構成

```
.github/workflows/
  deploy.yml          # GitHub Pages デプロイ
  generate.yml        # 手動画像生成ワークフロー
src/fal_studio/
  cli.py              # Click CLI
  client.py           # fal.ai Python クライアント
  models.py           # モデル定義
web/
  src/
    App.jsx           # メイン UI（カード・キャンバス・接続線）
    fal.js            # fal.ai JS クライアントラッパー
    models.js         # モデル定義
    theme.js          # カラーパレット
outputs/              # 生成結果 JSON
```

## ライセンス

MIT
