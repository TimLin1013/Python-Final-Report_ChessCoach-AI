# ♟ Chess — 國際象棋

深色精緻風格的 Flask 國際象棋應用程式，使用 `python-chess` 作為棋局引擎。

## 功能

- 完整國際象棋規則（將軍、將死、僵局、吃過路兵、王車易位、兵的升變）
- 黑白棋子清晰顯示，深色豪華棋盤風格
- 合法走步提示（點選棋子後顯示可移動位置）
- 被吃棋子追蹤
- 棋譜紀錄（簡化代數記法）
- 遊戲結束彈窗

## 安裝與執行

```bash
# 1. 安裝依賴
pip install -r requirements.txt

# 2. 啟動伺服器
python app.py

# 3. 開啟瀏覽器
http://localhost:5000
```

## 專案結構

```
chess_app/
├── app.py              ← Flask 後端（API + Session）
├── requirements.txt    ← 依賴清單
├── README.md           ← 說明文件
├── templates/
│   └── index.html      ← 主頁面
└── static/
    ├── css/style.css   ← 深色精緻樣式
    └── js/chess.js     ← 前端遊戲邏輯
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/new_game` | 建立新局 |
| POST | `/api/get_moves` | 取得合法走步 |
| POST | `/api/move` | 執行走步 |
| POST | `/api/reset` | 重置棋局 |

## 技術棧

- **後端**：Flask 3.0, python-chess 1.10
- **前端**：原生 HTML/CSS/JavaScript（無框架）
- **字型**：Cinzel + Crimson Pro (Google Fonts)
