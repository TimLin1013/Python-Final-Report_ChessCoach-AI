# ♟ Chess — 國際象棋互動教學系統

深色精緻風格的 Flask 國際象棋應用程式，使用 `python-chess` 作為棋局引擎，支援 Stockfish AI 對戰與 Google Gemini AI 棋評助手。

## 功能

- **雙人對戰 / AI 對戰**：隨時可在遊戲中切換模式
- **Stockfish 引擎**：四種難度（初級/中級/高級/大師），AI 自動回應
- **棋盤翻轉**：執黑時自動翻轉棋盤，符合真實對弈視角
- **棋譜回放**：上一步/下一步瀏覽（AI 模式跳玩家走的步），回朔後可接續下棋並覆蓋後續棋譜
- **悔棋**：AI 模式下自動退兩步（含 AI 那步）
- **儲存/讀取棋局**：SQLite 資料庫，支援命名、刪除、結果標示（1-0 / 0-1 / ½-½）
- **AI 棋評助手**：整合 Google Gemini API，自然語言詢問走法建議與局面分析
- **被吃棋子追蹤**：按種類排序（后→車→象→馬→兵）
- **升變選擇**：自動偵測升變並彈出選擇介面
- **完整規則支援**：王車易位、吃過路兵、將軍、將死、僵局

## 安裝

```bash
pip install -r requirements.txt
```

## 環境設定

```bash
# 複製範本並填入金鑰
cp .env.example .env
```

編輯 `.env`，填入你的 Gemini API 金鑰：

```
GEMINI_API_KEY=你的金鑰
```

金鑰取得：[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## 目錄結構

```
chess_app/
├── app.py              ← Flask 後端
├── requirements.txt
├── README.md
├── .env.example        ← 環境變數範本
├── stockfish.exe       ← 自行下載放置（https://stockfishchess.org/download/）
├── chess.db            ← 自動建立（已加入 .gitignore）
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/chess.js
```

## 啟動

```bash
python app.py
# 開啟 http://localhost:5000
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/new_game` | 建立新局 |
| POST | `/api/get_moves` | 取得合法走步 |
| POST | `/api/move` | 執行走步 |
| POST | `/api/undo` | 悔棋 |
| POST | `/api/reset` | 重置棋局 |
| POST | `/api/branch` | 從指定 FEN 接續（回放分支）|
| POST | `/api/replay_moves` | 回放模式的合法走步查詢 |
| POST | `/api/fen_status` | 查詢指定 FEN 的將軍狀態 |
| POST | `/api/save_game` | 儲存棋局 |
| GET  | `/api/list_games` | 列出所有儲存 |
| POST | `/api/load_game/<id>` | 讀取棋局 |
| GET  | `/api/fen_history/<id>` | 取得完整 FEN 歷史（供回放）|
| DELETE | `/api/delete_game/<id>` | 刪除儲存 |
| POST | `/api/stockfish` | Stockfish 出棋 |
| POST | `/api/chat` | AI 棋評助手（Gemini）|

## 技術架構

- **後端**：Flask 3.0、python-chess 1.10、SQLite、requests、python-dotenv
- **前端**：原生 HTML / CSS / JavaScript
- **AI**：Stockfish 引擎、Google Gemini API（gemini-3-flash-preview）
- **字型**：Cinzel + Crimson Pro（Google Fonts）