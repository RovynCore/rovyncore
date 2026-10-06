// Player-facing Lightdive copy in the site's four locales. Terms follow the v3 world document
// (docs/lightdive): no mining words, seekers "come home" (歸航), public rarity names only.
import type { Locale } from "@/lib/translations";

export type Copy = Record<Locale, string>;
const c = (en: string, zhHant: string, zhHans: string, ko: string): Copy => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });

export const RARITY: Copy[] = [
  c("Glimmer", "微光", "微光", "글리머"),
  c("Vein", "輝脈", "辉脉", "베인"),
  c("Clear", "澄晶", "澄晶", "클리어"),
  c("Spectral", "稜光", "棱光", "스펙트럴"),
  c("Radiant", "曜核", "曜核", "레디언트"),
];
export const RARITY_COLOR = ["#c9ff55", "#3de7e0", "#e6f1ff", "#e8c46a", "#fff4d6"];

export const KIND_NAME: Copy[] = [
  c("Beacon Spire", "光塔", "光塔", "비컨 스파이어"),
  c("Resonance Prism", "共鳴稜鏡", "共鸣棱镜", "공명 프리즘"),
  c("Seeker", "探索者", "探索者", "탐색자"),
];
export const BEAM: Copy[] = [c("Wide", "廣域", "广域", "광역"), c("Focused", "聚焦", "聚焦", "집중"), c("Needle", "針芒", "针芒", "니들")];
export const ATTRIBUTE: Copy[] = [
  c("Dawnlight", "曦光", "曦光", "새벽빛"),
  c("Mistlight", "霧光", "雾光", "안개빛"),
  c("Crystallight", "晶光", "晶光", "수정빛"),
  c("Emberlight", "熾光", "炽光", "작열빛"),
  c("Stormlight", "雷光", "雷光", "번개빛"),
  c("Abysslight", "淵光", "渊光", "심연빛"),
];
export const ATTRIBUTE_COLOR = ["#ffd98a", "#dde6ee", "#7fd3ff", "#ff6a3d", "#a97cff", "#1fa59a"];
export const SPECIAL_SPIRE: Copy[] = [c("The Hollow Spire", "空心塔", "空心塔", "텅 빈 심장의 탑"), c("Genesis Spire", "創世塔", "创世塔", "창세의 탑")];
export const SPECIAL_PRISM: Copy[] = [c("Echo Prism", "回聲稜鏡", "回声棱镜", "메아리 프리즘"), c("Tear of the Core", "核心之淚", "核心之泪", "코어의 눈물")];
export const SIGNATURE: Copy[] = [
  c("Origin of First Light", "初光原點", "初光原点", "첫 빛의 기원"),
  c("Seven-Star Crown", "七星冠穹", "七星冠穹", "칠성의 관"),
  c("Eclipse Heart", "蝕心深空", "蚀心深空", "일식의 심장"),
  c("Meteor Wake", "流星航痕", "流星航痕", "유성의 항적"),
  c("Aurora Veil", "極光帷幕", "极光帷幕", "오로라 장막"),
  c("Eclipse Corona", "蝕環日冕", "蚀环日冕", "일식 코로나"),
];
export const OUTCOME: Copy[] = [
  c("Bridge broke", "光橋中斷", "光桥中断", "빛다리 끊김"),
  c("Steady return", "普通成功", "普通成功", "무난한 귀환"),
  c("Bright haul", "明亮收穫", "明亮收获", "밝은 수확"),
  c("Rare flare", "罕見光焰", "罕见光焰", "희귀한 광염"),
  c("Core echo", "核光回響", "核光回响", "코어빛 메아리"),
];
export const DEPTH = ["I", "II", "III", "IV", "V", "VI"];

export const T = {
  kicker: c("TESTNET · LIGHTDIVE", "測試網・潛光遠征", "测试网・潜光远征", "테스트넷 · 라이트다이브"),
  title: c("Lightdive", "潛光遠征", "潜光远征", "라이트다이브 원정"),
  tagline: c("Dive deep. Bring the First Light home.", "潛進深空，把第一道光帶回來。", "潜进深空，把第一道光带回来。", "깊이 잠항해 첫 번째 빛을 되찾아 오세요."),
  testnetNote: c(
    "This is a test version on Robinhood Chain testnet. Test RVYN and test NFTs have no value. Contracts are not audited.",
    "這是 Robinhood Chain 測試網上的測試版。測試用 RVYN 和 NFT 沒有任何價值，合約尚未審計。",
    "这是 Robinhood Chain 测试网上的测试版。测试用 RVYN 和 NFT 没有任何价值，合约尚未审计。",
    "Robinhood Chain 테스트넷의 테스트 버전입니다. 테스트 RVYN과 NFT는 가치가 없으며 컨트랙트는 감사 전입니다.",
  ),
  notDeployed: c("The testnet expedition has not launched yet.", "測試網遠征尚未開放。", "测试网远征尚未开放。", "테스트넷 원정이 아직 열리지 않았습니다."),
  connect: c("Connect wallet", "連接錢包", "连接钱包", "지갑 연결"),
  switchNet: c("Switch to testnet", "切換到測試網", "切换到测试网", "테스트넷으로 전환"),
  balance: c("Test RVYN", "測試 RVYN", "测试 RVYN", "테스트 RVYN"),
  observatory: c("Lightsource Observatory", "光源觀測站", "光源观测站", "광원 관측소"),
  pool: c("Core Light Pool", "核光池", "核光池", "코어빛 풀"),
  todayRelease: c("Today's release (est.)", "今日預估釋出", "今日预估释放", "오늘 예상 방출"),
  todayDust: c("Lightdust dove for today", "今日出發總基礎光塵", "今日出发总基础光尘", "오늘 출발한 기본 빛먼지"),
  signal: c("Signal", "訊號", "信号", "신호"),
  signalOk: c("Scheduled", "已排程", "已排程", "예약됨"),
  signalOff: c("Offline: mints and dives wait", "未排程：鑄造與潛光暫停", "未排程：铸造与潜光暂停", "미예약: 주조·다이브 대기"),
  credit: c("Ready to claim", "可領取", "可领取", "수령 가능"),
  decayFee: c("Light decay fee now", "目前光衰手續費", "当前光衰手续费", "현재 빛 감쇠 수수료"),
  claim: c("Claim RVYN", "領取 RVYN", "领取 RVYN", "RVYN 수령"),
  tabMint: c("Mint", "鑄造", "铸造", "주조"),
  tabTeams: c("My spires", "我的光塔", "我的光塔", "내 스파이어"),
  tabVault: c("Collection", "收藏", "收藏", "컬렉션"),
  tabLog: c("Voyage log", "航行日誌", "航行日志", "항해 일지"),
  price: c("Price", "價格", "价格", "가격"),
  firstDiscount: c("First mint 10% off", "首次鑄造 9 折", "首次铸造 9 折", "첫 주조 10% 할인"),
  deck: c("Deck", "牌組", "牌组", "덱"),
  cardsLeft: c("cards left", "張剩餘", "张剩余", "장 남음"),
  live: c("Live", "流通", "流通", "유통"),
  odds: c("Odds now", "目前機率", "当前概率", "현재 확률"),
  quantity: c("Quantity", "數量", "数量", "수량"),
  mintBtn: c("Draw", "抽取", "抽取", "뽑기"),
  approve: c("Approve RVYN", "授權 RVYN", "授权 RVYN", "RVYN 승인"),
  saleClosed: c("Spire sale not open", "光塔尚未開賣", "光塔尚未开卖", "스파이어 판매 전"),
  requests: c("Your draws", "你的抽取", "你的抽取", "내 뽑기"),
  waiting: c("Waiting for the hour's signal", "等待本小時訊號揭曉", "等待本小时信号揭晓", "이번 시간 신호 대기 중"),
  reveal: c("Reveal", "揭曉", "揭晓", "공개"),
  revealed: c("Revealed", "已揭曉", "已揭晓", "공개됨"),
  equipTitle: c("Assemble a spire", "組成光塔", "组成光塔", "스파이어 편성"),
  chooseSpire: c("Spire", "光塔", "光塔", "스파이어"),
  choosePrism: c("Prism mount", "稜鏡座", "棱镜座", "프리즘 거치대"),
  emptyMount: c("Leave empty", "空著", "空着", "비워 두기"),
  seekerSeats: c("Seeker seats", "探索者席位", "探索者席位", "탐색자 좌석"),
  totalLum: c("Total Luminance", "總光度", "总光度", "총 광도"),
  allowGame: c("Allow the expedition to hold your NFTs", "允許遠征合約保管 NFT", "允许远征合约保管 NFT", "원정 컨트랙트의 NFT 보관 허용"),
  equip: c("Assemble", "組隊", "组队", "편성"),
  unequip: c("Disband", "解散", "解散", "해산"),
  depth: c("Depth", "深度", "深度", "깊이"),
  coord: c("Light Coordinate", "光源座標", "光源坐标", "광원 좌표"),
  attribute: c("Attribute", "屬性", "属性", "속성"),
  attuned: c("is attuned to this coordinate.", "的光紋與這個座標同頻。", "的光纹与这个坐标同频。", "의 빛무늬가 이 좌표와 동조합니다."),
  dive: c("Dive", "出發潛光", "出发潜光", "다이브 시작"),
  doveToday: c("Dove today", "今日已出發", "今日已出发", "오늘 출발함"),
  tooDim: c("Not bright enough", "光度不足", "光度不足", "광도 부족"),
  noSeekers: c("Seat at least one seeker", "至少需要一位探索者", "至少需要一位探索者", "탐색자가 최소 1명 필요"),
  noTeams: c("No spire assembled yet.", "還沒有組成任何光塔。", "还没有组成任何光塔。", "편성된 스파이어가 없습니다."),
  empty: c("Nothing here yet.", "這裡還沒有東西。", "这里还没有东西。", "아직 아무것도 없습니다."),
  voyages: c("Voyages left", "剩餘航程", "剩余航程", "남은 항해"),
  luminance: c("Luminance", "光度", "光度", "광도"),
  special: c("Special Edition", "特別款", "特别款", "스페셜 에디션"),
  signature: c("Signature", "星紋", "星纹", "시그니처"),
  settleAll: c("Settle ready dives", "結算可結算的航程", "结算可结算的航程", "정산 가능한 항해 정산"),
  pending: c("In progress", "航行中", "航行中", "항해 중"),
  settleable: c("Ready to settle", "可結算", "可结算", "정산 가능"),
  lightdust: c("Lightdust", "光塵", "光尘", "빛먼지"),
  reward: c("RVYN", "RVYN", "RVYN", "RVYN"),
  homecoming: c("Seekers with no voyages left come home and are written in the Star Registry.", "航程用完的探索者會歸航，名字記在星圖名冊上。", "航程用完的探索者会归航，名字记在星图名册上。", "항해를 모두 마친 탐색자는 귀환하여 성도 명부에 기록됩니다."),
  oddsTitle: c("Published odds", "公開機率", "公开概率", "공개 확률"),
  oddsNote: c(
    "Each beam's long-run average is exactly 1.00x; beams differ only in how much results swing. Values come straight from the contract.",
    "三種光束的長期平均都是 1.00 倍，差別只在波動大小。數值直接讀自合約。",
    "三种光束的长期平均都是 1.00 倍，差别只在波动大小。数值直接读自合约。",
    "세 빔의 장기 평균은 모두 정확히 1.00배이며 변동 폭만 다릅니다. 값은 컨트랙트에서 직접 읽습니다.",
  ),
  done: c("Confirmed on chain", "鏈上已確認", "链上已确认", "온체인 확인됨"),
  refresh: c("Refresh", "重新整理", "刷新", "새로고침"),
} satisfies Record<string, Copy>;

export const LOG_LINE: Copy[] = [
  c("The bridge broke before {coord}; {name} came back empty-handed.", "光橋在{coord}前中斷，{name} 空手返回。", "光桥在{coord}前中断，{name} 空手返回。", "{coord} 앞에서 빛다리가 끊겨 {name}이(가) 빈손으로 돌아왔습니다."),
  c("{name} brought a beam of light back from {coord}.", "{name} 從{coord}帶回了一束光。", "{name} 从{coord}带回了一束光。", "{name}이(가) {coord}에서 빛 한 줄기를 가져왔습니다."),
  c("{name} met a bright light deep in {coord} and carried it home.", "{name} 在{coord}深處遇見一片明亮的光，帶著它回到了光塔。", "{name} 在{coord}深处遇见一片明亮的光，带着它回到了光塔。", "{name}이(가) {coord} 깊은 곳에서 밝은 빛을 만나 스파이어로 돌아왔습니다."),
  c("A flare lit up the whole bridge at {coord}; {name} brought the rare light home.", "{coord}深處忽然燃起一道光焰，整條光橋都被照亮了。{name} 帶著這道罕見的光回到了光塔。", "{coord}深处忽然燃起一道光焰，整条光桥都被照亮了。{name} 带着这道罕见的光回到了光塔。", "{coord} 깊은 곳에서 광염이 일어 빛다리 전체가 밝아졌습니다. {name}이(가) 희귀한 빛을 가져왔습니다."),
  c("The Core itself answered at {coord}. {name} came home carrying its echo.", "{coord}傳來核光的回響。{name} 帶著這道回響回到了光塔。", "{coord}传来核光的回响。{name} 带着这道回响回到了光塔。", "{coord}에서 코어빛의 메아리가 울렸습니다. {name}이(가) 그 메아리를 안고 돌아왔습니다."),
];
