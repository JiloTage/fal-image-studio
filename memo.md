# つくりたいもの
fal.aiのAPIを使用した画像生成リポジトリ
python+uvで管理
## 詳細
モデルは
- reve/edit
- seedream/edit
- nano-banana2/edit
- clarity-upscaler
基本的に画像(or link)をひとつor複数+テキストを入力として受け取る

# step1
cliで生成できるようにする
結果はjsonで保存

# step2
UI化
画像を放り投げる、プロンプトを入れる->生成ボタンで生成　のフロー
生成物を別のAIの入力にして、どんどん編集していくフローを想定する
UIデザインはai-chain-studio-v2.jsxを参照

# step3
github pagesで公開
生成をgithub actionsで行う->jsonを更新してmainブランチを更新
