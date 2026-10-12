# Lightdive 工作日誌

記錄 RovynCore: Lightdive（潛光遠征）從構想到測試網部署的工作內容。新的工作請往下追加，標明日期。

---

## 2026-10-06：構想、白皮書、合約、測試網上線

PR：[RovynCore/rovyncore#1](https://github.com/RovynCore/rovyncore/pull/1)，分支 `claude/kind-wright-ogk2hq`。

### 1. 遊戲方向

- 討論過的類型：軌道防禦、訊號解碼、核心鍛造、連線解謎、卡牌、節奏、文字冒險、收集對戰，以及常見 NFT 遊戲類型（Axie、StepN、Pixels、Telegram 點擊等）。
- 老闆選擇參考 2021 年的 **CryptoMines**：保留它「船＋船員→派去星球→領獎勵」的簡單結構與美術收集感，逐條修正它崩盤的原因。
- 世界觀沿用文案行銷組《NFT 世界觀與故事 v3》：光塔（船）、共鳴稜鏡（新增的風險元素）、探索者（船員）、光源座標（星球）、光塵、歸航。
- Signal-Keeper（訊號守護者）定位為光源觀測站的 NPC 和第一季主視覺，不做成 NFT。

### 2. CryptoMines 的失敗原因與修正

| 失敗原因 | Lightdive 的做法 |
|---|---|
| 獎勵綁美元，幣跌就要多印幣（死亡螺旋） | 獎勵以 RVYN 計，核光池每天只釋出餘額的固定比例 |
| 發行量隨人數增加 | 每日釋出與人數無關，人多時每人分得少 |
| 唯一消耗是抽卡 | NFT 航程用完燒毀、鑄造費 15% 銷毀、70% 回流核光池、提領手續費回流 |
| NFT 無限量 | 光塔、稜鏡有流通硬上限，稀有度用牌組抽，數量精確 |
| 沒有遊戲性 | 席位與光度搭配、稜鏡光束風險、屬性與同頻、異相、賽季 |

### 3. 白皮書 v1.0（老闆 2026-10-06 確認）

檔案：`docs/lightdive/Lightdive-Whitepaper-v1.0.pdf`（22 頁），原始檔 `source/whitepaper.html`。

定案參數：

| 項目 | 值 |
|---|---|
| 核光池初始注入 | 1,000,000 RVYN（「產品與生態」配置全額） |
| 每日釋出 | 餘額的 1.0%；早鳥上限每點光塵 0.18 RVYN |
| 鑄造價格 | 光塔 300、稜鏡 120、探索者 40 RVYN |
| 費用分流 | 核光池 70%、銷毀 15%、營運金庫 15% |
| 航程次數 | 光塔 120、稜鏡 30、探索者 10 |
| 數量上限 | 光塔流通 3,000、稜鏡流通 6,000；探索者每副牌組 10,000 |
| 光束倍率 | 改為區間（方案 A），普通成功 1.0–1.2 倍，最高 10 倍，三種光束平均都是 1.00 倍 |
| 機率 | 全部公開（取代 v3「機率屬內部資料」） |
| 提領手續費 | 15% 起每天降 1%，第 15 天免費，全數回核光池 |
| 新手優惠 | 每錢包三種 NFT 各首個 9 折，由營運金庫吸收 |

過程中的修正：
- 第一版白皮書的次數模擬用「每季鑄造上限」，光塔壽命縮短後會造成老玩家無法續購；改成「流通上限」並重跑模擬。修正後玩家整體第一年領回約投入的 57%–72%。
- 市場版稅以 ETH 支付，無法放進 RVYN 核光池，改為 5% 全數進營運金庫。

經濟模擬：`docs/lightdive/simulation/`（365 天、三種情境）。

### 4. 智能合約（候選版，未審計）

位置：`packages/contracts/lightdive/`，solc 0.8.28、optimizer 200、evm paris。

| 合約 | 職責 |
|---|---|
| LightdiveConfig | 所有參數與上下限；光束機率表必須平均 1.00 倍、最高 10 倍 |
| LightdiveNFT | 三種 NFT（RVDIV）、鏈上屬性、航程、流通上限（只能調低） |
| RandomnessBeacon | 每小時承諾－揭露隨機數，48 小時未揭露以 1.00 倍結算 |
| CoreLightPool | 核光池，沒有管理員提領函式 |
| LightdiveMinter | 牌組抽卡、兩步驟鑄造、首抽折扣、早期限購、費用分流與銷毀 |
| Expedition | 組隊、每日潛光、光塵比例結算、提領、歸航燒毀 |

- 測試：`npm run test:lightdive`，8 項，已加入 CI。
- 測試抓到並修正的問題：探索者全部歸航後空光塔仍能出發。
- OpenZeppelin 5.6 的 ERC721 需要 Cancun 指令，與專案的 paris 編譯目標不相容，NFT 核心改為自寫（行為比照 OZ），審計時要一起看。
- Robinhood Chain 上查不到 VRF 服務，先用承諾－揭露；營運錢包不能參與遊戲。

### 5. 網站與工具

- `/game/lightdive`：鑄造、我的光塔、收藏、航行日誌、公開機率；四語系；不收錄、不在選單。原 `/game` 頁不變。
- `/admin/lightdive`：核光池帳目、隨機數狀態、牌組與上限、開賣、暫停、參數、接受管理權。
- `lib/lightdive.ts`、`lib/lightdive-copy.ts`、`components/lightdive/`。
- `PlatformContext` 新增 `walletProvider`、`switchWalletChain`，讓頁面能在遊戲鏈上簽署。
- 腳本：`npm run lightdive:deploy`（拒絕主網）、`npm run lightdive:operator`。
- 修正：讀取鏈上紀錄時 viem 會快取區塊高度，剛確認的交易會漏讀，改為不快取。
- 修正：白皮書排版腳本 `render.js` 違反 lint 規則，改為 ES module。

### 6. 測試網部署（Robinhood Chain 測試網，46630）

部署區塊 130017649，地址記在 `packages/web3/lightdive.json`：

| 合約 | 地址 |
|---|---|
| tRVYN（測試幣） | `0x0e161fc11cc50de25411bfb0141b32f7419a55ae` |
| LightdiveConfig | `0xb296df1e0bf288f2c5748b99ac2acb3139a2b206` |
| LightdiveNFT | `0x8ee6f186c762ed9ca0ea25194d4f7719285b577d` |
| RandomnessBeacon | `0x34215d740324fb8a8440314c895fed252f3bcf7e` |
| CoreLightPool | `0xdcc1688bab3209a2038494fb571ec27f3e566d48` |
| LightdiveMinter | `0x342a55a8e5cf3eccc65f5199cc79be6d9dbfd319` |
| Expedition | `0xf07f4d41b2372e15b6f148893e2242ac95091cc4` |

- 核光池已注入 1,000,000 tRVYN；光塔已開賣。
- 其餘 9,000,000 tRVYN 與 6 個合約的管理權已轉向 `0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e`，**需在 `/admin/lightdive` 按「接受」才生效**。
- 營運金庫（treasury）與版稅收款為同一地址。
- 部署錢包 `0xC6AF5450b83Bf050c05745758786BDA2f2D5b83A` 與營運錢包 `0xe36Da1C038F9b6B06688df7d60A6358586F06C90` 是在雲端工作環境產生的測試網錢包。部署錢包的私鑰沒有保存在 repo，工作環境關閉後就會遺失；管理權已轉出，所以不影響控制權。
- 隨機數：部署時已承諾 hour 497587–497634（48 小時）。之後由 `.github/workflows/lightdive-operator.yml` 每 15 分鐘執行，需要 GitHub secrets `LIGHTDIVE_OPERATOR_PRIVATE_KEY`、`LIGHTDIVE_SEED_SECRET`（已設定）；排程只會在 main 上執行。

### 7. 驗證

- 本機鏈（chain id 46630）完整走過：部署、承諾與揭露、鑄造、組隊、潛光、結算；一次 ×1.07 的潛光領到 22.34 RVYN，與公式一致。
- lint、typecheck、build 通過；桌機與手機截圖檢查畫面。
- PR CI：Lightdive 測試通過；`test:api` 中需要即時抓 X 貼文的測試因 X 回應 502 失敗，重跑一次結果相同，與本次改動無關。老闆決定移除 X 功能。

### 8. Commits

| Commit | 內容 |
|---|---|
| ef5f84c | 白皮書 v1.0、經濟模擬器與原始檔 |
| 55c20a5 | 排版腳本可用 CHROMIUM_PATH |
| fb3fe58 | 6 個合約與 8 項測試 |
| aba7aac | 排版腳本改為 ES module（修 lint） |
| 7ceae53 | 遊戲頁、管理頁、部署與營運腳本 |
| 77a493c | 美術素材清單 |
| 63f490e | 指向測試網部署、接受管理權按鈕、營運排程 |

### 9. 待辦

| 事項 | 負責 |
|---|---|
| 移除 X 功能，讓 CI 變綠後合併 PR 並部署網站 | 老闆 |
| 在 `/admin/lightdive` 接受 6 個合約的管理權 | 老闆 |
| 美術素材（`ART-ASSETS.md`，最低約 97 張；2026-10-12 移除特別款後為 93 張） | 美術組 |
| 「光橋中斷」「核光回響」航行日誌、光塔與稜鏡燒毀時的名稱、韓文用語 | 文案組 |
| 玩家變多後改用伺服器端索引（目前畫面直接讀鏈上紀錄） | 開發 |
| 主網前：獨立審計、多簽＋時間鎖、隨機數來源複審、法律意見 | 老闆 |

---

## 2026-10-07 至 2026-10-12：美術文件、移除特別款

分支 `claude/modest-allen-eexrhu`。

### 1. 美術文件

- `Lightdive-Art-Direction-v1.0.pdf`：NFT 以外的介面與場景美術需求（星圖、觀測站、Signal-Keeper 立繪與發光層、圖示、卡背、字標、分享圖）。
- `Lightdive-NFT-Art-Direction-v2.1.pdf`（提案，待老闆確認）：光塔改為仰視構圖並規定功能部件；探索者從 7 層人像改為五個無臉職階、17 張插圖；稀有度辨識的六個訊號；依老闆提供的截圖拆解 CryptoMines 的美術。

### 2. 移除光塔與稜鏡的特別款（老闆 2026-10-12 決定）

- 理由：美術資源有限，特別款要額外出圖，維護成本高。
- 合約：`LightdiveMinter` 移除 `Deck.specialLeft` 與 `SPECIAL_BONUS_BP`；光塔、稜鏡的 `variant` 一律為 0，光度只有基準值 ±10%。曜核探索者的星紋（`variant` 1–6）不變。
- 前端：移除特別款名稱與標籤；`packages/web3/lightdive-abi.json` 重新產生。
- 測試：新增「光塔與稜鏡沒有特別款」，`npm run test:lightdive` 9 項全數通過。
- 文件：白皮書第 4.5、5.1、5.2、6.3、7.5、10、13 章與附錄 A 同步修改，決策紀錄新增第 16 項；ART-ASSETS 美術最低張數改為 93。

### 3. 測試網重新部署（2026-10-12）

部署區塊 133677672，地址記在 `packages/web3/lightdive.json`。舊的部署（區塊 130017649）停用，上面的測試 NFT 和 tRVYN 不轉移。

| 合約 | 地址 |
|---|---|
| tRVYN（測試幣） | `0xe6ef63215a44ae735e65b3974eb4bbabb447dbbd` |
| LightdiveConfig | `0xdc80e05dcfd0c40403a9fed83564f9426527abe8` |
| LightdiveNFT | `0x317cce0cd9ae0bd370edbd88e47d4bce7fb8464d` |
| RandomnessBeacon | `0xc3109e96d1b91218ff13168a17898e4f659f3002` |
| CoreLightPool | `0xe078cf9895852a537efd436334adf1c8cccd2701` |
| LightdiveMinter | `0x530e48e0cc7fa8eabca2ff1162de624c787f9c13` |
| Expedition | `0x5a8cb0ae722e56039014159df1a67b7c810bd9bd` |

- 核光池已注入 1,000,000 tRVYN；光塔已開賣（開賣後 48 小時內每錢包最多 3 座）。
- 營運金庫與版稅收款：`0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e`。
- 其餘 9,000,000 tRVYN 與 6 個合約的管理權已轉向同一地址，**需在 `/admin/lightdive` 按「接受」才生效**。
- 隨機數營運錢包沿用 `0xe36Da1C038F9b6B06688df7d60A6358586F06C90`，GitHub secrets 不用改。部署時沒有預先承諾隨機數（營運私鑰只在 GitHub secrets 裡），由營運排程補上。
- 部署錢包 `0x985B3219D55737C65140cf0e948fBd0690636a62` 是在雲端工作環境產生的臨時測試網錢包，私鑰沒有保存，工作環境關閉後遺失；管理權已轉出，不影響控制權。

### 4. 待辦

| 事項 | 負責 |
|---|---|
| 在 `/admin/lightdive` 接受 6 個合約的管理權 | 老闆 |
| 合併本分支到 main 並發布網站：正式網站與每 15 分鐘的營運排程都讀 main 上的 `lightdive.json`，合併前網站仍指向舊部署 | 老闆 |
| 確認 NFT 美術設計書 v2.1 第 08 章的決定 | 老闆 |
