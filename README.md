# Meal Note

Android向けの食事時間記録PWAです。記録と写真はブラウザ内のIndexedDBに保存されます。

## 起動

Service Workerを使うため、`index.html`を直接開かずHTTPサーバーから配信してください。

```powershell
python -m http.server 4173 -d outputs/meal-pwa
```

同じPCでは `http://localhost:4173` を開きます。Androidから確認する場合は、HTTPSで公開されたURLをChromeで開いてください。

## 機能

- 朝食、昼食、夕食、間食の開始・終了記録
- アルコール有無
- 食事写真とメモ
- 手動追加、編集、削除
- 今日の件数、食事時間、飲酒回数の集計
- オフライン対応とホーム画面へのインストール
- Googleスプレッドシートへの同期

## Googleスプレッドシート同期

PWAにGoogleの認証情報を置かないため、Google Apps ScriptのWebアプリURLへ同期します。
WebアプリURLを知っている第三者からの書き込みを防ぐため、同期用の秘密キーも設定します。
写真本体は送らず、スプレッドシートには `hasPhoto` として写真の有無だけを保存します。

1. Googleスプレッドシートを作成します。
2. `拡張機能` → `Apps Script` を開きます。
3. 下のコードを貼り付けます。
4. `SECRET_KEY` を自分だけの長い文字列に変更します。
5. `デプロイ` → `新しいデプロイ` → 種類は `ウェブアプリ` を選びます。
6. 実行ユーザーは `自分`、アクセスできるユーザーは `全員` にします。
7. 発行された `/exec` で終わるURLと、同じ秘密キーをMeal Noteの同期設定に貼り付けます。

```javascript
const SHEET_NAME = "Meal Note";
const SECRET_KEY = "change-this-to-a-long-random-secret";
const HEADERS = [
  "id",
  "mealName",
  "type",
  "start",
  "end",
  "durationMinutes",
  "alcohol",
  "note",
  "hasPhoto",
  "createdAt",
  "updatedAt",
  "syncedAt",
  "syncedFrom"
];

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  if (payload.syncKey !== SECRET_KEY) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const idToRow = new Map();

  for (let i = 1; i < values.length; i++) {
    idToRow.set(values[i][0], i + 1);
  }

  [...new Set(payload.deletes || [])]
    .map((id) => idToRow.get(id))
    .filter(Boolean)
    .sort((a, b) => b - a)
    .forEach((row) => sheet.deleteRow(row));

  idToRow.clear();
  sheet.getDataRange().getValues().forEach((row, index) => {
    if (index > 0) idToRow.set(row[0], index + 1);
  });

  (payload.upserts || []).forEach((record) => {
    const rowValues = HEADERS.map((header) => {
      if (header === "syncedAt") return new Date().toISOString();
      return record[header] ?? "";
    });
    const row = idToRow.get(record.id);
    if (row) {
      sheet.getRange(row, 1, 1, HEADERS.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (firstRow[0] !== "id") {
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}
```

## 保存済みデータについて

同期機能を追加しても、端末内の既存データは削除されません。
既存データは初回同期時に「未同期」として扱われ、まとめてGoogleスプレッドシートへ送信されます。

## PostgreSQLへの取り込み

ローカルの `postgres` Dockerコンテナに、食事データ用の `meal_note` DBと `meal_records` テーブルを作成できます。
Googleスプレッドシートの `Meal Note` シートをCSVでダウンロードしてから、以下を実行してください。

バッチファイルにCSVをドラッグ&ドロップする場合:

```text
postgres\import-meals.bat
```

コマンドでCSVパスを指定する場合:

```cmd
postgres\import-meals.bat C:\path\to\MealNote.csv
```

PowerShellから直接実行する場合:

```powershell
powershell -ExecutionPolicy Bypass -File .\postgres\Import-MealCsv.ps1 -CsvPath C:\path\to\MealNote.csv
```

CSVの列はApps Scriptの `HEADERS` と同じ順番を想定しています。

```text
id,mealName,type,start,end,durationMinutes,alcohol,note,hasPhoto,createdAt,updatedAt,syncedAt,syncedFrom
```

同じ `id` の行は追加ではなく更新されるため、同じCSVを再取り込みしても重複しません。

### タスクスケジューラ登録

毎日決まった時刻にCSVをPostgreSQLへ取り込む場合は、以下を実行します。
時刻を省略すると `03:00`、タスク名を省略すると `MealNotePostgresImport` になります。

```cmd
postgres\register-meal-import-task.bat C:\path\to\MealNote.csv 03:00 MealNotePostgresImport
```

登録されたタスクは、内部的に以下を実行します。

```cmd
postgres\run-scheduled-import.bat C:\path\to\MealNote.csv
```

実行ログは以下に出力されます。

```text
postgres\logs\meal-import.log
```

CSVの保存場所を変えた場合は、同じ登録コマンドを新しいCSVパスで再実行してください。既存タスクは上書きされます。
