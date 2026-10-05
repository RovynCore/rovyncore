# ROVYN CORE：第 4、5 項交接

## 本次採用

- 品牌 ROVYN CORE；原始綠色結晶、頁面設計及既有 GEN 链上名稱保留。
- 英文預設，繁中／簡中／英文／韓文切換並記住選擇；發行、購買、管理、錢包確認與四語條款一併翻譯。使用者自填的 Token 資料不自動改寫。
- ROVYN CORE 團隊營運；全球目標市場不等於全球營業許可。官方聯絡 https://x.com/RovynCORE。
- 管理及收款沿用 0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e；多簽暫不採用。
- 每日加密備份、30 天保留；Email 暫停。沒有寄信或產生新付費訂閱。
- 既有 V1 網站合約流程不替換為 V2。V2 安全修改和 Presale 候選合約保留供下次部署；未部署、未轉帳、未開主網募資。

## 預算與服務選擇

USD 200 是每月總上限，不是本次已花費或供應商保證報價。先分配：RPC 50、排程與備份 50、網站費用／流量 50、備用 50。未設好的費用上限不可宣稱已受控；超額不得自動升級。

1. RPC 暫採 Alchemy，先由免費方案驗證 Robinhood Chain，確認流量後才考慮按用量付費。官方鏈文件提供 testnet/mainnet Alchemy 端點；不可把其他鏈 API URL 混用。服務端金鑰留在 Sites secrets，不能放前端。
2. 外部排程先採專用私人 GitHub repository 的 Actions；`ops/github-operations.yml` 是待啟用範本，每 15 分鐘同步及健康檢查，每日 UTC+8 02:17 備份。Actions 排程可能延遲，非 SLA；需更高可用性時再換常駐排程，不依賴本機或聊天。
3. 備份為加密 artifact、保留 30 天，存於與 Sites 不同的服務。備份金鑰異地保存，不能只放同一帳號。流量及 artifact 費用依實際帳戶方案，啟用前設定預算限制。
4. Cloudflare Turnstile 用於 upload、metadata、report。`HUMAN_VERIFICATION=required` 時服務端驗證單次 token、action、允許的 hostname；缺金鑰或驗證失敗拒絕寫入。未建帳號前保持 off，既有 IP 限流與每日配額仍有效。免費方案可作起步選擇。

## 接通尚缺（不可標示完成）

- 使用者建立／登入 Alchemy、GitHub、Cloudflare 帳號並自行完成服務條款與需要的付款驗證。
- Alchemy 的 Robinhood Chain RPC URL，寫入 Sites `RPC_TESTNET`／`RPC_MAINNET`，有独立備援時再填 fallback。
- 建立 OPS_TOKEN 及 BACKUP_KEY，放入授權服務的 secret store，不貼公開聊天或 Git。`BACKUP_KEY` 只給備份執行器，不給網站。
- 私有 Sites 的長期機器存取須先確認官方支援方式；get_site 的瀏覽 bypass token 不可當永久服務帳號使用。若無持續有效的閘道授權，排程仍屬阻塞；不可為了排程自行公開網站。
- Cloudflare 產生正式 site key／secret，註冊 rovyncore.com、rovyncore.net 與 Sites 來源域名後才啟用 required。不要將測試金鑰當正式防護。
- 實際跑一次線上同步、每日備份及隔離 DB/R2 還原演練，再核對預算與排程失敗狀態。Email 暫停表示不會收到本應用寄出的故障通知，需自行看排程狀態；GitHub 帳戶通知設定另行管理。

## 驗證界線

- 本輪做介面文字與語言切換、型別檢查、網站建置、保護邏輯、備份加解密／保留規則及隔離 API 整合檢查。
- 未重新執行真實錢包或部署交易；先前測試不等於所有未來合約變更永久免測。
- 目前備份上限每表 10,000 筆、圖片 1,000 張／總共 100MB；到限停止並報錯，不產生殘缺備份。成長前須升級分頁或供應商原生備份。
- 四語條款揭露目前 GEN 無用途及無分紅／保本；未來預售上限、退款及鎖倉不可誤寫成 V1 已啟用功能。主網商業營運仍須完成適用法規判定。

## 核對來源（2026-09-13）

- [Robinhood Chain 連線文件](https://docs.robinhood.com/chain/connecting/)
- [Alchemy 費率](https://www.alchemy.com/pricing)
- [Turnstile 方案](https://developers.cloudflare.com/turnstile/plans/)
- [Turnstile 後端驗證](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [GitHub Actions 觸發方式](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

本文件不是法律意見或合規認證。營運形式與目標市場採使用者提供資料；正式上線須由適任專業人士確認實際服務是否需登記、許可或其他限制。
