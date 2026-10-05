// One-off edit: rewrites the operator-facing sale guide text in app/admin/page.tsx from V5 behaviour (instant delivery,
// admin-wallet steps) to V6 behaviour (claim after settlement, Safe-sponsored steps).
import fs from "node:fs";

const file = "app/admin/page.tsx";
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
const must = (from, to) => { if (!text.includes(from)) throw new Error(`missing: ${from.slice(0, 70)}`); text = text.replace(from, to); };

// 1. The guide block ------------------------------------------------------------------------------------------------------------
const start = text.indexOf("  const v5SaleOpsGuide = {");
const end = text.indexOf("  const saleOpsGuide = isV5Family");
if (start < 0 || end < 0) throw new Error("guide block not found");
const guide = `  const v5SaleOpsGuide = {
    en: { heading: "Simple guide: what to do and what each button changes (V6: the sponsor is the Safe, so use the Multisig proposals panel for onchain steps)", steps: [
      ["Review and publish the allowlist", "Preview the final approved wallet list and publish its root onchain (Safe proposal step 1). It becomes immutable once the sale opens."],
      ["Send 10M RVYN to the Safe, then approve and deposit", "Move all 10,000,000 RVYN from the admin wallet to the Safe with a normal transfer, then use Safe proposal step 2 (approve + deposit). The approve and deposit buttons below only work when the admin wallet is the sponsor."],
      ["Open / close sale", "Opening starts the 14-day sale only; no tokens move. Buyers' payments are recorded and they claim RVYN after settlement. The sponsor can close early; anyone can close once the 14 days have passed."],
      ["Forward launchpad revenue", "Manually sends and records the revenue; the presale contract cannot discover launchpad income by itself. It must go into the pool."],
      ["Settle (create the initial pool)", "After close the sponsor settles (Safe proposal step 5). The pool ETH must be at least 50% of the raise plus forwarded revenue and at most all of it; anyone can settle at the minimum 7 days after the close. The pool is built at the fixed price by direct mint, its LP is locked for 730 days, unsold sale tokens are burned, the manager allocation is released and team vesting starts. Buyers can then claim."],
      ["Withdraw project ETH", "After settlement, ETH not placed in the pool is operating funds: at most 25% every 30 days (fixed in the contract). Use Safe proposal step 6."],
      ["Distribute / airdrop", "Product, community, and airdrop transfers draw only from their category budgets and only after settlement. Each airdrop batch supports up to 20 unique wallets; lifetime spend is capped."],
      ["Team release", "Anyone may trigger release after the one-year cliff that starts at settlement; the vested RVYN always goes to the fixed team beneficiary."],
    ] },
    "zh-Hant": { heading: "簡易操作：每個步驟與按鈕的效果（V6：發起人是 Safe，鏈上步驟請用「多簽提案」面板）", steps: [
      ["先審核並發布白名單", "預覽最後的核准名單，再把根值發布上鏈（多簽提案步驟 1）；預售開啟後名單不能再改。"],
      ["把 1,000 萬枚 RVYN 轉給 Safe，再授權並存入", "先用一般轉帳把全部 1,000 萬枚 RVYN 從管理錢包轉到 Safe，再用多簽提案步驟 2（授權＋存入）。下方的授權與存入按鈕只有在發起人是管理錢包時才有用。"],
      ["開啟／關閉預售", "開啟只會開始 14 天預售，不會有代幣移動。買家付款只會被記錄，結算後才領取 RVYN。發起人可提前關閉；滿 14 天後任何人都能關閉。"],
      ["轉入發射台收益", "由管理者手動轉入並記錄；預售合約無法自行辨識發射台收入。這筆收益必須放入首池。"],
      ["結算（建立首池）", "預售結束後由發起人結算（多簽提案步驟 5）。池子 ETH 不得低於募資額的 50% 加上已轉入的發射台收益，最高可用全部；結束滿 7 天後任何人都能以下限結算。首池依固定價格以直接鑄造建立，LP 鎖倉 730 天；未售出的預售 Token 銷毀、管理者份額釋出、團隊鎖倉開始計算，之後買家才能領取。"],
      ["提領專案 ETH", "結算後，未放入首池的 ETH 為營運資金，每 30 天最多提領 25%（寫死在合約中）。請用多簽提案步驟 6。"],
      ["配置／空投", "產品、生態、社群與空投只能在結算後使用各自剩餘額度；每批空投最多 20 個不重複錢包，總量受終身上限限制。"],
      ["團隊解鎖發放", "從結算起算一年 cliff 後任何人都可觸發發放；已解鎖的 RVYN 只會送到部署時固定的團隊地址。"],
    ] },
    "zh-Hans": { heading: "简易操作：每个步骤与按钮的效果（V6：发起人是 Safe，链上步骤请用“多签提案”面板）", steps: [
      ["先审核并发布白名单", "预览最终核准名单，再把根值发布上链（多签提案步骤 1）；预售开启后名单不能再改。"],
      ["把 1,000 万枚 RVYN 转给 Safe，再授权并存入", "先用普通转账把全部 1,000 万枚 RVYN 从管理钱包转到 Safe，再用多签提案步骤 2（授权＋存入）。下方的授权与存入按钮只有在发起人是管理钱包时才有用。"],
      ["开启／关闭预售", "开启只会开始 14 天预售，不会有代币移动。买家付款只会被记录，结算后才领取 RVYN。发起人可提前关闭；满 14 天后任何人都能关闭。"],
      ["转入发射台收益", "由管理者手动转入并记录；预售合约无法自行识别发射台收入。这笔收益必须放入首池。"],
      ["结算（创建首池）", "预售结束后由发起人结算（多签提案步骤 5）。池子 ETH 不得低于募资额的 50% 加上已转入的发射台收益，最高可用全部；结束满 7 天后任何人都能按下限结算。首池按固定价格以直接铸造创建，LP 锁仓 730 天；未售出的预售 Token 销毁、管理者份额释放、团队锁仓开始计算，之后买家才能领取。"],
      ["提领项目 ETH", "结算后，未放入首池的 ETH 为运营资金，每 30 天最多提领 25%（写死在合约中）。请用多签提案步骤 6。"],
      ["分配／空投", "产品、生态、社群与空投只能在结算后使用各自剩余额度；每批空投最多 20 个不重复钱包，总量受终身上限限制。"],
      ["团队解锁发放", "从结算起算一年 cliff 后任何人都可触发发放；已解锁的 RVYN 只会发送到部署时固定的团队地址。"],
    ] },
    ko: { heading: "간단 안내: 단계와 각 버튼의 효과 (V6: 스폰서가 Safe이므로 온체인 단계는 멀티시그 제안 패널을 사용)", steps: [
      ["허용 목록 검토 및 게시", "최종 승인 지갑 목록을 미리 보고 루트를 온체인에 게시하세요(Safe 제안 1단계). 판매가 시작되면 목록을 바꿀 수 없습니다."],
      ["RVYN 1,000만 개를 Safe로 보낸 뒤 승인·예치", "관리 지갑에서 RVYN 1,000만 개 전부를 일반 전송으로 Safe에 보낸 뒤 Safe 제안 2단계(승인＋예치)를 사용하세요. 아래 승인·예치 버튼은 관리 지갑이 스폰서일 때만 작동합니다."],
      ["판매 시작／종료", "시작하면 14일 판매만 시작되며 토큰은 이동하지 않습니다. 구매자의 결제는 기록만 되고 정산 후 RVYN을 클레임합니다. 스폰서는 조기 종료할 수 있고 14일이 지나면 누구나 종료할 수 있습니다."],
      ["런치패드 수익 전송", "관리자가 직접 전송·기록해야 합니다. 프리세일 계약은 런치패드 수익을 자동으로 알 수 없습니다. 이 수익은 풀에 들어가야 합니다."],
      ["정산(초기 풀 생성)", "종료 후 스폰서가 정산합니다(Safe 제안 5단계). 풀 ETH는 모금액의 50%와 전송된 런치패드 수익 이상, 최대 전액까지이며 종료 7일 후에는 누구나 최소 금액으로 정산할 수 있습니다. 고정 가격에 직접 민팅으로 풀을 만들고 LP는 730일 잠기며, 미판매 토큰은 소각되고 관리자 몫이 해제되며 팀 베스팅이 시작됩니다. 이후 구매자가 클레임합니다."],
      ["프로젝트 ETH 인출", "정산 후 풀에 넣지 않은 ETH는 운영 자금이며 30일마다 최대 25%까지 인출할 수 있습니다(계약에 고정). Safe 제안 6단계를 사용하세요."],
      ["배분／에어드롭", "제품·생태계·커뮤니티·에어드롭은 정산 후에만 각 예산 안에서 사용합니다. 에어드롭은 회당 중복 없는 지갑 최대 20개이며 누적 한도가 있습니다."],
      ["팀 베스팅 해제", "정산 시점부터 계산하는 1년 cliff 이후 누구나 해제를 실행할 수 있고, 지급 토큰은 고정된 팀 수령인에게만 전달됩니다."],
    ] },
  }[locale];
`;
text = text.slice(0, start) + guide + text.slice(end);

// 2. Workflow sentences ---------------------------------------------------------------------------------------------------------
must('noV4: "V5 is deployed and its source is verified. The sale is still closed; this dashboard shows the remaining steps before opening."', 'noV4: "The V6 sale contract is deployed but not open. Before opening, confirm its source is verified on the explorer. This dashboard shows the remaining steps before opening."');
must('v4: "The contract delivers RVYN to buyers in the payment transaction. Each admin action below is separate and requires your wallet signature."', 'v4: "Buyers\' payments are only recorded; they claim RVYN after the sale is closed and settled. The sponsor is the Safe multisig, so onchain steps are prepared in the Multisig proposals panel and need two signatures."');
must('sequence: "Simple order: finish the allowlist → publish its root → approve RVYN use → deposit RVYN → open the sale. After closing, decide the pool amount; creating the locked pool is a consequential onchain action."', 'sequence: "Simple order: finish the allowlist → publish its root (Safe) → send 10,000,000 RVYN from the admin wallet to the Safe → approve and deposit (Safe) → open the sale (Safe). After closing, settle (Safe, or anyone after 7 days): this builds the locked pool and lets buyers claim."');
must('noV4: "V5 已部署且原始碼已驗證；目前預售仍關閉，這個工作台會提示開售前還要完成的步驟。"', 'noV4: "V6 預售合約已部署但尚未開售；開售前請確認原始碼已在區塊瀏覽器驗證。這個工作台會提示開售前還要完成的步驟。"');
must('v4: "買家付款時會在同一筆交易收到 RVYN。下方每項管理操作彼此獨立，鏈上操作都需要你用錢包簽署。"', 'v4: "買家付款只會被記錄；預售結束並結算後，買家才能領取 RVYN。發起人是 Safe 多簽，鏈上步驟請在「多簽提案」面板產生批次，並由兩位簽署人簽署。"');
must('sequence: "簡單順序：完成白名單 → 發布根值 → 授權合約使用 RVYN → 存入 RVYN → 最後才開售。結束後再決定首池金額；建池與 LP 鎖定是重要的鏈上操作。"', 'sequence: "簡單順序：完成白名單 → 發布根值（Safe）→ 把 1,000 萬枚 RVYN 從管理錢包轉到 Safe → 授權並存入（Safe）→ 開售（Safe）。結束後結算（Safe，或滿 7 天後任何人）：建立鎖定的首池並開放買家領取。"');
must('noV4: "V5 已部署且源代码已验证；目前预售仍关闭，这个工作台会提示开售前还要完成的步骤。"', 'noV4: "V6 预售合约已部署但尚未开售；开售前请确认源代码已在区块浏览器验证。这个工作台会提示开售前还要完成的步骤。"');
must('v4: "买家付款时会在同一笔交易收到 RVYN。下方每项管理操作彼此独立，链上操作都需要你用钱包签署。"', 'v4: "买家付款只会被记录；预售结束并结算后，买家才能领取 RVYN。发起人是 Safe 多签，链上步骤请在“多签提案”面板生成批次，并由两位签署人签署。"');
must('sequence: "简单顺序：完成白名单 → 发布根值 → 授权合约使用 RVYN → 存入 RVYN → 最后才开售。结束后再决定首池金额；建池与 LP 锁定是重要的链上操作。"', 'sequence: "简单顺序：完成白名单 → 发布根值（Safe）→ 把 1,000 万枚 RVYN 从管理钱包转到 Safe → 授权并存入（Safe）→ 开售（Safe）。结束后结算（Safe，或满 7 天后任何人）：创建锁定的首池并开放买家领取。"');
must('noV4: "V5가 배포되었고 소스 코드 검증도 완료되었습니다. 판매는 아직 닫혀 있으며 이 대시보드가 시작 전 남은 단계를 안내합니다."', 'noV4: "V6 판매 계약이 배포되었지만 아직 열리지 않았습니다. 시작 전에 탐색기에서 소스 검증이 되었는지 확인하세요. 이 대시보드가 시작 전 남은 단계를 안내합니다."');
must('v4: "구매자는 결제 거래에서 RVYN을 즉시 받습니다. 아래 관리 작업은 각각 별개이며 온체인 작업에는 지갑 서명이 필요합니다."', 'v4: "구매자의 결제는 기록만 되며 판매 종료와 정산 후 RVYN을 클레임합니다. 스폰서는 Safe 멀티시그이므로 온체인 단계는 멀티시그 제안 패널에서 준비하고 서명 두 개가 필요합니다."');
must('sequence: "간단한 순서: 허용 목록 완료 → 루트 게시 → RVYN 사용 승인 → RVYN 예치 → 마지막으로 판매 시작. 종료 후 풀 금액을 결정하세요. 풀 생성과 LP 잠금은 중요한 온체인 작업입니다."', 'sequence: "간단한 순서: 허용 목록 완료 → 루트 게시(Safe) → 관리 지갑에서 Safe로 RVYN 1,000만 개 전송 → 승인·예치(Safe) → 판매 시작(Safe). 종료 후 정산(Safe, 또는 7일 후 누구나): 잠긴 풀을 만들고 구매자 클레임을 엽니다."');

// 3. Checkpoint sentence about "releases the scheduled allocations" -----------------------------------------------------------
must("Opening starts the 14-day sale and releases the scheduled allocations.", "Opening starts the 14-day sale; no tokens move until settlement.");
must("開售會啟動 14 天預售並撥出既定份額。", "開售會啟動 14 天預售；結算前不會有代幣移動。");
must("开售会启动 14 天预售并拨出既定份额。", "开售会启动 14 天预售；结算前不会有代币移动。");
must("시작하면 14일 판매와 정해진 배분이 실행됩니다.", "시작하면 14일 판매가 시작되며 정산 전에는 토큰이 이동하지 않습니다.");

fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
console.log("admin operator text updated for V6");
