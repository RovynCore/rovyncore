# 測試與 V1.2 逐項核對 — 2026-09-24

## V1.2 需求對照

| V1.2 要求 | 對照結果 | 驗證證據／界線 |
|---|---|---|
| CREATE → RECORD → VERIFY；以同一份 Asset Record 呈現 | 完成 | 發射確認後建立 canonical record；舊 Explore／Verify 導向 Onchain Record。正式 `.com` 目錄及 RVYN 詳情頁已實測載入。 |
| 發射預覽、錢包簽署、確認深度、重載恢復、重複回執與重組處理 | 完成（自動化） | API 整合測試涵蓋預設 8 確認、pending/confirmed/failure、冪等、receipt/block hash 重驗與 reorg；沒有送出真實錢包交易。 |
| 發行來源與初始狀態不可變；事件以追加方式保存 | 完成 | update/delete trigger 測試拒絕修改原始快照和 event；正式回填保留既有 RVYN 發行資訊。更正需新記錄及理由。 |
| 目錄、詳情、建立者篩選、搜尋、歷史與外部連結 | 完成 | API 整合測試覆蓋篩選、搜尋、游標分頁和歷史；正式頁面及目錄／detail／history API 回應成功。 |
| 鏈上目前狀態、快取新鮮度、手動刷新與不可用狀態呈現 | 完成（欄位受限） | 測試覆蓋 10 分鐘新鮮度、30 秒刷新節流、stale/unavailable、保留最後成功讀值；本輪修正 latest unavailable row 被舊 fresh row 遮蔽的排序錯誤並新增 regression test。正式 detail 顯示同步時間和有界的比較欄位。 |
| 公開 API 版本、限流、`Retry-After`、一致資料模型 | 完成 | `schemaVersion: 1.0.0`；測試覆蓋 429 與 `Retry-After`、list/detail/state/history/creator 端點；正式 `.com` 的目錄、RVYN detail、state、history API 均回 HTTP 200。 |
| 創作者 metadata 權限與平台管理更正 | 完成（未做真實管理員交易） | 自動化驗證簽名 ACL 與未授權拒絕；不可變資料庫觸發器通過。未使用正式管理員錢包送出更正。 |
| 不製造熱榜／成交量／安全評級；Boost 不作為已開放功能 | 符合 | 頁面文案與 API 僅呈現可觀測記錄；未知值與尚未觀測分開標示。完整索引、LP/DEX、Boost 開放均不冒充已完成。 |

## 本輪自動化驗收

| 驗收 | 結果 | 覆蓋範圍 |
|---|---:|---|
| TypeScript `tsc --noEmit` | 通過 | 應用、API、Asset Record 資料層與合約介接 |
| 全專案 `npm run lint` | 通過 | 0 errors、0 warnings；清除先前 78 個錯誤與 33 個警告 |
| `npm run test:validation` | 4 / 4 通過 | metadata URL、供應格式、UTF-8、排名公式 |
| `npm run test:contracts` | 22 / 22 通過 | 固定供應、費用、Boost、管理權、Treasury、Sale 與庫存限制 |
| `npm run test:api` | 25 / 25 通過 | 確認深度、發行快照、追加式更正、目錄搜尋／分頁／建立者篩選、歷史分頁、重組處理、簽名 ACL、狀態刷新、unavailable 保留最後成功值、限流與 `Retry-After` |
| JavaScript tests (`node --test tests/*.test.mjs`) | 50 / 50 通過 | 全部 `.mjs` 測試 |
| Wallet client tests | 10 / 10 通過 | 用 esbuild bundle 後由 Node test runner 執行，涵蓋 provider、chain switching 與 session/auth flows |
| Production build | 通過 | 新舊相容路由、Asset Record 頁面與 Worker bundle |
| v1.2 核心檔案 ESLint | 通過 | Asset Record 目錄／詳情、API、資料層、同步邏輯與 API 測試，零錯誤與警告 |
| D1 migration | 通過 | 本機與正式 D1 均先備份、驗證後套用；正式端六張新表均存在，asset/origin/state/metadata/event 各 1 筆、links 2 筆、legacy token 1 筆，4 個 append-only trigger 存在，`rows_written=0` 唯讀盤點。 |
| 本機及正式環境瀏覽器冒煙測試 | 通過 | 目錄、RVYN 資產詳情、Launchpad、Explore／Verify 相容導向通過；正式首頁 hero video 已載入且 muted/autoplay/loop 為 true。 |
| 正式 Worker 部署與 API 冒煙測試 | 通過 | 2026-09-24 完整驗收後重新部署；Worker `rovyncore-production` version `01458967-5406-40e0-b950-79c5864b4530`，100% 流量。正式目錄/detail/state/history API 全回 HTTP 200、schema 1.0.0；RVYN state 為 fresh，總供應量 10,000,000、18 decimals，支援欄位比對一致；未支援欄位保留 unknown。 |
| 正式頁面冒煙測試 | 通過 | `.com` 首頁 muted/loop/autoplay 影片已載入；Launchpad、Onchain Record 目錄、RVYN detail 與 `/rvyn` 官方代幣資訊頁可載入；Explore 導向目錄、Verify 導向我的發射紀錄；檢查頁面無 console error。 `/rvyn` 顯示 Preparing launch，未宣稱預售已開放。 |

Ganache 在此 Node/Windows 組合不載入 µWS 原生模組時會自動退回 JavaScript 實作，所有斷言仍通過。資料驗證測試改用 Node 原生 TypeScript stripping，避開本機 `tsx` 啟動時 `uv_os_get_passwd` 系統錯誤。

混合 `.ts`/`.mjs` 的單一 Node 測試啟動在此 Windows/Node 22 環境遇到 extensionless TS import／parameter-property stripping 限制；全部 `.mjs` 測試 50/50 通過，wallet client TypeScript suite 另以 esbuild bundle 執行 10/10 通過，合約套件及 TypeScript typecheck 均通過。`tsx` 直接啟動另曾遇到本機 `uv_os_get_passwd` 系統錯誤，沒有把工具啟動問題誤報成應用斷言失敗。

所有自動化 API/EVM 測試只使用一次性 Ganache、隔離的 Wrangler D1/R2 與臨時錢包私鑰，沒有連接真實錢包、消耗鏈上 ETH、使用正式資料庫或發送外部交易。正式站冒煙測試僅使用公開 GET/API 與頁面讀取，沒有連接用戶錢包或送出鏈上交易。

## 尚未驗收／非 V1.2 已交付範圍

未做真實 Robinhood 錢包發行與重連操作、正式管理員簽署更正、持續負載／Sybil 測試、獨立合約安全審計、法律審查或正式 D1/R2 還原演練；正式 API 冒煙測試也不等於長期 SLA 或完整 RPC failover 驗證。全鏈交易／持有人／DEX 索引、LP 自動驗證、外部註冊、NFT/1155 adapter、SDK、webhooks、API keys、付費 analytics 與 hosted scheduler 屬文件列出的後續建議，並非本次現行功能改版的缺漏。

## Grok 優先修正與 UI/UX 建議回歸 — 2026-09-25

- 驗證：`npm run typecheck`、`npm run lint`（0 errors／0 warnings）、`npm run build`、`npm run test:validation`（4/4）、`npm run test:contracts`（22/22）、`node --test tests/*.test.mjs`（50/50）、Wallet client（10/10）皆通過。
- API 整合：`npm run test:api` 26/26 通過。新增 legacy factory provenance 測試：缺少 factory 地址／版本時標示 `legacy_import`；買賣稅等不可觀測欄位仍為 `unknown`。
- 正式部署：Worker `rovyncore-production` version `6bd1ea3b-da4b-4350-9ba1-cbca695c7bc3`，100% traffic；未執行 D1 migration。正式 `.com` 首頁、靜音循環影片、RVYN、Legal、Asset Record 與 `/record` redirect 均通過冒煙檢查；list/detail/state/history API 皆成功。RVYN 顯示 `PURCHASES NOT OPEN`，Record 顯示歷史匯入來源，鏈上最新狀態 fresh。
- 邊界：所有錢包簽署與合約交易測試使用隔離 Ganache／測試資料；本次沒有連接真實錢包、支出真實 ETH 或送出正式鏈上交易。因此真實 Robinhood 錢包發行演練仍需人工執行。
