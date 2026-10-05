# Genesis V1 合約內部安全審查

日期：2026-09-12（UTC+8）  
來源版本：ab06d7b218200c73516fdd2ffaf357c21e9e122c  
性質：原始碼人工審查、測試網唯讀核對與隔離 EVM 攻擊測試；不是獨立第三方審計、形式驗證或主網上線許可。

## 結論

本輪範圍內沒有確認到外部任意使用者可直接盜走 Treasury 或增發 GEN 的嚴重漏洞；這不是無漏洞保證。確認 2 項需主網前處理的中度管理誤操作風險、1 項低度可觀測性不足，及尚未完成的公開原始碼驗證。暫不建議據此放行主網。

原有 21 項合約子測試通過，新增 8 項安全子測試通過。部分「通過」代表成功重現風險，並非該風險已修好。沒有修改正式合約、部署新合約、改動鏈上狀態或公開發布程式。

## 實際部署核對

網路以 RPC `eth_chainId` 核對為 46630；狀態固定在快照記錄的單一區塊。最新時間、block、bytecode hash 與查詢結果見同目錄 `deployment-snapshot.json`，不要把快照當成未來即時狀態。

| 合約 | 測試網地址 | 核對 |
|---|---|---|
| GenesisPlatform | 0xa5b8d31ce298e39ee30378d7791ec307a8cb8621 | Runtime 與重新編譯結果一致 |
| LaunchToken / GEN | 0x37c675766a27b98eb50bdb777ac32a920deafa8e | Runtime 一致，18 decimals、10 億枚 |
| GenesisSale | 0x9b331e142efe2e8d49fe8a3a866e24dda40d1f38 | Runtime 與 immutable 固定參數分別核對一致 |

Sale runtime 排除 compiler 明確標示的 immutable 欄位後一致；各 immutable 字值另與鏈上 token、pricePerToken 讀值交叉核對，不把 constructor 固定參數誤判為不相符。

平台與 Sale 的 owner / Treasury 均為 `0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e`，pendingOwner 為零。平台未暫停、已建立 2 個 Token，GEN 為平台登錄 Token；Sale 暫停中且指向上述 GEN。這次未另外完整重播所有歷史事件來證明 #001 的時間順序。

平台 Launch Fee 為 0.0001 ETH；Boost 為 0.0002 / 0.0008 / 0.0015 ETH，10 / 50 / 100 點、24 小時。平台及 Sale ETH 餘額、該管理地址可提領餘額查詢時皆為零，不能僅由零餘額反推完整提款歷史。

**Sale 實際售價為 0.001 ETH / GEN**，是前份操作手冊暫定價 0.00000001 ETH 的 100,000 倍。這是部署參數差異，不當作程式漏洞或自行更改。管理錢包約持有 9 億 GEN，Sale 庫存為 99,999,999 GEN；其餘餘額所在與完整購買紀錄未在本輪逐筆追蹤。

## 發現與處理建議

### M-01：Treasury 可誤設為無法提領的地址，後續費用鎖住

- **等級：中度，管理設定風險；不是外部無權限攻擊。**
- 位置：`packages/contracts/GenesisPlatform.sol:61`（setFees）、`:70`（withdraw）；Sale constructor `:89` 亦僅驗非零。
- 平台只檢查 recipient 非零，允許設定為平台自己、Token 合約或沒有呼叫 withdraw 能力的地址。費用歸入 `proceeds[recipient]`，只有該 recipient 作為 msg.sender 可提領。
- 本機重現：owner 把 Treasury 改為平台自身，再發行 Token；發行成功但費用歸平台地址。原 owner 不能提領，改回 Treasury 也不會移轉已歸屬款項。平台無代表自身發起 withdraw 的路徑。
- 影響：錯誤地址生效期間的收入可永久無法取回。單純會拒收 ETH、但仍可控制且可修復的 Treasury 是另一情況，測試顯示提款失敗會還原 credit，不阻塞發行。
- 建議：新版本拒絕 address(this) 等確定無效目標、採 proposed/accept Treasury 兩階段並在驗收時測試收款與提款；前端完整地址二次核對。不要一律禁止所有合約地址，以免阻擋有效多簽。
- 現有部署：目前 recipient 正確，未觀察到此鎖款。不要在現有合約試驗錯誤地址。舊版不可升級，完整防護需新合約與遷移規劃。

### M-02：繼承的 renounceOwnership 可永久失去恢復能力

- **等級：中度，管理誤操作風險；僅 owner 能觸發。**
- 位置：GenesisPlatform `:20`、GenesisSale `:79` 的 Ownable2Step 繼承；OpenZeppelin Ownable 的 renounceOwnership。
- Ownable2Step 保護 owner 轉移，但不使「放棄 owner」變成兩階段；呼叫 renounceOwnership 會直接歸零。
- 本機重現 A：平台暫停後放棄 owner，原管理人無法解除暫停；若首筆發行前放棄 owner，首筆限制也會讓平台無法啟動。
- 本機重現 B：Sale 有庫存但尚未啟用時放棄 owner，無人可啟用販售或 reclaimInventory，GEN 永久卡在 Sale。若在啟用狀態放棄，則失去暫停與回收權。
- 建議：新版本停用 renounceOwnership，除非產品真的需要經明確設計的不可逆去中心化流程。保留兩階段 owner 移交並制定多簽/硬體錢包作業規範。現有版本禁止操作 renounceOwnership。
- 目前兩份合約 owner 都尚未放棄；不是正在發生的資產遺失。

### L-01：Sale 提款與庫存回收缺少專用事件

- **等級：低度，監控與稽核能力不足。**
- 位置：GenesisSale `:101`、`:105`。
- Sale withdraw 沒有類似平台 ProceedsWithdrawn 的事件；庫存回收可由 GEN Transfer 追蹤，但沒有 Sale 業務事件。事件型監控難以直接辨識提款及操作目的。
- 建議：新增 Withdrawn(treasury, amount)、InventoryReclaimed(owner, amount) 事件；以實際收據與餘額核帳。這不是資金可被任意偷走的證據。

### G-01：三份合約尚未在 explorer 公開驗證原始碼

- **主網放行缺項，不是 bytecode 不相符。**
- explorer address API 均回報 `is_verified: false`；smart-contract API 沒有 source_code / ABI。HTTP 200 本身不代表已驗證。
- 本輪本地重新編譯比對已完成，但未向 explorer 提交來源。公開驗證需要獨立執行，不會變更合約狀態。
- 建議以 `packages/contracts/artifacts/standard-input.json`、compiler.json 及正確 constructor arguments 驗證三份合約。Sale 必須用實际 0.001 ETH 參數，不可照暫定手冊輸入。

## 已核對的安全性質與信任界線

- GEN 為固定供應 ERC20，沒有 owner、增發、轉帳稅、黑名單、pause 或 proxy 升級入口。
- 平台 registry / Boost 限制登錄 Token；發行與 Boost 必須付剛好費用，非 owner 無法修改設定。
- 兩份提款均採先清 credit 再外部轉帳、ReentrancyGuard；惡意收款合約在 receive 中重入 withdraw 未成功，款項只支付一次；再次提領失敗。
- 無庫存購買會 revert，ETH credit 一併回滾。這不是代幣預售募集失敗退款機制，產品沒有實作該政策。
- Sale 每筆最多 100 萬枚，同一人同一地址可重複買，本輪重現累計 200 萬枚。這是已知商業規則，不當成繞過既有每錢包上限；是否增訂上限留到第 3 項。
- owner 能暫停 Sale 並取回剩餘庫存，沒有時間鎖或售罄前履約保證。這是集中管理權限；不能把庫存稱為不可撤回鎖倉。
- Boost setPlan 可立即改價格、點數、期限；待處理交易沒有 minUnits / deadline 保護。精確付款檢查可防多收 ETH，但不能保證同價更改點數後仍符合使用者原本看到的內容。這是管理權信任與待加強交易條件防護，未列為外部偷款漏洞。
- owner 與 Treasury 目前同一 EOA；私鑰失陷即可能改費率、提款及收回庫存。單靠合約 owner 權限檢查不能防管理私鑰外洩。

## 編譯器及依賴檢查

重新編譯採 Solidity 0.8.28、optimizer 200、Paris、非 viaIR。已參照目前官方 known-bugs 清單，不宣稱「0.8.28 無已知漏洞」。

本次讀取來源未見 memory bytes 元素 delete、跨 storage 上界配置或 transient delete；清單中的多項新問題要求 viaIR / Cancun 或特定未使用語法。依目前實際使用路徑沒有確認到可觸發情境。主網候選版仍應選定經評估的 compiler / OpenZeppelin 版本後完整重编、重測及再次審查；這不是對所有 compiler 問題的形式證明。

## 重跑與範圍限制

`node scripts/audit-deployment.mjs`：唯讀公開 RPC/explorer，固定區塊查詢並寫本地快照；不含 sendTransaction。`node --test tests/security-review.test.mjs`：本機隨機 Ganache 帳戶與惡意收款 fixture，不使用使用者私鑰。`node --test tests/contracts.test.mjs`：既有 21 項案例。

新增測試共 8 項：平台重入、Sale 重入、拒收後 credit 恢復、自身 Treasury 鎖款、平台 renounce、Sale renounce、同錢包重複購買、owner 暫停後回收庫存。

未執行第三方審計、Slither/Mythril、形式驗證、長時間 fuzz、主網 fork、全部歷史交易重播、網站/API/索引器全面安全審查或 RPC/供應鏈全面漏洞掃描。已部署合約沒有任何修改；本輪新增檔案僅為測試、唯讀腳本與報告。

## 下一步

1. 在主網候選合約修正 M-01、M-02，補上 L-01；本輪只提出建議，尚未實施修正。
2. 完成三份測試網來源驗證，保存 constructor 與地址清單。
3. 第 3 項商業/經濟規則定案後，整合成單一主網候選版本，重跑測試並交獨立第三方審計。

## 外部參考

- [Robinhood 官方網路設定](https://docs.robinhood.com/chain/connecting/)：RPC 與 chain ID。
- [OpenZeppelin Access Control](https://docs.openzeppelin.com/contracts/5.x/access-control)：Ownable / Ownable2Step 與放棄權限的效果。
- [Solidity known bugs](https://docs.soliditylang.org/en/latest/bugs.html)：compiler 問題與必要觸發條件。
- Explorer 各地址的 `/api/v2/addresses/{address}` 與 `/api/v2/smart-contracts/{address}` 唯讀結果保存在部署快照。
