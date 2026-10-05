# 第 4 項：營運基礎設施

狀態更新：2026-09-24。既有營運流程持續有效；本次新增 Asset Record schema v2 與鏈上狀態快照／歷史事件。正式上線前仍需在目標 D1 套用 migration、確認 RPC 支援 Robinhood Chain，跑一次受保護的同步／備份驗收，並完成異地還原演練。

## 已準備

- 服務端 RPC：專用主線 → 專用備援 → 公共端點，自動 fallback；每條 8 秒逾時。私鑰／RPC 金鑰不進前端。MetaMask／目前前端直接鏈上讀取仍用其既有 RPC，不會因服務端改動自動切換。
- `/api/ops/sync`：Bearer 金鑰限定，單次最多 5 批、含跨請求鎖與同步紀錄；無 ETH 交易。原本人工同步亦共用此流程。
- `/api/ops/status`：DB、RPC 最新區塊、同步時間、落後區塊、是否配置專用端點。執行器對錯誤、落後 >5000 區塊或 15 分鐘未正常同步告警。
- `/api/ops/snapshot`：以 D1 batch 取得同一批快照，schemaVersion 2，涵蓋設定、metadata、tokens、資產主檔、發行來源、原始／目前／更正快照、展示 metadata、連結、追加式歷史事件、boosts、views、reports、audit；不備份一次性簽名或速率計數。排除 ops 工作狀態。
- 公開 Asset Record：`GET /api/v1/assets` 支援搜尋、創作者篩選與 cursor 分頁；`GET /api/v1/assets/:contract`、`/state`、`/history` 提供一致資料；`GET /api/v1/creators/:wallet/assets` 查詢創作者紀錄。回應含 schemaVersion，限流回應有機器可讀錯誤碼與 `Retry-After`。
- `POST /api/v1/assets/:contract/metadata` 僅允許創作者簽名工作階段更新展示欄位；`POST .../refresh` 更新目前可讀的 ERC-20 欄位，按錢包／資產節流。發行時快照、管理更正與歷史事件採追加紀錄，不覆寫原值。確認深度預設 8，可由 `LAUNCH_CONFIRMATION_DEPTH` 設定；目前狀態新鮮度預設 600 秒，可由 `ASSET_STATE_FRESHNESS_SECONDS` 設定；公開 API 限額預設每 IP／視窗 120 次，可由 `PUBLIC_API_RATE_LIMIT` 設定。
- 加密備份執行器：逐一核對 R2 圖片長度與 ETag，記錄 SHA-256，AES-256-GCM 加密並驗證解密，寫入新檔，絕不覆蓋舊備份。備份金鑰必須異地保管。
- 防濫用：保留每 IP 限流，新增全站每日 100 次上傳、1000 次 metadata 嘗試上限；維護時禁止圖片寫入。這只是費用保護，不是完整 WAF／CAPTCHA，攻擊者可能耗盡日配額。
- 上游錯誤不再把可能含 RPC 金鑰的完整訊息寫入伺服器日誌。

## 接通前需要的服務

**Email 繼續暫停**，預設 `ALERT_CHANNEL=off`。既有寄信程式保留但不啟用、不申辦寄信服務、不寄測試信。未來如要啟用再接通帳號及寄件者。

1. 在 Sites 環境變數設定 `RPC_TESTNET`、`RPC_MAINNET` 及各自 `_FALLBACK`。採兩個獨立可靠來源；供應商须支援 Robinhood Chain，不能只挑便宜的 Ethereum 套餐。本輪沒有訂購付費服務。
2. `OPS_TOKEN` 使用至少 32 字元隨機金鑰，僅給伺服器與可信任排程。不要公開於 URL、前端或聊天。
3. 在持續在線的執行環境每 5 分鐘執行 `node scripts/ops-runner.mjs`；每日一次額外設定 `GENESIS_BACKUP=1`。不可依賴此聊天或會休眠的個人電腦維持正式營運。排程服務需防止重疊執行並保存退出狀態。
4. 執行環境設定 `GENESIS_URL`、`OPS_TOKEN`、`BACKUP_KEY`（32 bytes hex）、`BACKUP_DIR`、`ALERT_WEBHOOK`（接收 JSON text 的 HTTPS 端點）。私有 Sites 如有登入閘道，另需平台支援的 `SITES_AUTH_TOKEN`；不要拿短效瀏覽憑證當長期服務帳戶。若不能取得持續有效的閘道憑證，先解決官方機器存取方式，不改公開權限來繞過登入。
5. 備份保留 30 天。執行器在新檔寫入、讀回及解密驗證成功後，才刪除指定備份目錄內、同金鑰可驗證且已過期的備份；保留最新檔及不相關、損壞或不同金鑰的檔案。GitHub 異地 artifact 另設定 retention-days: 30。尚待接通及實際還原演練。
6. 主網公開前確認 Cloudflare Turnstile production hostname／widget 設定，並在主網部署後做一次故障告警（目前不寄 Email）與異地還原演練。

## 快照界線與還原

起步版上限每表 10000 行、1000 張圖片、總媒體 100MB；超過即報錯，不輸出看似完整的殘缺備份。成長後必須切換供應商原生匯出／串流分頁備份。來源 UUID 圖片不覆寫；上傳期間可能包含額外孤立圖片，但快照所用既存圖片不應改變或刪除。

`scripts/ops-runner.mjs` 匯出 decryptBackup，使用安全注入的 BACKUP_KEY 解密；還原至隔離測試環境，先驗證 schemaVersion、每個 asset 的 SHA-256、表名及結構，再用 prepared statements 匯入 13 張表和 R2。schemaVersion 1 備份僅含舊表，schemaVersion 2 另含六張 Asset Record 表。不要將快照資料當 SQL 字串執行。舊 challenges/limits 不還原；保留正確 deployment 和 cursor，從鏈上重同步。**目前僅驗證加解密與檔案完整性，不代表已完成生產 DB/R2 還原演練。**

## 第 5 項（管理與法律）已確認資料

- 初期收款與管理沿用已授權錢包；V2 平台更換 Treasury 是兩階段確認。Presale sponsor 固定，遺失權限會影響預算／鎖倉領取。
- 2/3 多簽需要三個真實 signer 與備援安排；地址由本人提供並測試，不能虛構或由 AI 代管私鑰。現有網站 EOA 簽名認證須另做多簽相容。
- 營運者 ROVYN CORE 團隊；全球目標市場（限合法提供及使用地區）；官方 X https://x.com/RovynCORE。品牌 ROVYN CORE，四語介面與條款，英文預設。多簽暫不採用。網站條款不替代法律審查。
- 條款必須明示 GEN 現無用途、無股權／分紅／保本、募資規則、資金用途、未鎖儲備及退款／鎖倉限制。已做技術開發不表示法律合規已完成。
