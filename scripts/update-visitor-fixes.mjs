// One-off edit after a visitor-perspective review (2026-10-06):
//  1. /latest-info no longer claims the X posts sync automatically every five minutes (the sync is off).
//  2. /rvyn hero shows when whitelist registration opens instead of "Registration closed" while it is only scheduled.
//  3. Development log gets an entry for the V6 presale, transparency, badge and the scheduled whitelist (four languages).
import fs from "node:fs";

const edit = (file, fn) => {
  let t = fs.readFileSync(file, "utf8");
  const crlf = t.includes("\r\n");
  t = fn(t.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? t.replace(/\n/g, "\r\n") : t);
};
const must = (t, from, to) => { if (!t.includes(from)) throw new Error(`missing: ${from.slice(0, 80)}`); return t.replace(from, to); };

edit("app/development-log/page.tsx", (t) => {
  t = must(t, 'flashNotice: "Official public posts are checked automatically about every five minutes. You can read the saved text without an X login; temporary sync delays do not remove existing posts."', 'flashNotice: "These are saved copies of selected official posts. Automatic syncing is currently paused, so newer posts appear on our X account first. You can read the saved text without an X login."');
  t = must(t, 'flashNotice: "系統約每五分鐘自動檢查官方公開貼文，不需登入 X 即可閱讀已同步的文字；同步暫時延遲時會保留既有貼文。"', 'flashNotice: "這裡是已儲存的官方貼文副本。自動同步目前暫停，較新的貼文會先出現在我們的 X 帳號。不需登入 X 即可閱讀已儲存的文字。"');
  t = must(t, 'flashNotice: "系统约每五分钟自动检查官方公开帖子，无需登录 X 即可阅读已同步的文字；同步暂时延迟时会保留现有帖子。"', 'flashNotice: "这里是已保存的官方帖子副本。自动同步目前暂停，较新的帖子会先出现在我们的 X 账号。无需登录 X 即可阅读已保存的文字。"');
  t = must(t, 'flashNotice: "공식 공개 게시물을 약 5분마다 자동 확인합니다. X 로그인 없이 동기화된 본문을 읽을 수 있으며 일시적인 지연에도 기존 게시물은 유지됩니다."', 'flashNotice: "선별한 공식 게시물의 저장본입니다. 자동 동기화는 현재 중지되어 있어 최신 게시물은 X 계정에 먼저 올라옵니다. X 로그인 없이 저장된 본문을 읽을 수 있습니다."');

  const entries = {
    en: { date: "Oct 6, 2026", title: "RVYN presale V6, live onchain facts and a public record badge", summary: "The presale contract was redesigned and deployed as V6, the site gained live onchain figures and an embeddable record badge, and whitelist registration is scheduled.", changes: [
      "We found a flaw in our first presale contract before it opened: tokens were delivered at purchase, so anyone could seed the trading pool first and block settlement. The unused V5 contract was cancelled and replaced by V6, where buyers claim after settlement, the pool is built by direct mint with a floor of half the raise, and anyone can settle seven days after the sale closes.",
      "V6 is deployed on Robinhood Chain and its source is verified on the explorer. It has not been independently audited and the sale is not open; no sale date is set.",
      "Added a Transparency page with live onchain figures (supply, holders, sale state), the Safe 2-of-3 multisig that sponsors the sale, and public source code on GitHub.",
      "Added an embeddable Onchain Record badge for every asset record.",
      "Whitelist registration is scheduled for Oct 9 to Oct 19 (UTC+8) and opens automatically; registration now uses human verification. A listing is not a token allocation.",
      "Terms updated to version 0.5 for V6, and an outdated allocation image was replaced with the correct caps."] },
    "zh-Hant": { date: "2026 年 10 月 6 日", title: "RVYN 預售 V6、即時鏈上資料與公開紀錄徽章", summary: "預售合約重新設計並部署為 V6，網站新增即時鏈上數據與可嵌入的紀錄徽章，白名單登記已排程。", changes: [
      "我們在開售前發現第一版預售合約的缺陷：購買時立即發放代幣，任何人都能搶先建立交易池而卡住結算。尚未使用的 V5 合約已取消，由 V6 取代：買家結算後才領取、以直接鑄造建池且下限為募資額的一半、預售結束滿七天後任何人都能結算。",
      "V6 已部署於 Robinhood Chain，原始碼已在區塊瀏覽器驗證。它尚未經過獨立審計，預售也尚未開放，沒有訂定開售日期。",
      "新增透明頁，顯示即時鏈上數據（供應量、持有分布、預售狀態）、擔任預售發起人的 Safe 3 取 2 多簽，以及 GitHub 公開原始碼。",
      "每個資產紀錄新增可嵌入的 Onchain Record 徽章。",
      "白名單登記排程於 10 月 9 日至 10 月 19 日（UTC+8），時間到自動開放；登記現在加入人機驗證。列入名單不代表代幣配額。",
      "條款更新至 0.5 版以配合 V6，並將過時的配置圖換成正確的上限。"] },
    "zh-Hans": { date: "2026 年 10 月 6 日", title: "RVYN 预售 V6、实时链上数据与公开记录徽章", summary: "预售合约重新设计并部署为 V6，网站新增实时链上数据与可嵌入的记录徽章，白名单登记已排程。", changes: [
      "我们在开售前发现第一版预售合约的缺陷：购买时立即发放代币，任何人都能抢先建立交易池而卡住结算。尚未使用的 V5 合约已取消，由 V6 取代：买家结算后才领取、以直接铸造建池且下限为募资额的一半、预售结束满七天后任何人都能结算。",
      "V6 已部署于 Robinhood Chain，源码已在区块浏览器验证。它尚未经过独立审计，预售也尚未开放，没有确定开售日期。",
      "新增透明页，显示实时链上数据（供应量、持有分布、预售状态）、担任预售发起人的 Safe 3 取 2 多签，以及 GitHub 公开源码。",
      "每个资产记录新增可嵌入的 Onchain Record 徽章。",
      "白名单登记排程于 10 月 9 日至 10 月 19 日（UTC+8），时间到自动开放；登记现在加入人机验证。列入名单不代表代币配额。",
      "条款更新至 0.5 版以配合 V6，并将过时的配置图换成正确的上限。"] },
    ko: { date: "2026년 10월 6일", title: "RVYN 프리세일 V6, 실시간 온체인 정보, 공개 기록 배지", summary: "프리세일 계약을 재설계해 V6로 배포했고, 실시간 온체인 수치와 삽입형 기록 배지를 추가했으며 화이트리스트 신청 일정을 잡았습니다.", changes: [
      "판매 시작 전에 첫 프리세일 계약의 결함을 발견했습니다. 구매 시 토큰을 즉시 지급해서 누구나 먼저 거래 풀을 만들어 정산을 막을 수 있었습니다. 사용하지 않은 V5 계약은 취소하고 V6로 대체했습니다. V6에서는 구매자가 정산 후 클레임하고, 풀은 직접 민팅으로 만들며 최소 금액은 모금액의 절반이고, 판매 종료 7일 후에는 누구나 정산할 수 있습니다.",
      "V6는 Robinhood Chain에 배포되었고 소스 코드가 탐색기에서 검증되었습니다. 독립 감사는 받지 않았고 판매는 열려 있지 않으며 판매 일정도 없습니다.",
      "투명성 페이지를 추가했습니다. 실시간 온체인 수치(공급량, 보유 분포, 판매 상태), 판매를 후원하는 Safe 3 중 2 멀티시그, GitHub 공개 소스 코드를 볼 수 있습니다.",
      "모든 자산 기록에 삽입 가능한 Onchain Record 배지를 추가했습니다.",
      "화이트리스트 신청은 10월 9일부터 10월 19일(UTC+8)까지로 예약되어 자동으로 열리며 이제 사람 확인을 사용합니다. 목록 등재는 토큰 배정이 아닙니다.",
      "V6에 맞춰 약관을 0.5 버전으로 갱신하고 오래된 배분 이미지를 올바른 상한으로 교체했습니다."] },
  };
  const start = t.indexOf("const releaseNotes");
  if (start < 0) throw new Error("releaseNotes not found");
  for (const key of ["en", '"zh-Hant"', '"zh-Hans"', "ko"]) {
    const marker = `  ${key}: [\n`;
    const at = t.indexOf(marker, start);
    if (at < 0) throw new Error(`array not found: ${key}`);
    const e = entries[key.replace(/"/g, "")];
    const obj = `    {\n      date: ${JSON.stringify(e.date)},\n      isoDate: "2026-10-06",\n      version: "2026.10.06-01",\n      title: ${JSON.stringify(e.title)},\n      summary: ${JSON.stringify(e.summary)},\n      changes: [\n${e.changes.map((c) => `        ${JSON.stringify(c)}`).join(",\n")}\n      ]\n    },\n`;
    t = t.slice(0, at + marker.length) + obj + t.slice(at + marker.length);
  }
  return t;
});

edit("app/rvyn/page.tsx", (t) => {
  const from = '{ key: "reg", label: { en: "WHITELIST", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" }, value: saleDesk?.registryOpen ? { en: "Registration open", "zh-Hant": "登記開放", "zh-Hans": "登记开放", ko: "신청 가능" } : { en: "Registration closed", "zh-Hant": "登記未開放", "zh-Hans": "登记未开放", ko: "신청 불가" } },';
  const to = `{ key: "reg", label: { en: "WHITELIST", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" }, value: saleDesk?.registryOpen ? { en: "Registration open", "zh-Hant": "登記開放", "zh-Hans": "登记开放", ko: "신청 가능" } : saleDesk?.registrationStatus === "scheduled" && saleDesk.registrationOpensAt ? (() => {
            // Fixed UTC+8 like the dates in the whitelist section, so every visitor reads the same day.
            const day = (l: string) => new Date(saleDesk.registrationOpensAt! * 1000).toLocaleDateString(l, { month: "short", day: "numeric", timeZone: "Etc/GMT-8" });
            return { en: \`Opens \${day("en")}\`, "zh-Hant": \`\${day("zh-Hant")} 開放\`, "zh-Hans": \`\${day("zh-Hans")} 开放\`, ko: \`\${day("ko")} 시작\` };
          })() : { en: "Registration closed", "zh-Hant": "登記未開放", "zh-Hans": "登记未开放", ko: "신청 불가" } },`;
  return must(t, from, to);
});
console.log("visitor fixes applied");
