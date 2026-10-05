# RVYN 預售安全與商業規則候選合約

**本輪更新：** 依 RVYN 最終模型新增固定供應 Token、預售募資／退款／累計限購／手動建池／結算後剩餘 ETH 提領、鎖倉與未售銷毀。V2 保留原本募資全額建池規則，V3 `GenesisPresaleV3` 實作先以 `depositInventory()` 轉入 800 萬 RVYN、再以 `open()` 開始預售，以及手動指定建池額度。新版詳細規則、部署順序與未完成關卡請以 [DEPLOYMENT.md](DEPLOYMENT.md) 及 artifacts/release-manifest.json 為準。下列早期紀錄保留安全修正脈絡，不代表網站已接線或正式部署。

日期：2026-09-12。針對內部審查 M-01 / M-02 的原始碼修正，不是已部署版本，也不是第三方審計通過證明。

## 已修改

- GenesisPlatform / GenesisSale 覆寫 renounceOwnership 並固定拒絕，保留 Ownable2Step 管理權移交。
- 初始 Treasury 必須等於 owner，避免部署時另填無法控制的收款地址。Sale 額外檢查 Token 地址存在程式碼，拒絕自身 / Token 作為 Treasury。
- 平台 setFees 保留原參數介面，但 recipient 必須是目前 Treasury，不能以更新費率同時偷偷換收款人。
- 平台改用 proposeTreasury → acceptTreasury：owner 提案，新收款地址自行發送確認交易，才開始取得新收入。拒絕零地址、平台本身、已登錄的 Token 和目前 Treasury。
- owner 可取消或替換提案；過期提案的地址不能接受。owner 移交完成時清除未完成的 Treasury 提案，避免新 owner 接到舊提案。
- 原收款人已累積的 proceeds 完整保留，不因改收款人而移轉；原收款人仍可提領。

## 必须理解的限制

兩階段確認可防止地址打錯後立刻導走收入，但不能保證任意智慧合約收款人永遠可提款：收款合約仍須支援接受提案、呼叫 withdraw 並接收 ETH。不能防止私鑰被盜、管理者與收款人共同惡意操作或收款權限日後遺失。

Sale Treasury 仍部署後固定，沒有新增任意改收款人的權限；若初始 owner / Treasury 未來要採多簽，必須一併確認網站 EOA allowlist 與多簽認證相容性。

## 驗證

執行 `node scripts/compile-contracts-v2.mjs` 後執行 `node --test tests/contracts-v2.test.mjs`。7 項安全回歸子案例全部通過：

1. 拒絕未確認的初始收款地址，固定供應發行仍正常。
2. setFees 不可更換收款人；拒絕自身、零地址、已登錄 Token 等提案。
3. 提案期間舊收款人繼續收費，只有指定新地址能接受，舊帳款保留，新帳款可提領。
4. 提案取消、替換、未授權接受均正確處理。
5. 平台不能放棄 owner，暫停後仍可恢復。
6. Sale 不能放棄 owner，買入、提款及暫停後取回庫存仍正常。
7. 兩階段 owner 移交仍可使用，移交後舊 Treasury 提案失效。

這是本機 Ganache 測試，不是 V2 真實 Robinhood 測試網驗收、完整 fuzz 或獨立安全審计。V1 的既有測試與已記錄審查保留，不用 V2 去覆蓋 V1 的歷史證據。

## 與目前網站的隔離及後續接線

V1 的 `packages/contracts/GenesisPlatform.sol`、`packages/web3/artifacts.json`、網站部署設定與三份已部署合約完全未變。V2 檔案與編譯產物只在本資料夾，不會被目前網站自動部署。

套用前需更新管理頁：費率與 Treasury 提案分開；增加新收款錢包接受入口（不能限制只有原 OWNER 可接受）；顯示 pendingTreasury、取消提案及 V1/V2 版本差異。後端 bytecode 登錄驗證也需明確支援版本，不能以 V2 artifact 強行驗證 V1。

已部署合約不可升級。要啟用這些防護，須規劃新平台 / Sale 部署與資料隔離，不能直接覆寫既有 Registry 或假設舊 Token 會自動搬到新平台。若未來沿用现有 GEN 作為新 Sale 的庫存，必須另行規劃網站綁定及人工簽署轉入，不能重新增發現有 GEN。

本輪沒有發送鏈上交易、移動庫存、更換網站部署版本或改動正式資料。待第 3 項商業規則定案，可整合為單一主網候選版本，再部署測試網及送獨立審查。
