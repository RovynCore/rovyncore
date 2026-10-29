"use client";

import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { Address } from "@/components/rv/ui";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { RvynHealthPanel } from "@/components/rvyn-health-panel";
import { useLiveSupply } from "@/components/lightdive/v3/supply-live";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

const EXPLORER = "https://robinhoodchain.blockscout.com";
// Addresses and roles below were last reviewed against the chain on this date; the health panel reads live.
const CHECKED = "2026-10-06";

const copy = {
  kicker: { en: "TRANSPARENCY", "zh-Hant": "公開透明", "zh-Hans": "公开透明", ko: "투명성" },
  title: { en: "Everything we run onchain, in one place.", "zh-Hant": "我們在鏈上運行的一切，都在這裡。", "zh-Hans": "我们在链上运行的一切，都在这里。", ko: "온체인에서 운영하는 모든 것을 한곳에." },
  lead: { en: "Addresses, who controls them, and what is and isn't verified. Don't trust this page: open the explorer links and check.", "zh-Hant": "地址、由誰控制、哪些已驗證、哪些尚未。不必相信這一頁——點開區塊瀏覽器自己核對。", "zh-Hans": "地址、由谁控制、哪些已验证、哪些尚未。不必相信这一页——点开区块浏览器自己核对。", ko: "주소, 관리 주체, 검증된 것과 아닌 것. 이 페이지를 믿지 말고 탐색기 링크로 직접 확인하세요." },
  checked: { en: `Addresses and roles reviewed ${CHECKED} on Robinhood Chain (chain ID 4663). The live figures below are read from the chain when you open this page.`, "zh-Hant": `地址與角色最後核對：${CHECKED}，Robinhood Chain（鏈 ID 4663）。下方即時數據在你開啟本頁時直接讀取鏈上。`, "zh-Hans": `地址与角色最后核对：${CHECKED}，Robinhood Chain（链 ID 4663）。下方实时数据在你打开本页时直接读取链上。`, ko: `주소와 역할 최종 확인: ${CHECKED}, Robinhood Chain (체인 ID 4663). 아래 실시간 수치는 페이지를 열 때 체인에서 직접 읽습니다.` },
  colName: { en: "Contract or wallet", "zh-Hant": "合約或錢包", "zh-Hans": "合约或钱包", ko: "컨트랙트 또는 지갑" },
  colAddress: { en: "Address", "zh-Hant": "地址", "zh-Hans": "地址", ko: "주소" },
  colStatus: { en: "Status", "zh-Hant": "狀態", "zh-Hans": "状态", ko: "상태" },
  contractsTitle: { en: "Contracts and wallets", "zh-Hant": "合約與錢包", "zh-Hans": "合约与钱包", ko: "컨트랙트와 지갑" },
  open: { en: "Open in explorer", "zh-Hant": "在瀏覽器查看", "zh-Hans": "在浏览器查看", ko: "탐색기에서 보기" },
  verifiedYes: { en: "Source verified on Blockscout", "zh-Hant": "原始碼已在 Blockscout 驗證", "zh-Hans": "源码已在 Blockscout 验证", ko: "Blockscout에서 소스 검증됨" },
  eoa: { en: "Single wallet (EOA), not a multisig", "zh-Hant": "單一錢包（EOA），不是多簽", "zh-Hans": "单一钱包（EOA），不是多签", ko: "단일 지갑(EOA), 멀티시그 아님" },
  rvynName: { en: "RVYN token", "zh-Hant": "RVYN 代幣", "zh-Hans": "RVYN 代币", ko: "RVYN 토큰" },
  rvynNote: { en: "Total supply 10,000,000, 18 decimals, fixed at creation. The full supply is currently held by the admin wallet; none has been sold or distributed.", "zh-Hant": "總量 10,000,000，18 位小數，建立時即固定。目前全部由管理錢包持有，尚未出售或分發。", "zh-Hans": "总量 10,000,000，18 位小数，创建时即固定。目前全部由管理钱包持有，尚未出售或分发。", ko: "총 공급량 10,000,000, 소수 18자리, 생성 시 고정. 현재 전량을 관리 지갑이 보유하며 판매·배분된 적이 없습니다." },
  platformName: { en: "Launch platform V2", "zh-Hant": "發射平台 V2", "zh-Hans": "发射平台 V2", ko: "런치 플랫폼 V2" },
  platformNote: { en: "Token launch factory, owned by the admin wallet; launch fee 0.001 ETH; not paused. Ownership transfers are two-step and cannot be renounced.", "zh-Hant": "代幣發射工廠，擁有者為管理錢包；發射費 0.001 ETH；目前未暫停。擁有權轉移需兩步驟，且無法放棄。", "zh-Hans": "代币发射工厂，拥有者为管理钱包；发射费 0.001 ETH；当前未暂停。所有权转移需两步，且无法放弃。", ko: "토큰 런치 팩토리, 소유자는 관리 지갑. 런치 수수료 0.001 ETH, 일시 중지 아님. 소유권 이전은 2단계이며 포기할 수 없습니다." },
  saleName: { en: "RVYN presale contract (V5, multisig sponsor, cancelled)", "zh-Hant": "RVYN 預售合約（V5，多簽發起人，已取消）", "zh-Hans": "RVYN 预售合约（V5，多签发起人，已取消）", ko: "RVYN 프리세일 컨트랙트 (V5, 멀티시그 스폰서, 취소됨)" },
  saleNote: { en: "Cancelled by the multisig on 6 October 2026 before it opened (contract state: Cancelled). It never held any RVYN and raised 0. It is replaced by the V6 sale contract, which will be listed here once deployed. No sale date has been set.", "zh-Hant": "已於 2026 年 10 月 6 日開售前由多簽取消（合約狀態：Cancelled）。從未持有 RVYN，募得金額為 0。由 V6 預售合約取代，部署後會列在此處。尚未訂定開售日期。", "zh-Hans": "已于 2026 年 10 月 6 日开售前由多签取消（合约状态：Cancelled）。从未持有 RVYN，募得金额为 0。由 V6 预售合约取代，部署后会列在此处。尚未确定开售日期。", ko: "2026년 10월 6일 판매 시작 전에 멀티시그가 취소했습니다(계약 상태: Cancelled). RVYN을 보유한 적이 없고 모금액은 0입니다. V6 판매 계약으로 대체되며 배포 후 여기에 표시됩니다. 판매 일정은 정해지지 않았습니다." },
  v6Name: { en: "RVYN presale contract (V6, multisig sponsor)", "zh-Hant": "RVYN 預售合約（V6，多簽發起人）", "zh-Hans": "RVYN 预售合约（V6，多签发起人）", ko: "RVYN 프리세일 컨트랙트 (V6, 멀티시그 스폰서)" },
  v6Note: { en: "Deployed on 6 October 2026. Sponsor, team beneficiary and LP beneficiary are the multisig below; LP locked 730 days; operating funds unlock 25% per 30 days after settlement (all fixed in the contract). Not open: it holds no RVYN, has no allowlist root and has raised 0. No sale date has been set. Source code is verified on the explorer; the contract has not been independently audited.", "zh-Hant": "2026 年 10 月 6 日部署。發起人、團隊受益人與 LP 受益人皆為下方的多簽；LP 鎖倉 730 天；營運資金自結算起每 30 天解鎖 25%（皆寫死在合約中）。尚未開放：目前沒有 RVYN、沒有白名單 root、募得金額為 0。尚未訂定開售日期。原始碼已在區塊瀏覽器驗證，合約未經獨立審計。", "zh-Hans": "2026 年 10 月 6 日部署。发起人、团队受益人与 LP 受益人均为下方的多签；LP 锁仓 730 天；运营资金自结算起每 30 天解锁 25%（均写死在合约中）。尚未开放：当前没有 RVYN、没有白名单 root、募得金额为 0。尚未确定开售日期。源码已在区块浏览器验证，合约未经独立审计。", ko: "2026년 10월 6일 배포. 스폰서, 팀 수혜자, LP 수혜자는 아래 멀티시그이며 LP는 730일 잠금, 운영 자금은 정산 후 30일마다 25%씩 해제됩니다(모두 계약에 고정). 열려 있지 않으며 RVYN 보유 0, 화이트리스트 루트 없음, 모금액 0. 판매 일정은 정해지지 않았습니다. 소스 코드는 탐색기에서 검증되었으며 독립 감사는 받지 않았습니다." },
  oldSaleName: { en: "Earlier presale contract (V5, superseded)", "zh-Hant": "先前的預售合約（V5，已被取代）", "zh-Hans": "先前的预售合约（V5，已被取代）", ko: "이전 프리세일 컨트랙트 (V5, 대체됨)" },
  oldSaleNote: { en: "Same source code, but its sponsor is the single admin wallet, which cannot be changed. It was never funded or opened and will not be used.", "zh-Hant": "同一份原始碼，但發起人是單一管理錢包且無法更改。從未入庫或開放，之後也不會使用。", "zh-Hans": "同一份源码，但发起人是单一管理钱包且无法更改。从未入库或开放，之后也不会使用。", ko: "같은 소스 코드이지만 스폰서가 단일 관리 지갑이며 변경할 수 없습니다. 입금·개시된 적이 없고 사용하지 않습니다." },
  safeName: { en: "Multisig (Safe, 2 of 3)", "zh-Hant": "多簽（Safe，3 取 2）", "zh-Hans": "多签（Safe，3 取 2）", ko: "멀티시그 (Safe, 3 중 2)" },
  safeNote: { en: "Three signers; any two must approve a transaction. It controls the V6 presale contract. Platform ownership stays with the admin wallet below; the RVYN supply moves to the Safe only when the sale inventory is deposited.", "zh-Hant": "三位簽署人，任兩位同意才能執行。它掌管新的預售合約；平台擁有權仍在下方的管理錢包；RVYN 供應量只會在存入預售庫存時轉入。", "zh-Hans": "三位签署人，任两位同意才能执行。它掌管新的预售合约；平台所有权仍在下方的管理钱包；RVYN 供应量只会在存入预售库存时转入。", ko: "서명자 3명 중 2명이 승인해야 실행됩니다. 새 프리세일 컨트랙트를 관리하며, 플랫폼 소유권은 아래 관리 지갑에 남고 RVYN 공급량은 판매 재고를 예치할 때만 Safe로 이동합니다." },
  safeStatus: { en: "Safe v1.5.0 · 2 of 3 · signers checked onchain", "zh-Hant": "Safe v1.5.0・3 取 2・簽署人已於鏈上核對", "zh-Hans": "Safe v1.5.0・3 取 2・签署人已于链上核对", ko: "Safe v1.5.0 · 3 중 2 · 서명자 온체인 확인" },
  adminName: { en: "Admin and Treasury wallet (single wallet)", "zh-Hant": "管理與金庫錢包（單一錢包）", "zh-Hans": "管理与金库钱包（单一钱包）", ko: "관리·트레저리 지갑 (단일 지갑)" },
  adminNote: { en: "This single externally owned wallet owns the launch platform, receives its fees and holds the RVYN supply until it is deposited into the presale. It is not a multisig, so treat it as a single point of control.", "zh-Hant": "這個單一外部帳戶是發射平台的擁有者、收取平台費用，並在存入預售合約之前持有 RVYN 供應量。它不是多簽，請視為單點控制。", "zh-Hans": "这个单一外部账户是发射平台的所有者、收取平台费用，并在存入预售合约之前持有 RVYN 供应量。它不是多签，请视为单点控制。", ko: "이 단일 외부 소유 지갑은 런치 플랫폼을 소유하고 수수료를 받으며 프리세일에 예치되기 전까지 RVYN 공급량을 보유합니다. 멀티시그가 아니므로 단일 통제 지점으로 간주하세요." },
  randTitle: { en: "Where Lightdive's randomness comes from", "zh-Hant": "潛光遠征的隨機數從哪裡來", "zh-Hans": "潜光远征的随机数从哪里来", ko: "라이트다이브의 난수는 어디서 오는가" },
  randBody: { en: "Every dive result and every summoned card in Lightdive v3 comes from drand evmnet, a public randomness beacon run jointly by many independent organisations that publishes a new value every 3 seconds. Nobody on our side holds a seed, a key or a server that decides results.", "zh-Hant": "潛光遠征 v3 的每一趟航行結果、每一張召喚出的卡，都來自 drand evmnet：由多個獨立機構共同運作的公開隨機信標，每 3 秒公開一個新值。我們這邊沒有任何人持有能決定結果的 seed、金鑰或伺服器。", "zh-Hans": "潜光远征 v3 的每一趟航行结果、每一张召唤出的卡，都来自 drand evmnet：由多个独立机构共同运作的公开随机信标，每 3 秒公开一个新值。我们这边没有任何人持有能决定结果的 seed、密钥或服务器。", ko: "라이트다이브 v3의 모든 항해 결과와 소환 카드는 drand evmnet에서 나옵니다. 여러 독립 기관이 함께 운영하는 공개 난수 신호로, 3초마다 새 값을 공개합니다. 저희 쪽 누구도 결과를 정하는 시드, 키, 서버를 갖고 있지 않습니다." },
  rand1: { en: "A dive or summon fixes which drand round it will use when it is sent, a round that has not been published yet; no one, including us, can know its value in advance.", "zh-Hant": "出發或召喚送出時，就固定用哪一輪 drand，而那一輪還沒公開；沒有人（包括我們）能事先知道它的值。", "zh-Hans": "出发或召唤送出时，就固定用哪一轮 drand，而那一轮还没公开；没有人（包括我们）能事先知道它的值。", ko: "출발이나 소환을 보낼 때 아직 공개되지 않은 drand 라운드가 지정되며, 저희를 포함해 누구도 그 값을 미리 알 수 없습니다." },
  rand2: { en: "The contracts check the round's BLS signature on chain before using it (DrandEvmnet.sol), so a made-up value is rejected.", "zh-Hant": "合約在使用前會在鏈上驗證這一輪的 BLS 簽章（DrandEvmnet.sol），偽造的值會被拒絕。", "zh-Hans": "合约在使用前会在链上验证这一轮的 BLS 签名（DrandEvmnet.sol），伪造的值会被拒绝。", ko: "컨트랙트는 사용 전에 해당 라운드의 BLS 서명을 온체인에서 검증하므로(DrandEvmnet.sol) 위조된 값은 거부됩니다." },
  rand3: { en: "If a round's proof never arrives, only the owner may settle by the fallback, which is never better than a normal draw (empty-handed for a dive, the weakest cards for a summon). Holding back a result gains nothing.", "zh-Hant": "萬一某一輪的證明一直沒送來，只有主人能用保底結算，而保底永遠不會比正常抽到的好（航行是空手而歸、召喚是最弱的卡）。拖著不揭曉沒有任何好處。", "zh-Hans": "万一某一轮的证明一直没送来，只有主人能用保底结算，而保底永远不会比正常抽到的好（航行是空手而归、召唤是最弱的卡）。拖着不揭晓没有任何好处。", ko: "어떤 라운드의 증명이 끝내 오지 않으면 주인만 보장 정산을 할 수 있으며, 보장 정산은 정상 결과보다 절대 좋지 않습니다(항해는 빈손, 소환은 가장 약한 카드). 공개를 미뤄도 얻는 것이 없습니다." },
  rand4: { en: "Anyone can recompute any dive from the public signature, step by step, without a wallet.", "zh-Hant": "任何人都能用公開的簽章，一步一步重算任何一趟航行，不需要錢包。", "zh-Hans": "任何人都能用公开的签名，一步一步重算任何一趟航行，不需要钱包。", ko: "누구나 공개된 서명으로 어떤 항해든 지갑 없이 단계별로 다시 계산할 수 있습니다." },
  randVerify: { en: "Verify a dive", "zh-Hant": "驗證一趟航程", "zh-Hans": "验证一趟航程", ko: "항해 검증하기" },
  auditTitle: { en: "What has not been done", "zh-Hant": "尚未完成的事", "zh-Hans": "尚未完成的事", ko: "아직 하지 않은 것" },
  auditBody: { en: "No independent third party has audited these contracts. We have run our own tests and reviews, but that is not an audit. Do not risk funds you cannot afford to lose.", "zh-Hant": "這些合約尚未經過獨立第三方審計。我們做過自己的測試與審查，但那不等於審計。請勿投入無法承受損失的資金。", "zh-Hans": "这些合约尚未经过独立第三方审计。我们做过自己的测试与审查，但那不等于审计。请勿投入无法承受损失的资金。", ko: "이 컨트랙트들은 독립된 제3자의 감사를 받지 않았습니다. 자체 테스트와 검토는 했지만 감사가 아닙니다. 잃어도 되는 금액만 사용하세요." },
  howTitle: { en: "How to check this yourself", "zh-Hant": "如何自己核對", "zh-Hans": "如何自己核对", ko: "직접 확인하는 방법" },
  how1: { en: "Open an address above in the explorer and compare it with the address shown in your wallet before signing.", "zh-Hant": "在瀏覽器開啟上方地址，簽署前與錢包顯示的地址比對。", "zh-Hans": "在浏览器打开上方地址，签署前与钱包显示的地址比对。", ko: "위 주소를 탐색기에서 열고, 서명 전에 지갑에 표시된 주소와 비교하세요." },
  how2: { en: "On a verified contract, use the Read Contract tab to see owner, treasury and state directly from the chain.", "zh-Hant": "在已驗證的合約上，用 Read Contract 分頁直接從鏈上讀取擁有者、金庫與狀態。", "zh-Hans": "在已验证的合约上，用 Read Contract 标签页直接从链上读取拥有者、金库与状态。", ko: "검증된 컨트랙트에서는 Read Contract 탭으로 소유자, 트레저리, 상태를 체인에서 직접 읽으세요." },
  how3: { en: "We never ask for private keys or recovery phrases, and we never DM you first. Official news: @RovynCORE on X.", "zh-Hant": "我們絕不索取私鑰或助記詞，也不會主動私訊你。官方消息：X 上的 @RovynCORE。", "zh-Hans": "我们绝不索取私钥或助记词，也不会主动私信你。官方消息：X 上的 @RovynCORE。", ko: "개인 키나 복구 문구는 절대 요청하지 않으며 먼저 DM을 보내지 않습니다. 공식 소식: X의 @RovynCORE." },
  report: { en: "Found a security issue? Email via the contact in /.well-known/security.txt or message @RovynCORE on X.", "zh-Hant": "發現安全問題？請見 /.well-known/security.txt，或在 X 私訊 @RovynCORE。", "zh-Hans": "发现安全问题？请见 /.well-known/security.txt，或在 X 私信 @RovynCORE。", ko: "보안 문제를 발견하셨나요? /.well-known/security.txt를 확인하거나 X에서 @RovynCORE에 메시지를 보내세요." },
  source: { en: "Source code on GitHub (MIT)", "zh-Hant": "GitHub 原始碼（MIT）", "zh-Hans": "GitHub 源码（MIT）", ko: "GitHub 소스 코드 (MIT)" },
  supplyTitle: { en: "Lightdive v3 cards in play", "zh-Hant": "潛光遠征 v3 卡片數量", "zh-Hans": "潜光远征 v3 卡片数量", ko: "라이트다이브 v3 카드 수량" },
  supplyBody: { en: "Each of the three Lightdive v3 card kinds has a cap on how many can exist at once: 3,000 spires, 6,000 prisms and 12,000 seekers. Docked and listed cards count; a place frees up only when a card comes home. This table reads from the chain how many of each kind exist, how many are on teams and how many are listed on the market, so anyone can see how many places are held by cards nobody is using.", "zh-Hant": "潛光遠征 v3 的三種卡，同時存在的數量都有上限：光塔 3,000、稜鏡 6,000、探索者 12,000。停泊中和上架中的卡也算在內，卡歸航後名額才會空出。這張表直接從鏈上讀取每種卡存在幾張、幾張在隊伍上、幾張在市集上架，讓所有人都看得到有多少名額被沒有在使用的卡佔著。", "zh-Hans": "潜光远征 v3 的三种卡，同时存在的数量都有上限：光塔 3,000、棱镜 6,000、探索者 12,000。停泊中和上架中的卡也算在内，卡归航后名额才会空出。这张表直接从链上读取每种卡存在几张、几张在队伍上、几张在市集上架，让所有人都看得到有多少名额被没有在使用的卡占着。", ko: "라이트다이브 v3의 세 가지 카드는 동시에 존재할 수 있는 수량에 상한이 있습니다: 광탑 3,000, 프리즘 6,000, 탐색자 12,000. 정박 중이거나 등록된 카드도 포함되며, 카드가 귀항해야 자리가 비워집니다. 이 표는 종류별로 존재하는 수, 팀에 있는 수, 마켓에 등록된 수를 체인에서 직접 읽어, 사용되지 않는 카드가 차지한 자리를 누구나 볼 수 있게 합니다." },
  supplyKind: { en: "Card", "zh-Hant": "種類", "zh-Hans": "种类", ko: "종류" },
  supplyCap: { en: "Cap", "zh-Hant": "上限", "zh-Hans": "上限", ko: "상한" },
  supplyAlive: { en: "In existence", "zh-Hant": "存在", "zh-Hans": "存在", ko: "존재" },
  supplyTeam: { en: "On teams", "zh-Hant": "在隊伍上", "zh-Hans": "在队伍上", ko: "팀에 배치" },
  supplyListed: { en: "Listed", "zh-Hant": "市集上架", "zh-Hans": "市集上架", ko: "마켓 등록" },
  supplyOther: { en: "Idle or docked", "zh-Hant": "閒置或停泊", "zh-Hans": "闲置或停泊", ko: "유휴 또는 정박" },
  supplySpire: { en: "Spires", "zh-Hant": "光塔", "zh-Hans": "光塔", ko: "광탑" },
  supplyPrism: { en: "Prisms", "zh-Hant": "稜鏡", "zh-Hans": "棱镜", ko: "프리즘" },
  supplySeeker: { en: "Seekers", "zh-Hant": "探索者", "zh-Hans": "探索者", ko: "탐색자" },
  supplyStatus: { en: "Figures from the Lightdive testnet (test tokens with no value; contracts not audited). They are replaced by mainnet figures when the game launches on mainnet.", "zh-Hant": "數字來自潛光遠征測試網（測試幣沒有價值；合約未經審計）。遊戲上正式網後，會換成正式網的數字。", "zh-Hans": "数字来自潜光远征测试网（测试币没有价值；合约未经审计）。游戏上正式网后，会换成正式网的数字。", ko: "수치는 라이트다이브 테스트넷에서 가져옵니다(가치 없는 테스트 토큰, 컨트랙트 미감사). 게임이 메인넷에 출시되면 메인넷 수치로 바뀝니다." },
  supplyMainnet: { en: "Figures from Lightdive on Robinhood Chain mainnet. The contracts are not audited.", "zh-Hant": "數字來自 Robinhood Chain 正式網上的潛光遠征。合約未經審計。", "zh-Hans": "数字来自 Robinhood Chain 正式网上的潜光远征。合约未经审计。", ko: "Robinhood Chain 메인넷의 라이트다이브 수치입니다. 컨트랙트는 감사를 받지 않았습니다." },
  legal: { en: "Legal notice", "zh-Hant": "法律聲明", "zh-Hans": "法律声明", ko: "법적 고지" },
} satisfies Record<string, Copy>;

// Lightdive v3 caps (LightdiveNFT3.maxAlive). The live figures come from the deployment the game plays on
// (components/lightdive/v3/supply-live.ts): alive from LightdiveNFT3.alive(kind), listed from the market, on-teams from
// the Locked events.
const supply = [
  { name: copy.supplySpire, cap: 3000 },
  { name: copy.supplyPrism, cap: 6000 },
  { name: copy.supplySeeker, cap: 12000 },
] as const;

const rows = [
  { name: copy.rvynName, note: copy.rvynNote, address: "0x545a1ff27596de2f31480df39aa9548f363fc361", kind: "token", verified: true },
  { name: copy.platformName, note: copy.platformNote, address: "0x2577d544bc65450dadcc712d0fd4d2aa51195957", kind: "address", verified: true },
  { name: copy.v6Name, note: copy.v6Note, address: "0xfa2bd13fbeee08b18087ee157b2752158598f888", kind: "address", verified: true },
  { name: copy.saleName, note: copy.saleNote, address: "0x6496fc99ba4d5904e6c99488a9a9f477605146ac", kind: "address", verified: true },
  { name: copy.safeName, note: copy.safeNote, address: "0xe574e30153efcd94F686124B2d586A0643b33Ef4", kind: "address", verified: "safe" },
  { name: copy.oldSaleName, note: copy.oldSaleNote, address: "0x3cb9443f4726155817106a0fe115b26e9ad14b5f", kind: "address", verified: true },
  { name: copy.adminName, note: copy.adminNote, address: "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e", kind: "address", verified: null },
] as const;

export default function TransparencyPage() {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  const live = useLiveSupply();
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__copy">
          <span className="rv-eyebrow">{t(copy.kicker)}</span>
          <h1 className="rv-h1" id="transparency-title">{t(copy.title)}</h1>
          <p className="rv-lead">{t(copy.lead)}</p>
          <p className="rv-caption">{t(copy.checked)}</p>
        </div>
      </section>

      <section className="rv-section--tight" style={{ paddingTop: 0 }} aria-labelledby="transparency-contracts">
        <div className="rv-container">
          <div className="rv-head"><span className="rv-eyebrow">01</span><h2 className="rv-h2" id="transparency-contracts">{t(copy.contractsTitle)}</h2></div>
          <div className="rv-table-wrap">
            <table className="rv-table">
              <thead><tr><th>{t(copy.colName)}</th><th>{t(copy.colAddress)}</th><th>{t(copy.colStatus)}</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.address}>
                    <td data-label={t(copy.colName)} style={{ maxWidth: 460 }}><strong>{t(row.name)}</strong><p className="rv-small" style={{ marginTop: 6 }}>{t(row.note)}</p></td>
                    <td data-label={t(copy.colAddress)} style={{ minWidth: 0 }}><Address value={row.address} locale={locale} href={`${EXPLORER}/${row.kind}/${row.address}`} /></td>
                    <td data-label={t(copy.colStatus)}><span className={`rv-pill${row.verified === null ? " rv-pill--warn" : " rv-pill--ok"}`} style={{ whiteSpace: "normal", height: "auto", padding: "5px 11px", lineHeight: 1.35 }}>{row.verified === null ? t(copy.eoa) : row.verified === "safe" ? t(copy.safeStatus) : t(copy.verifiedYes)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container"><RvynHealthPanel /></div>
      </section>

      <section className="rv-section rv-section--line" aria-labelledby="transparency-supply">
        <div className="rv-container rv-stack" style={{ ["--gap" as string]: "16px" }}>
          <div className="rv-head"><span className="rv-eyebrow">02</span><h2 className="rv-h2" id="transparency-supply">{t(copy.supplyTitle)}</h2></div>
          <p className="rv-body" style={{ maxWidth: 820 }}>{t(copy.supplyBody)}</p>
          <div className="rv-table-wrap">
            <table className="rv-table">
              <thead><tr><th>{t(copy.supplyKind)}</th><th>{t(copy.supplyCap)}</th><th>{t(copy.supplyAlive)}</th><th>{t(copy.supplyTeam)}</th><th>{t(copy.supplyListed)}</th><th>{t(copy.supplyOther)}</th></tr></thead>
              <tbody>
                {supply.map((row, k) => {
                  const n = (v: number | undefined) => (live && v !== undefined ? v.toLocaleString("en-US") : "—");
                  const other = live ? live.alive[k] - live.onTeam[k] - live.listed[k] : undefined;
                  return (
                    <tr key={row.cap}>
                      <td data-label={t(copy.supplyKind)}><strong>{t(row.name)}</strong></td>
                      <td data-label={t(copy.supplyCap)}>{(live?.maxAlive[k] ?? row.cap).toLocaleString("en-US")}</td>
                      <td data-label={t(copy.supplyAlive)}>{n(live?.alive[k])}</td>
                      <td data-label={t(copy.supplyTeam)}>{n(live?.onTeam[k])}</td>
                      <td data-label={t(copy.supplyListed)}>{n(live?.listed[k])}</td>
                      <td data-label={t(copy.supplyOther)}>{n(other === undefined ? undefined : Math.max(0, other))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="rv-pill rv-pill--warn" style={{ whiteSpace: "normal", height: "auto", padding: "5px 11px", lineHeight: 1.35, justifySelf: "start" }}>{t(live && !live.testnet ? copy.supplyMainnet : copy.supplyStatus)}</span>
        </div>
      </section>

      <section className="rv-section rv-section--line" aria-labelledby="transparency-random">
        <div className="rv-container rv-stack" style={{ ["--gap" as string]: "16px" }}>
          <div className="rv-head"><span className="rv-eyebrow">03</span><h2 className="rv-h2" id="transparency-random">{t(copy.randTitle)}</h2></div>
          <p className="rv-body" style={{ maxWidth: 820 }}>{t(copy.randBody)}</p>
          <ol className="rv-numbered" style={{ maxWidth: 820 }}>
            <li><span>{t(copy.rand1)}</span></li>
            <li><span>{t(copy.rand2)}</span></li>
            <li><span>{t(copy.rand3)}</span></li>
            <li><span>{t(copy.rand4)}</span></li>
          </ol>
          <div className="rv-row"><Link className="rv-btn rv-btn--secondary rv-btn--sm" href="/game/lightdive/verify/0">{t(copy.randVerify)}</Link></div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container rv-grid rv-grid--2">
          <div className="rv-card rv-stack" style={{ ["--gap" as string]: "14px" }} aria-labelledby="transparency-audit">
            <span className="rv-eyebrow">04</span>
            <h2 className="rv-h3" id="transparency-audit">{t(copy.auditTitle)}</h2>
            <div className="rv-notice rv-notice--risk"><ShieldAlert aria-hidden="true" /><span>{t(copy.auditBody)}</span></div>
          </div>
          <div className="rv-card rv-stack" style={{ ["--gap" as string]: "14px" }} aria-labelledby="transparency-how">
            <span className="rv-eyebrow">05</span>
            <h2 className="rv-h3" id="transparency-how">{t(copy.howTitle)}</h2>
            <ol className="rv-numbered">
              <li><span>{t(copy.how1)}</span></li>
              <li><span>{t(copy.how2)}</span></li>
              <li><span>{t(copy.how3)}</span></li>
            </ol>
            <p className="rv-caption">{t(copy.report)}</p>
          </div>
        </div>
        <div className="rv-container rv-row" style={{ marginTop: 24 }}>
          <a className="rv-btn rv-btn--secondary rv-btn--sm" href="https://github.com/RovynCore/rovyncore" target="_blank" rel="noreferrer">{t(copy.source)} <ArrowUpRight aria-hidden="true" /></a>
          <Link className="rv-btn rv-btn--secondary rv-btn--sm" href="/legal">{t(copy.legal)}</Link>
          <Link className="rv-btn rv-btn--secondary rv-btn--sm" href="/rvyn">RVYN</Link>
        </div>
      </section>
    </main>
  );
}
