# ROVYN CORE 操作與上線手冊

> 2026-09-14 更新：下列首次啟用流程是已交付的 V1 歷史紀錄。RVYN 主網候選流程請改讀 `packages/contracts/v2/DEPLOYMENT.md`；營運程式與外部服務請讀 `docs/INFRASTRUCTURE.md`。V3 候選尚未替換目前已部署的 V2 預售地址，也不能把 V1 的 GEN 測試資產當作 RVYN 預售庫存。V1 真實測試網人工流程由使用者回報完成，不代表 RVYN 預售與 DEX 整合已在真實鏈驗收。

## 首次啟用

網站先以 owner-only 私有方式交付，預設 Robinhood Testnet 46630。網站登入與錢包簽署是兩種不同授權。瀏覽、搜尋、填寫草稿不需要連錢包；私有網址仍需要網站擁有者登入。

1. 以 MetaMask 開啟 `/admin`，切換至提供的管理地址 `0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e`。需要自己持有該地址的簽署權限與該網路 ETH gas。本程式不保存私鑰。
2. 簽署一次性管理訊息，核對品牌、網路與 Treasury；部署平台。核對錢包交易預覽後簽署，等待 3 個確認。若等待中斷，用交易雜湊登錄既有部署，不要重複部署。
3. 由管理頁前往發行表單。RVYN 候選資料為 RovynCore / RVYN / 10,000,000 枚；只有新版平台部署並驗證後才可在主網簽署，不能用目前 V1 平台產生替代品。
4. 同步成功後，將 #001 Token 地址登錄到管理頁。
5. 部署並驗證 RVYN GenesisPresaleV3，先核准並以 `depositInventory()` 轉入 8,000,000 RVYN，確認庫存後再由管理員手動 `open()` 開始 14 天預售。預售單枚 0.0001 ETH、累計單錢包上限 0.25 ETH／2,500 RVYN、硬上限 100 ETH；庫存不是憑空生成。關閉後由 sponsor 指定建池 ETH，建池成功後才可提領未投入建池的餘額。
6. 用另一個測試錢包驗收發行、Boost、購買與 Treasury 提領。測試網完成且商業條件與安全審查定案後，再決定是否主網上線。

### 白名單登記與預售時限（V4 候選流程）

- 管理台的「白名單登記時段」設定 UTC+8 時間的開始與截止時間；公開頁與登記 API 依伺服器時間自動開關。截止只停止新申請，不會刪除已送出的資料；管理員仍可審核既有申請。
- 登記申請不等於購買資格。管理員審核後，必須將核准地址的 Merkle root 發布並確認在 V4 合約上，地址才取得鏈上購買資格；預售開啟時 root 凍結。
- 預售的購買期限不是上述白名單登記截止時間。V4 的鏈上 `open()` 交易成功後才開始固定 14 天購買期間，合約到期後停止購買。
- 白名單排程只控制網站登記入口，不是鏈上自動執行器；實際購買資格、預售開關與期限仍由已部署合約驗證。V4 尚須獨立安全審計及部署前檢查，未完成前不得開放正式販售。

## 管理

- 管理設定、註冊部署、隱藏內容、處理檢舉皆需要绑定操作內容、來源網域、nonce 和 5 分鐘期限的一次性簽名。
- 調整 Launch Fee / Boost 方案、Treasury 提領與 Sale 啟停需要鏈上交易。費用必須與合約即時價格一致。
- 平台與 Sale 費用記入合約中收款人的 `proceeds`，由該 Treasury 簽署 `withdraw()` 才轉出；變更 Treasury 不會把舊收款人的應收款轉給新收款人。
- 合約權限支援 `transferOwnership` / `acceptOwnership`，但網站管理 allowlist 目前固定在 `packages/web3/config.ts` 的 OWNER。改 multisig 或管理地址時，必須一併更新網站簽名驗證流程；不要只轉移合約 owner。
- 網站維護模式停止前端交易與新 metadata，但不是鏈上緊急停機。平台 owner 可另外呼叫 `setPaused(true)`；Sale 呼叫 `setActive(false)`。使用 ABI 與正確網路的 explorer 合約介面即可操作。
- 隱藏項目只影響站內列表；已發行代幣、區塊鏈交易與公開 metadata 不會被抹除。

## 事件同步与故障復原

交易成功後將 receipt 同步到 `/api/sync`。只有配置的平台合約事件會被接受；Asset Record 預設需達 8 個確認（含交易所在區塊），可由 `LAUNCH_CONFIRMATION_DEPTH` 調整。未達門檻的紀錄保持 pending，不列入公開目錄；同步會核對區塊 hash，重組或短暫無法確認時保留紀錄並標示狀態。`chain:tx:logIndex` 保證 Boost 不會重複計入。管理同步仍是逐批追蹤，每批最多 500 個區塊並重查 12 區塊視窗，不是完整常駐鏈索引器；需由已設定的營運排程執行 `scripts/ops-runner.mjs` 才會定期更新。

RPC 失效時，頁面顯示不可用，既有列表仍可讀。不要因 receipt 查詢逾時再付款；先查 explorer、重試原交易同步。替換交易的最終 hash 若不同，使用最終成功 hash。同一筆交易 revert 時，確認 explorer 的狀態後才重新發送。

設定服務端 `RPC_TESTNET` / `RPC_MAINNET` 可覆蓋公共 RPC；在 Sites 環境變數管理中配置，不要將 API key 放入原始碼或聊天。錢包的 RPC 由 MetaMask 網路設定管理。

## 合約驗證、備份、回滾

- `packages/contracts/artifacts/standard-input.json` 包含本次 Solidity 與 OpenZeppelin 來源。compiler.json 記錄完整 compiler 版本；optimizer=200、EVM Paris。選正確合約名稱與部署 constructor 參數向 explorer 提交 Standard JSON 驗證。尚未部署，所以目前沒有已驗證地址。
- 發布新版前備份託管 D1、R2 與 `deployment:<chainId>` 設定；migration 應向前相容，禁止重建生產資料表。私有託管平台的資料匯出工具/備份能力需由營運環境確認。
- 網站回滾選擇先前已儲存的 Sites 版本；保留目前資料庫，不重放已套用 migration。鏈上合約不可升級，網站回滾不能撤銷交易、費用或合約部署。
- 合約需要替換時，先停用舊平台、規劃資料遷移與公告，不能直接覆寫現有 Registry；後端已阻止無意覆寫。

## 主網前必辦

獨立合約安全審查、真實 MetaMask 測試網 E2E、正式 RPC 與備份監控、Treasury 權限/多簽設計、營運者與司法管轄區、法律條款與風險揭露、正式域名、公開存取範圍、品牌及銷售數量。這些未完成，不能把 V1 測試交付當作主網商業上線核准。
