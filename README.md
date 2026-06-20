# Meal Note

Android向けの食事時間記録PWAです。データと写真はブラウザのIndexedDBに保存されます。

## 起動

Service Workerを利用するため、`index.html`を直接開かずHTTPサーバーから配信してください。

```powershell
python -m http.server 4173 -d outputs/meal-pwa
```

同じPCでは `http://localhost:4173` を開きます。Androidから確認する場合は、PCと同じネットワークに接続し、HTTPSで公開するかデプロイしたURLをChromeで開いてください。

## 現在の機能

- 朝食、昼食、夕食、間食の開始・終了記録
- アルコールの有無
- 食事写真とメモ
- 手動追加、編集、削除
- 今日の件数、時間、飲酒回数の集計
- オフライン対応とホーム画面へのインストール

データはこの端末内だけに保存されます。ブラウザのサイトデータを削除すると記録も消えるため、将来の外部同期追加を前提としています。
