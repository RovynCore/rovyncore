import type { Locale } from "./translations";
type Copy = { title: string; sections: [string, string][] };
export const legalCopy: Record<Locale, Copy> = {
  en: {
    title: "Terms, privacy & risks",
    sections: [
      [
        "Operator & contact",
        "This service is operated by the ROVYN CORE team. Primary domain: rovyncore.com; backup: rovyncore.net. Public contact: official X @RovynCORE. The intended market is global, only where providing and using the service is lawful. Global access does not mean authorization in every jurisdiction. This is an independent platform, not an official Robinhood product or a claim of partnership.",
      ],
      [
        "Service, fees & wallets",
        "The platform currently provides wallet-authorized fixed-supply token creation, public Onchain Records and public read-only API endpoints. Creator-signed metadata updates and refresh requests are separate authenticated actions. The directory is an issuance-record archive, not a trending or recommendation feed. Boost code is retained for possible future use, but paid promotion is not currently open and is not part of the current service. You control your wallet and authorize transactions; we never request or hold private keys or recovery phrases. Verify the network, contract, recipient and amount before signing. Any applicable launch fee and network gas are shown separately before signing. Public records are not security ratings or endorsements. Successful payments under current contracts have no automatic refund; mandatory legal rights are not excluded.",
      ],
      [
        "RVYN & risk",
        "ROVYN CORE (RVYN) is the platform's first token; its verified contract and issuance data are shown in the Onchain Record. RVYN is planned as the core currency of our first game, which is in development; no in-game or other utility is live yet. RVYN grants no company equity, dividends, staking rewards, principal protection or guaranteed returns. Tokens may have no buyers, liquidity or market and can lose all value. The RVYN sale contract (V5) is deployed on Robinhood Chain but has not been funded or opened, and no sale date has been set. Its fixed terms are: 1,000,000 RVYN at 0.0001 ETH each; a cumulative cap of 0.25 ETH (2,500 RVYN) per wallet and 100 ETH in total; a 14-day sale window once opened; purchases only from wallets in the published onchain whitelist, which the contract checks with a Merkle proof; and delivery of purchased RVYN in the same transaction as payment. The contract has no buyer refund, no later claim step, no minimum raise and no emergency pause during a sale. The sale contract has not been audited by an independent third party; it has only been tested by its developers, so bugs may exist and funds sent to it can be lost. Its allocation caps for the 10,000,000 RVYN supply are 10% presale, 50% liquidity (initial pool and future liquidity), 5% manager wallet, 10% team vesting, 10% product/ecosystem, 10% community/creators and 5% airdrops. Team vesting starts when the sale opens: a 365-day cliff, then 24 releases every 30 days. The initial pool may use at most half of the ETH raised plus separately deposited launchpad revenue, paired at the sale price, and its LP tokens are locked for the 730 days set in the contract; unsold presale tokens are burned at settlement. These caps describe what the contract allows; they are not proof that tokens have been transferred, locked or put into circulation. Check the live onchain state before any purchase. Listing is not an investment endorsement.",
      ],
      [
        "Allowlist and sale stages",
        "A listed wallet has eligibility to buy RVYN if a sale opens. It is not an NFT. It is not a live sale. Listing is not an allocation of tokens. The public stage may be whitelist preparing, whitelist open, sale open or sale closed. Registering submits an application; eligibility exists only after administrator approval and publication of the onchain whitelist root, which can be set only before the sale opens and is then fixed. While purchases are not open, no payment should be sent to any claimed sale address. Before the root is published, the administrator may approve or revoke applications; the site shows the current registry status and does not promise a purchase allocation. Purchases are possible only when the website stage is sale open, the sale contract is open and the published root has been verified against the approved list.",
      ],
      [
        "Administrator powers & content",
        "The RVYN presale contract is sponsored by a Safe multisignature wallet (any 2 of 3 signers). Platform administration and fee collection (Treasury) still use a single wallet without multisignature protection; moving them to the multisig is planned. The administrator can exercise applicable fee and pause powers in deployed contracts. The RVYN sale contract has no pause or refund function; its sponsor can close an open sale but cannot reverse completed purchases. Boost code is retained, but paid promotion is not currently open or part of the service. Administrative powers and key compromise create centralization risk. Bugs, attacks, RPC failures and network outages may affect service. Creators are responsible for token information, links and rights to uploaded materials. Impersonation, fraud, phishing and unlawful content are prohibited. Report projects from their token pages or through official X. Hiding a website listing does not delete or freeze immutable onchain tokens.",
      ],
      [
        "Privacy & backups",
        "The application stores public wallet addresses, transaction mirrors, token metadata, images, reports and administration records for operation, moderation and security. Daily IP/browser-derived hashes support deduplicated views and rate limits; raw IP addresses are not written to the application database. Infrastructure providers may process network identifiers and logs under their policies. Browser storage holds language preferences, drafts and transaction recovery data. Optional human verification uses Cloudflare Turnstile when activated. The configured policy is daily encrypted backups retained for 30 days after the external scheduler is activated; this is not a 30-day deletion policy for live records. Live records are retained for these purposes and reviewed on request. Request access, correction or deletion of offchain personal data through official X; identity or wallet-control verification may be needed. Do not post sensitive information publicly. Blockchain records cannot be deleted by the operator. Email support and email incident alerts are not currently offered.",
      ],
      [
        "Pre-launch status & changes",
        "Version 0.4 · 4 October 2026 · Updated for the deployed V5 sale contract, the unset sale date and RVYN's planned role as the game's core currency. The network displayed in the interface determines whether an action uses testnet or mainnet. A domain or translated page does not mean fundraising is open. Applicable legal, registration and consumer-protection requirements still need assessment before commercial sale. These terms do not establish regulatory approval or waive mandatory rights. Material changes will be dated here. Report translation discrepancies through the official contact.",
      ],
    ],
  },
  "zh-Hant": {
    title: "使用條款、隱私與風險",
    sections: [
      [
        "營運者與聯絡",
        "本平台由 ROVYN CORE 團隊營運。主要網域：rovyncore.com；備用：rovyncore.net。公開聯絡：官方 X @RovynCORE。目標市場為全球，但僅限提供及使用服務均合法的地區；全球可存取不代表取得各地許可。本平台獨立營運，並非 Robinhood 官方產品，也不表示合作關係。",
      ],
      [
        "服務、費用與錢包",
        "平台目前提供由錢包授權的固定供應 Token 建立流程、公開 Onchain Record 與公開唯讀 API；創作者簽署的展示資料更新及手動刷新屬另外的驗證操作。目錄是發行紀錄檔案庫，不是熱門榜或推薦動態。Boost 程式保留作未來可能使用；目前未開放付費推廣，也不屬於現行服務。你自行控制錢包並授權交易，平台不索取或保管私鑰及助記詞。簽署前請核對網路、合約、接收者與金額；適用的發射費及網路 Gas 會在簽署前分開顯示。公開紀錄不是安全評級或投資背書。現行合約的成功付款沒有自動退款機制，但不影響法律強制保障的權利。",
      ],
      [
        "RVYN 與風險",
        "ROVYN CORE（RVYN）是平台首個代幣；經核對的合約與發行資料請以鏈上紀錄為準。RVYN 規劃為我們第一款遊戲的核心貨幣，遊戲目前開發中；遊戲內或其他用途皆尚未上線。RVYN 不賦予公司股權、分紅、staking 收益、保本或保證報酬。代幣可能沒有買方、流動性或市場，價值可能歸零。RVYN 預售合約（V5）已部署於 Robinhood Chain，但尚未存入庫存、尚未開售，也尚未訂定預售日期。合約固定條件為：1,000,000 RVYN、每枚 0.0001 ETH；單錢包累計上限 0.25 ETH（2,500 RVYN），總上限 100 ETH；開售後銷售期 14 天；只有列入已公布鏈上白名單的錢包可以購買，由合約以 Merkle proof 驗證；購買的 RVYN 與付款在同一筆交易中交付。合約沒有買家退款、事後領取、最低募資門檻，也沒有售中緊急暫停。此預售合約尚未經過獨立第三方審計，僅由開發者自行測試，可能存在漏洞，匯入的資金有可能損失。10,000,000 RVYN 的合約配置上限為預售 10%、流動性 50%（首池及未來流動性）、管理者錢包 5%、團隊鎖倉 10%、產品與生態 10%、社群與創作者 10%、空投 5%。團隊鎖倉於開售時啟動：365 天 cliff，之後每 30 天釋出一次，共 24 次。首池最多使用募得 ETH 的一半，加上另行轉入的發射台收益，依預售價格配對；首池 LP 依合約設定鎖倉 730 天；未售出的預售代幣於結算時銷毀。以上配置上限說明的是合約允許的範圍，不代表代幣已轉出、已鎖倉或已流通。購買前請查核即時鏈上狀態。平台收錄不是投資背書。",
      ],
      [
        "白名單與銷售階段",
        "列入白名單只代表未來若開售時購買 RVYN 的資格。它不是 NFT，目前也不是正在進行的販售；列入名單不代表已獲配代幣。公開階段依序為白名單準備、白名單開放、預售開放與預售結束。登記只是送出申請；須經管理員核准，並公布鏈上白名單根值後才具備資格。根值只能在開售前設定，開售後即固定。購買未開放前，請勿向任何宣稱的預售地址付款。根值公布前，管理員可以核准或撤銷申請；網站顯示當前登錄狀態，但不保證購買配額。只有在網站階段為預售開放、預售合約已開啟，且已公布的根值與核准名單核對一致時，才可以購買。",
      ],
      [
        "管理權限與內容",
        "RVYN 預售合約的發起人是 Safe 多簽錢包（3 位簽署人中任兩位同意）。平台管理與費用收款（Treasury）目前仍採單一錢包，尚未使用多簽，之後規劃轉移至多簽。管理者可行使已部署合約中適用的費率及暫停權限。RVYN 預售合約沒有暫停或退款功能；發起者可以結束進行中的預售，但無法撤銷已完成的購買。Boost 程式雖予保留，目前未開放付費推廣，也不屬於現行服務。管理權限及私鑰外洩均有中心化風險。漏洞、攻擊、RPC 異常及網路中斷可能影響服務。創作者須對 Token 資訊、連結及上傳素材權利負責，不得冒名、詐騙、釣魚或提供違法內容。可於 Token 頁或官方 X 檢舉。隱藏網站展示不會刪除或凍結不可變更的鏈上代幣。",
      ],
      [
        "隱私與備份",
        "應用程式為營運、審核及安全保存公開錢包地址、交易鏡像、Token metadata、圖片、檢舉與管理紀錄。每日 IP／瀏覽器衍生雜湊用於去重瀏覽及限流，不將原始 IP 寫入應用資料庫。基礎設施商可能依自身政策處理網路識別資料與紀錄。瀏覽器儲存語言選擇、草稿及交易恢復資訊。選用的人機驗證啟用時使用 Cloudflare Turnstile。設定政策為外部排程啟用後每日加密備份、保留 30 天；不代表正式資料在 30 天後刪除。正式資料為上述目的保存並依請求檢視。可透過官方 X 請求查閱、更正或刪除鏈下個人資料，必要時須驗證身分或錢包控制權。請勿公開張貼敏感資料。營運者無法刪除鏈上紀錄。目前不提供 Email 客服，也暫停 Email 故障告警。",
      ],
      [
        "正式營運前狀態與修改",
        "版本 0.4 · 2026 年 10 月 4 日 · 依已部署的 V5 預售合約、尚未訂定的預售日期，以及 RVYN 作為遊戲核心貨幣的規劃更新。測試網或主網以介面顯示的網路為準，有網域或翻譯頁面不代表募資已開放。正式商業販售前仍須評估適用法律、登記與消費者保護要求。本條款不構成主管機關核准，也不排除強制權利。重大修改會在本頁標示日期；翻譯差異請透過官方管道反映。",
      ],
    ],
  },
  "zh-Hans": {
    title: "使用条款、隐私与风险",
    sections: [
      [
        "运营者与联系",
        "本平台由 ROVYN CORE 团队运营。主要域名：rovyncore.com；备用：rovyncore.net。公开联系：官方 X @RovynCORE。目标市场为全球，但仅限提供和使用服务均合法的地区；全球可访问不代表取得各地许可。本平台独立运营，并非 Robinhood 官方产品，也不表示合作关系。",
      ],
      [
        "服务、费用与钱包",
        "平台目前提供由钱包授权的固定供应 Token 创建流程、公开 Onchain Record 与公开只读 API；创作者签署的展示资料更新及手动刷新属于另外的验证操作。目录是发行记录档案库，不是热门榜或推荐动态。Boost 程序保留作未来可能使用；目前未开放付费推广，也不属于现行服务。你自行控制钱包并授权交易，平台不索取或保管私钥及助记词。签名前请核对网络、合约、接收者与金额；适用的发行费及网络 Gas 会在签名前分别显示。公开记录不是安全评级或投资背书。现行合约的成功付款没有自动退款机制，但不影响法律强制保障的权利。",
      ],
      [
        "RVYN 与风险",
        "ROVYN CORE（RVYN）是平台首个代币；经核对的合约和发行资料请以链上记录为准。RVYN 规划为我们第一款游戏的核心货币，游戏目前开发中；游戏内或其他用途均尚未上线。RVYN 不赋予公司股权、分红、staking 收益、保本或保证回报。代币可能没有买方、流动性或市场，价值可能归零。RVYN 预售合约（V5）已部署于 Robinhood Chain，但尚未存入库存、尚未开售，也尚未确定预售日期。合约固定条件为：1,000,000 RVYN、每枚 0.0001 ETH；单钱包累计上限 0.25 ETH（2,500 RVYN），总上限 100 ETH；开售后销售期 14 天；只有列入已公布链上白名单的钱包可以购买，由合约以 Merkle proof 验证；购买的 RVYN 与付款在同一笔交易中交付。合约没有买家退款、事后领取、最低募资门槛，也没有售中紧急暂停。此预售合约尚未经过独立第三方审计，仅由开发者自行测试，可能存在漏洞，转入的资金有可能损失。10,000,000 RVYN 的合约配置上限为预售 10%、流动性 50%（首池及未来流动性）、管理者钱包 5%、团队锁仓 10%、产品与生态 10%、社群与创作者 10%、空投 5%。团队锁仓于开售时启动：365 天 cliff，之后每 30 天释放一次，共 24 次。首池最多使用募得 ETH 的一半，加上另行转入的发射台收益，按预售价格配对；首池 LP 按合约设定锁仓 730 天；未售出的预售代币在结算时销毁。以上配置上限说明的是合约允许的范围，不代表代币已转出、已锁仓或已流通。购买前请核对实时链上状态。平台收录不是投资背书。",
      ],
      [
        "白名单与销售阶段",
        "列入白名单只代表未来若开售时购买 RVYN 的资格。它不是 NFT，目前也不是正在进行的销售；列入名单不代表已获配代币。公开阶段依次为白名单准备、白名单开放、预售开放和预售结束。登记只是提交申请；须经管理员核准，并公布链上白名单根值后才具备资格。根值只能在开售前设定，开售后即固定。购买未开放前，请勿向任何宣称的预售地址付款。根值公布前，管理员可以核准或撤销申请；网站显示当前登记状态，但不保证购买配额。只有在网站阶段为预售开放、预售合约已开启，且已公布的根值与核准名单核对一致时，才可以购买。",
      ],
      [
        "管理权限与内容",
        "RVYN 预售合约的发起人是 Safe 多签钱包（3 位签署人中任两位同意）。平台管理与费用收款（Treasury）目前仍采用单一钱包，尚未使用多签，之后规划转移至多签。管理员可行使已部署合约中适用的费率及暂停权限。RVYN 预售合约没有暂停或退款功能；发起者可以结束进行中的预售，但无法撤销已完成的购买。Boost 程序虽予保留，目前未开放付费推广，也不属于现行服务。管理权限和私钥泄露均有中心化风险。漏洞、攻击、RPC 异常和网络中断可能影响服务。创作者须对 Token 信息、链接及上传素材权利负责，不得冒名、诈骗、钓鱼或提供违法内容。可在 Token 页面或官方 X 举报。隐藏网站展示不会删除或冻结不可变更的链上代币。",
      ],
      [
        "隐私与备份",
        "应用为运营、审核及安全保存公开钱包地址、交易镜像、Token metadata、图片、举报和管理记录。每日 IP／浏览器衍生哈希用于去重浏览和限流，不将原始 IP 写入应用数据库。基础设施商可能依自身政策处理网络标识和日志。浏览器保存语言选择、草稿及交易恢复信息。可选的人机验证启用时使用 Cloudflare Turnstile。设置政策为外部调度启用后每日加密备份、保留 30 天；不代表正式数据在 30 天后删除。正式数据为上述目的保存并依请求审查。可通过官方 X 请求查阅、更正或删除链下个人数据，必要时须验证身份或钱包控制权。请勿公开发布敏感数据。运营者无法删除链上记录。当前不提供 Email 客服，并暂停 Email 故障告警。",
      ],
      [
        "正式运营前状态与修改",
        "版本 0.4 · 2026 年 10 月 4 日 · 依已部署的 V5 预售合约、尚未确定的预售日期，以及 RVYN 作为游戏核心货币的规划更新。测试网或主网以界面显示的网络为准，域名或翻译页面不代表募资已开放。正式商业销售前仍须评估适用法律、登记和消费者保护要求。本条款不构成监管批准，也不排除强制权利。重大修改会在本页标示日期；翻译差异请通过官方渠道反馈。",
      ],
    ],
  },
  ko: {
    title: "이용약관, 개인정보 및 위험",
    sections: [
      [
        "운영자 및 연락처",
        "본 서비스는 ROVYN CORE 팀이 운영합니다. 기본 도메인은 rovyncore.com, 예비 도메인은 rovyncore.net입니다. 공개 연락처는 공식 X @RovynCORE입니다. 전 세계를 대상으로 하되 서비스 제공과 이용이 모두 합법인 지역으로 한정됩니다. 전 세계 접속 가능 여부는 각 지역의 허가를 의미하지 않습니다. 독립 플랫폼이며 Robinhood 공식 제품 또는 제휴를 의미하지 않습니다.",
      ],
      [
        "서비스, 수수료 및 지갑",
        "플랫폼은 현재 지갑 승인을 통한 고정 공급 토큰 생성, 공개 Onchain Record, 공개 읽기 전용 API를 제공합니다. 크리에이터 서명이 필요한 표시 정보 수정과 수동 새로고침은 별도의 인증 작업입니다. 디렉터리는 발행 기록 보관소이며 인기 순위나 추천 피드가 아닙니다. Boost 코드는 향후 사용 가능성을 위해 보존되어 있지만 유료 홍보는 현재 열려 있지 않으며 현행 서비스에 포함되지 않습니다. 지갑과 거래 승인은 사용자가 직접 관리하며 개인 키나 복구 문구를 요청하거나 보관하지 않습니다. 서명 전에 네트워크, 계약, 수령인 및 금액을 확인하세요. 해당 발행 수수료와 네트워크 가스는 서명 전에 별도로 표시됩니다. 공개 기록은 보안 평가나 투자 보증이 아닙니다. 현재 계약의 성공한 결제에는 자동 환불 기능이 없지만 법률상 강행 권리를 배제하지 않습니다.",
      ],
      [
        "RVYN 및 위험",
        "ROVYN CORE(RVYN)는 플랫폼의 첫 토큰입니다. 검증된 계약과 발행 정보는 온체인 기록에서 확인하세요. RVYN은 개발 중인 첫 게임의 핵심 화폐로 계획되어 있으며, 게임 내 용도나 기타 효용은 아직 제공되지 않습니다. RVYN은 회사 지분, 배당, 스테이킹 보상, 원금 보호 또는 보장 수익을 제공하지 않습니다. 토큰에는 구매자, 유동성 또는 시장이 없을 수 있고 가치가 전부 소실될 수 있습니다. RVYN 판매 계약(V5)은 Robinhood Chain에 배포되었지만 아직 재고가 예치되지 않았고 판매가 열리지 않았으며 판매 일정도 정해지지 않았습니다. 계약의 고정 조건은 다음과 같습니다. 1,000,000 RVYN을 개당 0.0001 ETH에 판매하며, 지갑당 누적 0.25 ETH(2,500 RVYN), 전체 100 ETH로 제한합니다. 판매가 열리면 기간은 14일입니다. 공개된 온체인 화이트리스트에 있는 지갑만 구매할 수 있고 계약이 Merkle proof로 확인합니다. 구매한 RVYN은 결제와 같은 트랜잭션에서 지급됩니다. 계약에는 구매자 환불, 사후 청구 단계, 최소 모금액, 판매 중 긴급 일시 중지 기능이 없습니다. 이 판매 계약은 독립적인 제3자 감사를 받지 않았고 개발자가 자체 테스트만 했으므로 버그가 있을 수 있으며 송금한 자금을 잃을 수 있습니다. 총 10,000,000 RVYN에 대한 계약상 배분 상한은 프리세일 10%, 유동성 50%(초기 풀 및 향후 유동성), 관리자 지갑 5%, 팀 베스팅 10%, 제품/생태계 10%, 커뮤니티/크리에이터 10%, 에어드롭 5%입니다. 팀 베스팅은 판매 개시 시점에 시작되며 365일 cliff 후 30일마다 24회 해제됩니다. 초기 풀은 모금된 ETH의 최대 절반과 별도로 입금된 런치패드 수익을 판매 가격으로 짝지어 사용할 수 있으며, LP 토큰은 계약에 설정된 730일 동안 잠깁니다. 미판매 프리세일 토큰은 정산 시 소각됩니다. 이 상한은 계약이 허용하는 범위일 뿐 토큰의 이전, 잠금 또는 유통을 증명하지 않습니다. 구매 전 실시간 온체인 상태를 확인하세요. 등록은 투자 보증이 아닙니다.",
      ],
      [
        "허용 목록 및 판매 단계",
        "목록 등록은 판매가 열릴 경우 RVYN을 구매할 자격일 뿐입니다. NFT가 아니며 현재 판매 중이 아닙니다. 등록이 토큰 배정을 뜻하지 않습니다. 공개 단계는 화이트리스트 준비, 화이트리스트 공개, 판매 시작 및 판매 종료입니다. 등록은 신청을 제출하는 것이며, 관리자 승인과 온체인 화이트리스트 루트 게시 후에만 자격이 생깁니다. 루트는 판매 개시 전에만 설정할 수 있고 이후에는 고정됩니다. 구매가 열리기 전에는 판매 주소라는 곳으로 대금을 보내지 마세요. 루트가 게시되기 전까지 관리자는 신청을 승인하거나 취소할 수 있으며, 사이트는 현재 상태를 표시하지만 구매 배정을 약속하지 않습니다. 웹사이트 단계가 판매 시작이고 판매 계약이 열려 있으며 게시된 루트가 승인 목록과 일치하는 것이 확인된 경우에만 구매할 수 있습니다.",
      ],
      [
        "관리 권한 및 콘텐츠",
        "RVYN 프리세일 컨트랙트의 스폰서는 Safe 멀티시그 지갑입니다(서명자 3명 중 2명 승인). 플랫폼 관리와 수수료 수금(Treasury)은 현재 멀티시그 없이 단일 지갑을 사용하며, 멀티시그로 옮기는 것을 계획하고 있습니다. 관리자는 배포된 계약의 해당 수수료 및 일시 중지 권한을 행사할 수 있습니다. RVYN 판매 계약에는 일시 중지나 환불 기능이 없으며, 운영자는 진행 중인 판매를 종료할 수 있지만 완료된 구매를 되돌릴 수 없습니다. Boost 코드는 보존되어 있지만 유료 홍보는 현재 열려 있지 않으며 현행 서비스에 포함되지 않습니다. 관리 권한 및 키 유출에는 중앙화 위험이 있습니다. 버그, 공격, RPC 장애 및 네트워크 중단이 서비스에 영향을 줄 수 있습니다. 창작자는 토큰 정보, 링크 및 업로드 자료의 권리를 책임집니다. 사칭, 사기, 피싱 및 불법 콘텐츠는 금지됩니다. 토큰 페이지 또는 공식 X에서 신고하세요. 웹사이트 목록을 숨겨도 변경 불가능한 온체인 토큰이 삭제되거나 동결되지 않습니다.",
      ],
      [
        "개인정보 및 백업",
        "앱은 운영, 검토 및 보안을 위해 공개 지갑 주소, 거래 사본, 토큰 메타데이터, 이미지, 신고 및 관리 기록을 저장합니다. 일별 IP/브라우저 파생 해시로 조회 중복과 요청량을 제한하며 원본 IP는 앱 데이터베이스에 기록하지 않습니다. 인프라 제공자는 자체 정책에 따라 네트워크 식별 정보와 로그를 처리할 수 있습니다. 브라우저에는 언어 선택, 초안 및 거래 복구 정보가 저장됩니다. 선택적 사용자 인증이 활성화되면 Cloudflare Turnstile을 사용합니다. 설정된 정책은 외부 스케줄러 활성화 후 매일 암호화 백업을 수행하고 30일간 보관하는 것입니다. 모든 운영 데이터가 30일 후 삭제된다는 의미는 아닙니다. 운영 데이터는 위 목적에 따라 보관하고 요청 시 검토합니다. 공식 X로 오프체인 개인정보의 열람, 정정 또는 삭제를 요청할 수 있으며 신원 또는 지갑 제어 확인이 필요할 수 있습니다. 민감한 정보를 공개 게시하지 마세요. 운영자는 블록체인 기록을 삭제할 수 없습니다. 현재 이메일 고객 지원 및 이메일 장애 알림은 제공하지 않습니다.",
      ],
      [
        "정식 운영 전 상태 및 변경",
        "버전 0.4 · 2026년 10월 4일 · 배포된 V5 판매 계약, 아직 정해지지 않은 판매 일정, 게임 핵심 화폐로서 RVYN의 계획된 역할을 반영해 갱신했습니다. 테스트넷 또는 메인넷 여부는 화면에 표시된 네트워크를 따릅니다. 도메인이나 번역 페이지가 모금 개시를 의미하지 않습니다. 상업적 판매 전 관련 법률, 등록 및 소비자 보호 요건을 검토해야 합니다. 이 약관은 규제 승인을 의미하거나 강행 권리를 포기시키지 않습니다. 중요한 변경은 이 페이지에 날짜와 함께 표시합니다. 번역 차이는 공식 연락처로 알려주세요.",
      ],
    ],
  },
};
