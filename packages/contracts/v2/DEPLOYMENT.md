# RVYN 預售部署候選包（不自動上鏈）

本輪保留 V2 `GenesisPresale`（募資全額建池）並新增 V3 `GenesisPresaleV3`（管理員指定建池金額，結算後提領剩餘募資）。GenesisSale 只保留舊式即時交付相容性，**不能用它代替 RVYN 預售**。已部署的 V1/V2 合約不可升級，V3 必須以新地址部署。

執行 `node scripts/prepare-contract-release.mjs` 會編譯、驗證新增規則並產生 SHA-256 manifest；不讀取私鑰、不發交易。下次應使用同一份經審查產物。原始碼、編譯器、依賴或參數改變時重新檢驗；舊版人工驗收不代表新版已驗收。

## 固定商業規則

- RVYN 固定 1,000 萬枚，預售 100 萬、流動性配置 500 萬、團隊／營運 200 萬、生態 100 萬、行銷／社群 100 萬。
- 單枚 0.0001 ETH；無最低募資門檻、100 ETH 硬頂、每錢包累計 0.25 ETH／2,500 RVYN；限錢包不等於限人。
- sponsor 先核准，再以 `depositInventory()` 單獨轉入 **800 萬 RVYN**；確認庫存已在合約後，才以 `open()` 開始 14 天預售。管理員可用 `close()` 手動關閉，達硬上限或到期時也會停止接受購買。
- 空募資或建池逾期可 failSale，買方 refund(recipient) 取回認購 ETH；gas 不退。沒有管理員提領募資款的捷徑。
- 達標後 7 天內必須完成原子建池；建池失敗不會釋出款項，逾期任何人可 failSale，再退款。此 7 天與下述未用庫存鎖是安全暫定值。
- V2 的 settle 同筆交易將全部 ETH 與按預售價格匹配的 RVYN 投入 RVYN/WETH 池，LP 鎖 365 天；流動性配置中未配對的 RVYN 鎖 365 天，團隊 200 萬枚鎖 730 天。未售預售 RVYN 在成功結算時銷毀。
- V3 的 createPool(ethAmount) 僅限 sponsor 由管理頁手動指定建池 ETH；只能在關閉／到期後、結算窗口內執行，且不得超過實際募資。建池成功後，withdraw(amount) 僅能提領未投入建池的剩餘募資，預售進行中不能提領。
- RVYN 現無實際用途、分紅或保本權利；Boost 為 ETH，實際費率由平台鏈上設定決定。

## 部署順序與必要檢核

1. 選定鏈、真實管理／收款 signer。Platform 初始 Treasury 必須等於 owner；新 Treasury 需自行接受。
2. 以 V2 Platform 建立／驗證 RVYN，不覆寫舊 Registry。若重用舊 Token，先盤點既有買方與庫存，不能假設還持有完整供應量，也不能增發補齊。
3. 從官方資料核對 **Uniswap V2 Router02、Factory、WETH** 在該鏈的地址與程式碼。Universal Router、V3、V4 均不是本合約的相容介面。候選包沒有預填猜測地址。
4. 部署 GenesisPresale(token, sponsor, router)，核對只讀常數、router.factory/WETH、token 供應量，完成 explorer 原始碼驗證。constructor 的介面檢查**無法辨識惡意 DEX**，必須人工核對可信部署。
5. 網站先接上新版 ABI／版本登錄／認購、退款與 claim，才核准庫存及 open；目前網站仍用 V1，不能直接用舊購買按鈕操作 Presale。
6. pool 必須未有既存 LP。既存池、捐贈或搶先建池可能使精確比例建池失敗；7 天逾期退款是退出路徑，不承諾一定上市。
7. settle 成功後記錄三個 lock 地址與到期時間、RVYN/WETH pool 及已銷毀未售數量。claim/refund 可由買方指定自己的接收地址，以避免拒收 ETH 合約錢包卡款。

## 審查界線

已做本機回歸含 200 個錢包募滿、重複購買限額、退款、錯誤收款、建池失敗回滾、預算與 claim 重複提領、鎖倉到期。DEX 使用明確標示的 test double；正式 DEX/fork 驗证和獨立審查仍待完成。不能將此候選包標為「免測主網核准」。鎖定 LP 不保證價格，也不防止營運者出售其餘未鎖持幣。
