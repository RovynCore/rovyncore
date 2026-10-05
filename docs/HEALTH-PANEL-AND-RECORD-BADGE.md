# RVYN 健康儀表板與 Onchain Record 徽章

2026-10-05。兩項新功能，皆為新增檔案加上最小幅度的接入；沒有改動合約、資料庫結構、API 路由（`app/api/[...path]/route.ts`）或部署設定。

## 1. RVYN 健康儀表板（`/transparency`）

在 `/transparency` 頁面的合約清單之後新增一個區塊，由**訪客的瀏覽器直接用公開 RPC 讀合約**，不經過我們的伺服器或資料庫：

- RVYN 總供應量、已銷毀量，以及預售合約／管理錢包／多簽各持有多少。
- 預售合約狀態、募資進度、白名單根值是否已上鏈、庫存是否已存入、剩餘時間、首池與提領數字。
- 管理員可自行決定去向的代幣（管理者、產品、社群、空投）已發出多少。
- 團隊鎖倉：已解鎖比例、各次釋出日期。
- 首池流動性鎖倉：被鎖定的 LP 比例與解鎖日期（只計算首次鎖倉；之後加池另外鎖倉，未納入）。

原則：讀取失敗就標示「無法讀取」，**不猜、不補零**；全部讀不到時只顯示錯誤，不顯示任何數字。總供應量大於 10,000,000 會顯示警示。每 60 秒更新一次，頁面隱藏時暫停。四種語言。

| 檔案 | 用途 |
|---|---|
| `lib/rvyn-health.ts` | 讀取與推導邏輯（純函式；讀取介面可注入，方便測試） |
| `lib/rvyn-health-config.ts` | **合約地址設定**。部署 V6 後只需改這裡的 `sale` |
| `components/rvyn-health-panel.tsx` / `.css` | 介面 |
| `app/transparency/page.tsx` | 只加了一行 import 和一行 `<RvynHealthPanel />` |
| `tests/rvyn-health.test.ts` | 14 項測試 |

### 部署後請確認
1. 開 `/transparency`，確認區塊載入、區塊高度與時間合理。
2. 把數字與區塊瀏覽器上的合約 Read 頁對一次（供應量、預售合約狀態）。
3. **若日後加上 CSP**，`connect-src` 必須允許 `https://rpc.mainnet.chain.robinhood.com`，否則儀表板會顯示「無法連上區塊鏈」。
4. 每位訪客都會打公共 RPC。流量大時可能被限流；屆時可改用自家代理或專用 RPC（在 `components/rvyn-health-panel.tsx` 的 `healthClient()` 換 URL）。

### 已知限制
- 目前合約為 V5 的 getter 名稱。V6 若更名或改行為，需更新 `lib/rvyn-health.ts` 的 ABI 與推導邏輯，並補測試。
- 只讀「首次」LP 鎖倉，不含後續 `addFutureLiquidity` 產生的鎖倉。
- 預售合約的 `state` 在 14 天期限結束後仍可能是「進行中」（直到有人呼叫 `close()`）；介面會另外提示「期限已過」。

## 2. Onchain Record 徽章

任何已確認的資產紀錄都有一張可嵌入別人網站的 SVG 徽章，點擊回到該資產的公開紀錄。

- 圖片：`https://www.rovyncore.com/badge/<合約地址>.svg`
- 資產紀錄頁側欄新增「嵌入」區塊（只有 `active` 狀態才出現），提供 HTML／Markdown 程式碼與複製按鈕。
- 徽章**只陳述可觀測事實**：已確認的發射紀錄與日期。不是安全評級、審計或背書，內文也這樣寫。`pending` 顯示「等待確認」，`unavailable` 或未知狀態顯示「暫時無法使用」，都不會顯示成已確認。
- 隱藏或不存在的資產回 404。

| 檔案 | 用途 |
|---|---|
| `lib/record-badge.ts` | SVG 產生、XML 跳脫、位址解析、嵌入程式碼（純函式） |
| `app/badge/[address]/route.ts` | 路由；Workers 邊緣快取（5 分鐘）；查無資產時才計入限流 |
| `components/record-badge-embed.tsx` / `.css` | 資產頁嵌入區塊 |
| `app/assets/robinhood/[contract]/page.tsx` | 只加了一行 import 和一行 `<RecordBadgeEmbed … />` |
| `tests/record-badge.test.ts`、`tests/badge-route.test.ts` | 18 項測試（路由測試把真實的 route 檔案打包後以假的資料庫與快取執行） |

安全設計：建立者填的名稱與代號一律跳脫並移除控制字元與雙向覆寫字元；長度有上限；嵌入程式碼的 alt 文字固定，不含任何建立者文字；回應附 `Content-Security-Policy: default-src 'none'; sandbox`，單獨開啟也不能執行腳本。

### 部署後請確認（把 `<地址>` 換成 RVYN 的合約地址）
```sh
curl -sI https://www.rovyncore.com/badge/<地址>.svg   # 預期 200、content-type: image/svg+xml
curl -s  https://www.rovyncore.com/badge/<地址>.svg | head -c 400
curl -sI https://www.rovyncore.com/badge/0x123.svg    # 預期 404
```
並打開 `/assets/robinhood/<地址>`，確認側欄出現「嵌入」區塊、預覽圖有顯示、複製按鈕可用。

### 需要你決定
- **建立者填的名稱會以較小的灰字出現在我們的徽章上。** 有人可能把名稱取成「VERIFIED SAFE AUDITED」之類來借用平台信譽（名稱已限制 30 個字寬，但短名稱仍可通過）。可以選擇：維持現狀並在條款註明、只顯示代號、或對這類字眼加黑名單。程式目前採第一種。
- 每次未命中快取的請求會讀一次 D1。若流量變大，可在 Cloudflare 對 `/badge/*` 加快取規則。
- 徽章文字目前只有英文（會被嵌到別人網站上）。

## 驗證紀錄（2026-10-05，開發環境）

- `npm run lint`：0 錯誤、0 警告（全專案）。
- `npx tsc --noEmit`：只有既有的兩個 `vite.config.ts` 錯誤（引用的 `.openai/hosting.json`、`build/sites-vite-plugin` 不在 repo 中），沒有新增錯誤。
- `npm run test:health`：14/14。`npm run test:badge`：18/18。`test:validation`、localization 測試通過。
- 瀏覽器實測（Chromium + 模擬的 RPC 回應）：待開始／進行中／已結算／讀取失敗／繁中／韓文手機版皆正確顯示，無 JS 錯誤；徽章五種情境（含惡意名稱、CJK）版面正確；嵌入區塊的 HTML／Markdown 切換與複製按鈕可用。
- 破壞測試：暫時移除路由的限流或把 CSP 改鬆，測試會失敗，確認測試有效。

### 尚未驗證
- **沒有對真實的 Robinhood Chain 做過讀取**：開發環境的網路政策擋住了 RPC 與區塊瀏覽器。儀表板用的是模擬 RPC，函式名稱與參數取自 `RovynPresaleV5.sol` 原始碼。**請在部署後用上面的清單核對真實數字。**
- **沒有完整建置與在 vinext 中實際跑過新路由**：repo 缺少建置所需的檔案（見上）。`app/badge/[address]/route.ts` 沿用既有 `route.ts` 的寫法並通過型別檢查與打包測試，但請在你的環境 `npm run build` 後確認 `/badge/<地址>.svg` 真的有被路由到。
