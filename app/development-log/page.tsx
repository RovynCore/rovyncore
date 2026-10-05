"use client";

import { ReadingNav, MotionDisclosure } from "@/components/workflow-motion";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { XProfileFeed } from "@/components/x-profile-feed";
import { INITIAL_X_UPDATES, type XUpdate } from "@/lib/x-updates";
import type { Locale } from "@/lib/translations";
import { ArrowUpRight, CalendarDays, History, Radio, ExternalLink } from "lucide-react";

type ReleaseNote = {
  date: string;
  isoDate: string;
  version: string;
  title: string;
  summary: string;
  changes: string[];
};

const pageCopy: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  dateLabel: string;
  versionLabel: string;
  latest: string;
  versionRule: string;
  footer: string;
  records: string;
  launchpad: string;
  releaseCount: string;
  flashSection: string;
  flashTitle: string;
  flashIntro: string;
  flashStatus: string;
  flashFallback: string;
  flashUnavailable: string;
  flashNotice: string;
  flashPrivacyLink: string;
  flashProfile: string;
  logSection: string;
  logTitle: string;
  logIntro: string;
}> = {
  en: {
    eyebrow: "ROVYN CORE / LATEST INFORMATION",
    title: "Latest information.",
    intro: "Official updates from X, alongside a concise record of product releases and improvements.",
    dateLabel: "PUBLISHED",
    versionLabel: "WEB VERSION",
    latest: "LATEST UPDATE",
    versionRule: "One summary per date; its version is the final release number for that day.",
    footer: "Entries are added after a production release or a meaningful product update. Website changes and onchain contract changes are identified separately; a site release does not itself open a sale or send a transaction.",
    records: "Explore onchain records",
    launchpad: "Open launchpad",
    releaseCount: "releases",
    flashSection: "01 / FLASH UPDATES",
    flashTitle: "From our official X account.",
    flashIntro: "Collected public posts from @RovynCore. Read them here, or open the original post for images, video and replies.",
    flashStatus: "OFFICIAL X PROFILE",
    flashFallback: "View public posts by @RovynCORE on X.",
    flashUnavailable: "The latest collection could not be refreshed. You can still read the available posts or visit our X account.",
    flashNotice: "Official public posts are checked automatically about every five minutes. You can read the saved text without an X login; temporary sync delays do not remove existing posts.",
    flashPrivacyLink: "X privacy policy",
    flashProfile: "Open @RovynCORE on X",
    logSection: "02 / PRODUCT RELEASES",
    logTitle: "Development log",
    logIntro: "One concise entry per day, combining that day’s meaningful product and website updates.",
  },
  "zh-Hant": {
    eyebrow: "ROVYN CORE / 最新資訊",
    title: "最新資訊",
    intro: "集中查看 X 官方快訊，以及產品正式發布與功能調整紀錄。",
    dateLabel: "發布日期",
    versionLabel: "網站版本",
    latest: "最新更新",
    versionRule: "每天只列一則摘要；版本編號採用當日最後一次發布版本。",
    footer: "正式部署或重要功能調整後，會在這裡新增一則紀錄。網站更新與鏈上合約變更會分開標示；網站發布本身不會開啟預售或送出交易。",
    records: "查看鏈上紀錄",
    launchpad: "前往發射台",
    releaseCount: "則更新",
    flashSection: "01 / 快訊更新",
    flashTitle: "官方 X 最新貼文",
    flashIntro: "這裡收錄 @RovynCore 的公開貼文。可直接閱讀文字，或開啟原文查看圖片、影片與留言。",
    flashStatus: "官方 X 帳號",
    flashFallback: "前往 X 查看 @RovynCORE 的公開貼文。",
    flashUnavailable: "目前無法更新貼文列表。你仍可閱讀已載入的內容，或前往官方 X 帳號。",
    flashNotice: "系統約每五分鐘自動檢查官方公開貼文，不需登入 X 即可閱讀已同步的文字；同步暫時延遲時會保留既有貼文。",
    flashPrivacyLink: "X 隱私政策",
    flashProfile: "在 X 開啟 @RovynCORE",
    logSection: "02 / 產品更新",
    logTitle: "開發日誌",
    logIntro: "每天一則精簡紀錄，將當日重要的產品與網站調整合併整理。",
  },
  "zh-Hans": {
    eyebrow: "ROVYN CORE / 最新信息",
    title: "最新信息",
    intro: "集中查看 X 官方快讯，以及产品正式发布与功能调整记录。",
    dateLabel: "发布日期",
    versionLabel: "网站版本",
    latest: "最新更新",
    versionRule: "每天只列一条摘要；版本编号采用当天最后一次发布版本。",
    footer: "正式部署或重要功能调整后，会在这里新增一条记录。网站更新与链上合约变更会分开标示；网站发布本身不会开启预售或发送交易。",
    records: "查看链上记录",
    launchpad: "前往发行平台",
    releaseCount: "条更新",
    flashSection: "01 / 快讯更新",
    flashTitle: "官方 X 最新帖子",
    flashIntro: "这里收录 @RovynCore 的公开帖子。可直接阅读文字，或打开原文查看图片、视频与评论。",
    flashStatus: "官方 X 账号",
    flashFallback: "前往 X 查看 @RovynCORE 的公开帖子。",
    flashUnavailable: "目前无法更新帖子列表。你仍可阅读已加载的内容，或前往官方 X 账号。",
    flashNotice: "系统约每五分钟自动检查官方公开帖子，无需登录 X 即可阅读已同步的文字；同步暂时延迟时会保留现有帖子。",
    flashPrivacyLink: "X 隐私政策",
    flashProfile: "在 X 打开 @RovynCORE",
    logSection: "02 / 产品更新",
    logTitle: "开发日志",
    logIntro: "每天一条简明记录，合并整理当天重要的产品与网站调整。",
  },
  ko: {
    eyebrow: "ROVYN CORE / 최신 정보",
    title: "최신 정보",
    intro: "X 공식 소식과 제품 배포 및 주요 변경 기록을 한곳에서 확인하세요.",
    dateLabel: "게시일",
    versionLabel: "웹 버전",
    latest: "최신 업데이트",
    versionRule: "날짜별 요약은 하나만 표시하며, 해당 날짜의 마지막 배포 버전을 사용합니다.",
    footer: "정식 배포 또는 중요한 기능 변경 후 새 항목을 추가합니다. 웹사이트 변경과 온체인 계약 변경은 별도로 표시하며, 웹사이트 배포만으로 판매가 열리거나 거래가 전송되지는 않습니다.",
    records: "온체인 기록 보기",
    launchpad: "런치패드 열기",
    releaseCount: "개 업데이트",
    flashSection: "01 / 실시간 소식",
    flashTitle: "공식 X 계정의 새 게시물",
    flashIntro: "@RovynCore의 공개 게시물을 모았습니다. 본문은 여기서 읽고 이미지, 동영상, 댓글은 원문에서 확인하세요.",
    flashStatus: "공식 X 프로필",
    flashFallback: "X에서 @RovynCORE의 공개 게시물을 확인하세요.",
    flashUnavailable: "최신 목록을 새로고침할 수 없습니다. 표시된 게시물을 읽거나 공식 X 계정을 방문하세요.",
    flashNotice: "공식 공개 게시물을 약 5분마다 자동 확인합니다. X 로그인 없이 동기화된 본문을 읽을 수 있으며 일시적인 지연에도 기존 게시물은 유지됩니다.",
    flashPrivacyLink: "X 개인정보 처리방침",
    flashProfile: "X에서 @RovynCORE 열기",
    logSection: "02 / 제품 업데이트",
    logTitle: "개발 기록",
    logIntro: "하루에 한 개의 간결한 항목으로 그날의 주요 제품 및 웹사이트 변경을 정리합니다.",
  },
};

const releaseNotes: Record<Locale, ReleaseNote[]> = {
  // Keep one curated release entry per calendar day; combine same-day work in its change list.
  en: [
    {
      date: "Oct 4, 2026",
      isoDate: "2026-10-04",
      version: "2026.10.04-02",
      title: "A world in the making, with RVYN at its core",
      summary: "The website now leads with our first game, in development with RVYN at its core, and receives a site-wide finishing pass.",
      changes: [
        "Added a Game tab to the top navigation and a first-game page. It states only confirmed facts and our commitments; the game itself is not playable yet.",
        "Links to the site now show a proper preview card on X and other platforms. The crystal artwork loads about 18 times lighter, and a footer jump while asset records load is fixed.",
        "Terms now also state plainly that the RVYN sale contract has not been independently audited.",
        "The homepage opens with our first game and a new chapter section showing its status. Gameplay, release timing and RVYN's in-game uses are not announced yet.",
        "The roadmap now lists the first game. The first presale is shown as date to be announced; the earlier tentative date is withdrawn.",
        "Terms updated to version 0.4 to describe the deployed V5 sale contract accurately: onchain whitelist proof, delivery in the same transaction, and no refund or pause.",
        "Refined every page with precise frames, a light that follows the pointer, a reading-progress line, smoother header glass and a new footer.",
        "Daily operational backups now include whitelist applications. This update does not open registration or purchases, change contracts or send transactions."
      ]
    },
    {
      "date": "Oct 2, 2026",
      "isoDate": "2026-10-02",
      "version": "2026.10.02-03",
      "title": "Automatic X news and motion that explains the content",
      "summary": "Official X posts sync automatically; content-led motion now connects creation, records and reading across the website.",
      "changes": [
        "Added live token-draft previews and real launch progress; stable record search, a comparison highlight and an expandable event timeline; new-post notices, release details and reading markers; clear administrator operation feedback.",
        "Added a server scan every five minutes, automatic verification and saved post cards. The open news page refreshes its collection in the background.",
        "Added concurrency protection, retry backoff, last-sync status and preservation of the last successful collection during upstream delays. Hidden posts remain hidden.",
        "Images, video and replies remain available at the original post. This update does not alter contracts or open the sale.",
        "Added a linked four-node story constellation, a moving roadmap stage marker and a sequential record-fact timeline.",
        "Added an interactive whitelist process guide, smooth presale terms and restrained RVYN hero illumination.",
        "Kept the homepage video fixed, added keyboard and touch support, paused decorative loops offscreen and respected reduced-motion preferences. Pricing, contracts and sale access remain unchanged.",
        "Adjusted Chinese heading spacing and line height, Korean word wrapping and narrow-screen layouts; checked the four supported languages."
      ]
    },
    {
      "date": "Oct 1, 2026",
      "isoDate": "2026-10-01",
      "version": "2026.10.01-04",
      "title": "A more coherent experience across the website",
      "summary": "Refined the existing crystal and forest/lime identity across the homepage and every public workflow.",
      "changes": [
        "Official X posts now appear as readable website cards. Added wallet-authenticated URL import and removal in the admin workspace; images, video and replies remain available at the original post.",
        "Reviewed scrolling and navigation again: the marquee now stays with the header, section links account for its height, landscape menus scroll within the screen and legal text has a more comfortable line length.",
        "Kept the hero video steady, tightened the homepage, expanded the marquee copy and combined the roadmap. The first presale remains tentative for early November 2026.",
        "Simplified RVYN content and placed its contract in the first section. Improved forms, record readability, mobile navigation and wallet selection.",
        "Added reading navigation to asset records and legal terms, clearer release notes and a consistent footer. Website deployment does not open registration or purchases, change contracts or send transactions."
      ]
    },
    {
      date: "Sep 30, 2026",
      isoDate: "2026-09-30",
      version: "2026.09.30-01",
      title: "Focused visual update for RVYN and onchain records",
      summary: "Kept the familiar site layout while adding the selected allocation and record visuals.",
      changes: [
        "Added an interactive RVYN allocation orbit using the V5 contract's seven allocation caps, clearly distinguished from actual transfers.",
        "Added an orbit visual beside the Onchain Records heading and refreshed public action buttons with a restrained emerald outline.",
        "Restored the existing layouts and workflows elsewhere; this website release does not open registration or presale or change a contract.",
      ],
    },
    {
      date: "Sep 28, 2026",
      isoDate: "2026-09-28",
      version: "2026.09.28-05",
      title: "Homepage and public experience refined",
      summary: "Combined today's homepage and RVYN-page refinements with clearer public information and release checks.",
      changes: [
        "Refined the homepage crystal, headline and three actions; the whitelist action now reflects whether registration is open.",
        "Improved the X update fallback, four-language public copy and page titles, and added a clear-draft action to the launchpad.",
        "Recorded a full source inventory for safer, traceable website releases; no contract or sale state changed.",
        "Made RVYN registration and status lookup separate, visible steps; added direct links to the whitelist and presale sections, and standardized the RVYN page's English whitelist wording.",
        "Added a scroll-led creator journey, staggered onchain-record cards and subtle button motion; fixed RVYN button contrast on hover.",
      ],
    },
    {
      date: "Sep 27, 2026",
      isoDate: "2026-09-27",
      version: "2026.09.27-05",
      title: "Homepage, RVYN presale and product updates refined",
      summary: "A single daily release covering clearer product entry points, a guided presale workspace and more transparent public updates.",
      changes: [
        "Redesigned the homepage hero around a clear ROVYN CORE wordmark, moved the story ticker below navigation, refined the RVYN whitelist call-to-action with Robinhood Chain branding, and aligned the footer.",
        "Made the RVYN public sale status and planned terms clearer, and organized admin presale tasks into a safer step-by-step workflow. The sale remains closed unless its onchain requirements are met.",
        "Reworked Latest Information into official X updates plus a concise release history, with consistent four-language presentation.",
      ],
    },
    {
      date: "Sep 25, 2026",
      isoDate: "2026-09-25",
      version: "2026.09.25-01",
      title: "Allowlist operations and clearer wallet choices",
      summary: "The public RVYN experience and admin tools gained clearer allowlist stages and wallet guidance.",
      changes: [
        "Added controls for the registration window, reviewing addresses, and preparing an onchain allowlist root.",
        "Clarified that allowlist status means eligibility only—not an NFT, a live sale, or a token allocation.",
        "Expanded the wallet chooser beyond MetaMask to common wallet options.",
      ],
    },
    {
      date: "Sep 24, 2026",
      isoDate: "2026-09-24",
      version: "2026.09.24-01",
      title: "Onchain Record: origin, snapshot and current state",
      summary: "Token launches gained a consistent public record that separates original issuance details from later observations.",
      changes: [
        "Added searchable public records, token detail pages, immutable launch snapshots and observable state comparisons.",
        "Added record history and versioned public APIs, with clearer handling for unavailable or stale chain data.",
        "Kept compatibility routes pointed to the current record experience.",
      ],
    },
  ],
  "zh-Hant": [
    {
      date: "2026 年 10 月 4 日",
      isoDate: "2026-10-04",
      version: "2026.10.04-02",
      title: "一個世界，正在成形，以 RVYN 為核心",
      summary: "網站改以開發中的第一款遊戲為主軸，RVYN 是它的核心；全站同步完成一次細節精修。",
      changes: [
        "頂部導覽新增「遊戲」分頁與第一款遊戲頁面，只呈現已確認的事實與我們的承諾；遊戲目前尚不可遊玩。",
        "分享網站連結時，X 與其他平台現在會顯示完整的預覽卡片。晶體主視覺載入量縮小約 18 倍，並修正資產紀錄載入時頁尾跳動的問題。",
        "條款新增明確說明：RVYN 預售合約尚未經過獨立第三方審計。",
        "首頁以第一款遊戲開場，並新增章節區塊說明開發狀態；玩法、上線時間與 RVYN 的遊戲內用途尚未公布。",
        "路線圖加入第一款遊戲。首輪預售改為「日期待公告」，撤回先前的暫定日期。",
        "條款更新為 0.4 版，正確說明已部署的 V5 預售合約：鏈上白名單驗證、付款同筆交易交付，且沒有退款或暫停功能。",
        "全站加入精準框線、跟隨游標的光、閱讀進度線、更細緻的頁首玻璃效果與新版頁尾。",
        "每日營運備份已涵蓋白名單申請資料。本次更新不會開放登記或購買、不變更合約，也不送出任何交易。"
      ]
    },
    {
      "date": "2026 年 10 月 2 日",
      "isoDate": "2026-10-02",
      "version": "2026.10.02-03",
      "title": "自動 X 快訊與內容連動的視覺展示",
      "summary": "官方 X 貼文持續自動同步；全站加入配合內容、創作流程與閱讀的動態展示。",
      "changes": [
        "新增發射台即時草稿預覽與真實發行進度；鏈上紀錄搜尋保持版面穩定，資料差異提示與歷史時間軸；新貼文提示、可展開版本內容與閱讀標記，以及管理操作狀態回饋。",
        "伺服器每五分鐘自動掃描、核對並儲存官方貼文，開啟中的消息頁也會在背景更新列表。",
        "加入全域同步鎖定、失敗重試、上次同步狀態與成功內容保留；管理員隱藏的貼文不會被排程重新加入。",
        "圖片、影片與留言可透過原文查看。本次更新未變更合約或開啟預售。",
        "加入四節點故事星系、路線圖階段標記與依序呈現的發行資料軸。",
        "加入可點選的白名單流程說明、平順的預售條款展開，以及克制的 RVYN 首屏光暈。",
        "首頁影片維持固定，支援鍵盤及觸控；裝飾動態離開視窗時暫停，並尊重減少動態設定。未調整訂價、合約或銷售資格。",
        "依語系調整中文標題字距與行距、韓文詞組換行及窄版排版，檢查四種語系的閱讀體驗。"
      ]
    },
    {
      "date": "2026 年 10 月 1 日",
      "isoDate": "2026-10-01",
      "version": "2026.10.01-04",
      "title": "全站視覺與操作體驗整合優化",
      "summary": "沿用水晶與森林綠、萊姆色的品牌風格，讓首頁與各功能頁更加一致。",
      "changes": [
        "官方 X 貼文改為可直接閱讀的網站卡片，管理後台可經錢包簽署匯入貼文網址或移除收錄；圖片、影片與留言可透過原文連結查看。",
        "再次檢查捲動與導覽：跑馬燈與頂部列同步固定，區塊跳轉依固定列高度保留間距，橫向手機選單可在畫面內捲動，並收整條款段落的閱讀寬度。",
        "固定首頁影片、收整首屏留白、擴充跑馬燈文案並合併路線圖；首輪預售仍暫定 2026 年 11 月初。",
        "精簡 RVYN 區塊並將合約移至首屏，改善表單、紀錄字級、手機導覽與錢包選擇視窗。",
        "為資產紀錄與條款加入閱讀導覽，整理公告與頁尾。本次網站發布不會開啟登記或預售，也未變更合約或送出交易。"
      ]
    },
    {
      date: "2026 年 9 月 30 日",
      isoDate: "2026-09-30",
      version: "2026.09.30-01",
      title: "RVYN 與鏈上紀錄視覺精選更新",
      summary: "保留熟悉的網站版型，只加入選定的配置與鏈上紀錄視覺。",
      changes: [
        "加入可互動的 RVYN 配置環，顯示 V5 合約七項配置上限，並與實際轉帳狀態分開說明。",
        "在鏈上紀錄標題旁加入軌道視覺，公開頁面按鈕改為深色綠框樣式。",
        "其餘頁面回到原有版型與操作流程；本次網站更新沒有開放登記或預售，也沒有變更合約。",
      ],
    },
    {
      date: "2026 年 9 月 28 日",
      isoDate: "2026-09-28",
      version: "2026.09.28-05",
      title: "首頁與公開頁面體驗優化",
      summary: "整合今日首頁與 RVYN 頁面調整、公開資訊釐清與發佈檢查。",
      changes: [
        "調整首頁水晶、標題與三個按鈕；白名單按鈕依開放狀態顯示合適文案。",
        "改善 X 貼文載入失敗時的顯示、四語公開文案與頁面標題，並加入發射草稿清除功能。",
        "建立完整來源檔案清單供日後核對；本次未更動合約或開售狀態。",
        "RVYN 頁新增白名單登記與預售入口，將登記及資格查詢分成清楚的兩個步驟，並統一英文 Whitelist 用語。",
        "首頁新增隨捲動展開的創作引導、鏈上紀錄卡片進場與按鈕細節動效，並修正 RVYN 按鈕滑入時的文字對比。",
      ],
    },
    {
      date: "2026 年 9 月 27 日",
      isoDate: "2026-09-27",
      version: "2026.09.27-05",
      title: "首頁、RVYN 預售工作台與最新資訊整合更新",
      summary: "將當日多項改動合併為一則紀錄，涵蓋首頁入口、預售操作引導及公開更新頁。",
      changes: [
        "重新設計首頁品牌首屏，將敘事跑馬燈移至導覽列下方，精修 RVYN 白名單按鈕並使用 Robinhood Chain 圖示，也整理頁尾排列。",
        "讓 RVYN 預售狀態及規劃條件更清楚，並將管理台預售流程整理成循序操作；鏈上條件未齊備時仍維持關閉。",
        "「最新資訊」整合官方 X 快訊與精簡開發紀錄，並維持四語系呈現。",
      ],
    },
    {
      date: "2026 年 9 月 25 日",
      isoDate: "2026-09-25",
      version: "2026.09.25-01",
      title: "白名單管理與錢包選擇更新",
      summary: "RVYN 公開頁面與管理工具補上白名單階段說明及錢包指引。",
      changes: [
        "新增登記時段設定、地址審核，以及準備鏈上白名單根值的管理流程。",
        "明確說明白名單只代表購買資格，不是 NFT、正在販售或代幣配額。",
        "錢包選擇不再只有 MetaMask，並加入常見錢包選項。",
      ],
    },
    {
      date: "2026 年 9 月 24 日",
      isoDate: "2026-09-24",
      version: "2026.09.24-01",
      title: "Onchain Record：來源、快照與目前狀態",
      summary: "Token 發行新增一致的公開紀錄，將初始發行資訊與後續觀測分開呈現。",
      changes: [
        "新增可搜尋的公開目錄、Token 詳情、不可覆寫的發行快照與鏈上狀態比較。",
        "新增紀錄歷史與版本化公開 API，並改善鏈上資料過期或暫時無法取得時的呈現。",
        "舊版相容網址會導向新版紀錄頁。",
      ],
    },
  ],
  "zh-Hans": [
    {
      date: "2026 年 10 月 4 日",
      isoDate: "2026-10-04",
      version: "2026.10.04-02",
      title: "一个世界，正在成形，以 RVYN 为核心",
      summary: "网站改以开发中的第一款游戏为主轴，RVYN 是它的核心；全站同步完成一次细节精修。",
      changes: [
        "顶部导航新增“游戏”分页与第一款游戏页面，只呈现已确认的事实与我们的承诺；游戏目前尚不可游玩。",
        "分享网站链接时，X 与其他平台现在会显示完整的预览卡片。晶体主视觉加载量缩小约 18 倍，并修正资产记录加载时页脚跳动的问题。",
        "条款新增明确说明：RVYN 预售合约尚未经过独立第三方审计。",
        "首页以第一款游戏开场，并新增章节区块说明开发状态；玩法、上线时间与 RVYN 的游戏内用途尚未公布。",
        "路线图加入第一款游戏。首轮预售改为“日期待公告”，撤回先前的暂定日期。",
        "条款更新为 0.4 版，准确说明已部署的 V5 预售合约：链上白名单验证、付款同笔交易交付，且没有退款或暂停功能。",
        "全站加入精准框线、跟随光标的光、阅读进度线、更细致的页首玻璃效果与新版页脚。",
        "每日运营备份已涵盖白名单申请数据。本次更新不会开放登记或购买、不变更合约，也不发送任何交易。"
      ]
    },
    {
      "date": "2026 年 10 月 2 日",
      "isoDate": "2026-10-02",
      "version": "2026.10.02-03",
      "title": "自动 X 快讯与内容联动的视觉展示",
      "summary": "官方 X 帖子持续自动同步；全站加入配合内容、创作流程与阅读的动态展示。",
      "changes": [
        "新增发射台实时草稿预览与真实发行进度；链上记录搜索保持版面稳定，资料差异提示与历史时间轴；新帖子提示、可展开版本内容与阅读标记，以及管理操作状态反馈。",
        "服务器每五分钟自动扫描、核对并保存官方帖子，打开中的消息页也会在后台更新列表。",
        "加入全局同步锁定、失败重试、上次同步状态与成功内容保留；管理员隐藏的帖子不会被调度重新加入。",
        "图片、视频与评论可通过原文链接查看。本次更新未变更合约或开启预售。",
        "加入四节点故事星系、路线图阶段标记与依次呈现的发行资料轴。",
        "加入可点击的白名单流程说明、平顺的预售条款展开，以及克制的 RVYN 首屏光晕。",
        "首页视频保持固定，支持键盘及触控；装饰动态离开视窗时暂停，并尊重减少动态设置。未调整定价、合约或销售资格。",
        "按语言调整中文标题字距与行距、韩文词组换行及窄屏排版，检查四种语言的阅读体验。"
      ]
    },
    {
      "date": "2026 年 10 月 1 日",
      "isoDate": "2026-10-01",
      "version": "2026.10.01-04",
      "title": "全站视觉与操作体验整合优化",
      "summary": "沿用水晶与森林绿、青柠色的品牌风格，让首页与各功能页更加一致。",
      "changes": [
        "官方 X 帖子改为可直接阅读的网站卡片，管理后台可经钱包签名导入帖子网址或移除收录；图片、视频与评论可通过原文链接查看。",
        "再次检查滚动与导航：跑马灯与顶部栏同步固定，区块跳转按固定栏高度保留间距，横向手机菜单可在画面内滚动，并调整条款段落的阅读宽度。",
        "固定首页视频、收整首屏留白、扩充跑马灯文案并合并路线图；首轮预售仍暂定 2026 年 11 月初。",
        "精简 RVYN 区块并将合约移至首屏，改善表单、记录字号、手机导航与钱包选择窗口。",
        "为资产记录与条款加入阅读导航，整理公告与页尾。本次网站发布不会开放登记或预售，也未变更合约或发送交易。"
      ]
    },
    {
      date: "2026 年 9 月 30 日",
      isoDate: "2026-09-30",
      version: "2026.09.30-01",
      title: "RVYN 与链上记录视觉精选更新",
      summary: "保留熟悉的网站版型，只加入选定的配置与链上记录视觉。",
      changes: [
        "加入可交互的 RVYN 配置环，显示 V5 合约七项配置上限，并与实际转账状态分开说明。",
        "在链上记录标题旁加入轨道视觉，公开页面按钮改为深色绿框样式。",
        "其余页面恢复原有版型与操作流程；本次网站更新没有开放登记或预售，也没有变更合约。",
      ],
    },
    {
      date: "2026 年 9 月 28 日",
      isoDate: "2026-09-28",
      version: "2026.09.28-05",
      title: "首页与公开页面体验优化",
      summary: "合并今日首页与 RVYN 页面调整、公开信息澄清与发布检查。",
      changes: [
        "调整首页水晶、标题与三个按钮；白名单按钮依据开放状态显示合适文案。",
        "改进 X 帖子加载失败时的显示、四语公开文案与页面标题，并加入发行草稿清除功能。",
        "建立完整来源文件清单供日后核对；本次未更改合约或开售状态。",
        "RVYN 页面新增白名单登记与预售入口，将登记及资格查询分成清晰的两个步骤，并统一英文 Whitelist 用语。",
        "首页新增随滚动展开的创作引导、链上记录卡片入场与按钮细节动效，并修正 RVYN 按钮悬停时的文字对比。",
      ],
    },
    {
      date: "2026 年 9 月 27 日",
      isoDate: "2026-09-27",
      version: "2026.09.27-05",
      title: "首页、RVYN 预售工作台与最新信息整合更新",
      summary: "将当天多项改动合并为一条记录，涵盖首页入口、预售操作引导和公开更新页面。",
      changes: [
        "重新设计首页品牌首屏，将叙事跑马灯移至导航栏下方，优化 RVYN 白名单按钮并使用 Robinhood Chain 图示，也整理页尾排列。",
        "让 RVYN 预售状态及规划条件更清楚，并将管理台预售流程整理成循序操作；链上条件未齐备时仍保持关闭。",
        "“最新信息”整合官方 X 快讯与精简开发记录，并保持四种语言呈现。",
      ],
    },
    {
      date: "2026 年 9 月 25 日",
      isoDate: "2026-09-25",
      version: "2026.09.25-01",
      title: "白名单管理与钱包选择更新",
      summary: "RVYN 公开页面与管理工具补充白名单阶段说明及钱包指引。",
      changes: [
        "新增登记时段设置、地址审核，以及准备链上白名单根值的管理流程。",
        "明确说明白名单只代表购买资格，不是 NFT、正在销售或代币配额。",
        "钱包选择不再只有 MetaMask，并加入常见钱包选项。",
      ],
    },
    {
      date: "2026 年 9 月 24 日",
      isoDate: "2026-09-24",
      version: "2026.09.24-01",
      title: "Onchain Record：来源、快照与当前状态",
      summary: "Token 发行新增统一的公开记录，将初始发行信息与后续观察分开呈现。",
      changes: [
        "新增可搜索的公开目录、Token 详情、不可覆盖的发行快照与链上状态比较。",
        "新增记录历史与版本化公开 API，并改善链上数据过期或暂时无法取得时的呈现。",
        "旧版兼容网址会导向新版记录页。",
      ],
    },
  ],
  ko: [
    {
      date: "2026년 10월 4일",
      isoDate: "2026-10-04",
      version: "2026.10.04-02",
      title: "RVYN을 중심에 둔, 만들어지고 있는 세계",
      summary: "웹사이트가 RVYN을 중심에 둔 개발 중인 첫 게임을 앞세우고, 전체 페이지를 한층 정교하게 다듬었습니다.",
      changes: [
        "상단 내비게이션에 게임 탭과 첫 게임 페이지를 추가했습니다. 확정된 사실과 우리의 약속만 보여주며, 게임은 아직 플레이할 수 없습니다.",
        "사이트 링크를 공유하면 X 등에서 미리보기 카드가 표시됩니다. 크리스털 이미지 로드량이 약 18배 줄었고 자산 기록 로딩 중 푸터가 튀는 문제를 고쳤습니다.",
        "약관에 RVYN 판매 계약이 독립적인 제3자 감사를 받지 않았다는 점을 명확히 추가했습니다.",
        "홈페이지가 첫 게임으로 시작하며 개발 상태를 보여주는 새 섹션을 추가했습니다. 게임 방식, 출시 시점과 RVYN의 게임 내 용도는 아직 공개하지 않습니다.",
        "로드맵에 첫 게임을 추가했습니다. 첫 프리세일은 일정 추후 공지로 표시하며 이전의 잠정 일정은 철회합니다.",
        "약관을 0.4 버전으로 갱신해 배포된 V5 판매 계약을 정확히 설명합니다. 온체인 화이트리스트 증명, 결제와 같은 트랜잭션에서의 지급, 환불·일시 중지 기능 없음.",
        "모든 페이지에 정밀한 프레임, 포인터를 따라가는 빛, 읽기 진행선, 더 부드러운 헤더 글래스와 새 푸터를 적용했습니다.",
        "일일 운영 백업에 화이트리스트 신청 데이터를 포함했습니다. 이번 업데이트는 등록이나 구매를 열지 않고 계약을 변경하거나 트랜잭션을 보내지 않습니다."
      ]
    },
    {
      "date": "2026년 10월 2일",
      "isoDate": "2026-10-02",
      "version": "2026.10.02-03",
      "title": "자동 X 소식과 콘텐츠에 반응하는 시각 경험",
      "summary": "공식 X 게시물을 자동 동기화하며 사이트 전체에 콘텐츠, 발행 과정과 읽기에 반응하는 시각 효과를 추가했습니다.",
      "changes": [
        "실시간 토큰 초안 미리보기와 실제 발행 진행 상태, 안정적인 기록 검색과 변경 필드 표시 및 펼칠 수 있는 기록 타임라인, 새 게시물 알림과 릴리스 상세 및 읽기 위치 표시, 관리자 작업 피드백을 추가했습니다.",
        "서버가 5분마다 공식 게시물을 확인하고 저장하며 열린 소식 페이지도 백그라운드에서 목록을 업데이트합니다.",
        "동시 실행 보호, 실패 재시도, 마지막 동기화 상태 및 마지막 성공 목록 보존을 추가했습니다. 숨긴 게시물은 다시 추가되지 않습니다.",
        "이미지, 동영상, 댓글은 원문에서 확인합니다. 계약이나 판매 상태는 변경되지 않습니다.",
        "네 노드의 이야기 별자리, 로드맵 단계 표시와 순차적으로 나타나는 발행 기록 축을 추가했습니다.",
        "선택 가능한 화이트리스트 절차 안내, 부드러운 프리세일 조건 펼치기와 절제된 RVYN 첫 화면 조명을 추가했습니다.",
        "홈페이지 영상은 고정됩니다. 키보드와 터치를 지원하고 화면 밖 장식 효과는 일시 중지하며 동작 줄이기 설정을 따릅니다. 가격, 계약과 판매 자격은 변경하지 않았습니다.",
        "중문 제목의 자간과 줄 높이, 한국어 단어 단위 줄바꿈과 좁은 화면 배치를 조정하고 지원하는 네 언어의 읽기 경험을 확인했습니다."
      ]
    },
    {
      "date": "2026년 10월 1일",
      "isoDate": "2026-10-01",
      "version": "2026.10.01-04",
      "title": "웹사이트 전반의 시각과 사용 경험 개선",
      "summary": "기존 크리스털과 숲빛 녹색, 라임 브랜드를 유지하면서 각 페이지의 경험을 통일했습니다.",
      "changes": [
        "공식 X 게시물을 사이트 카드로 읽을 수 있습니다. 관리자 지갑 서명으로 URL을 가져오거나 목록에서 제거할 수 있으며 이미지, 동영상, 댓글은 원문에서 확인합니다.",
        "스크롤과 탐색을 다시 점검했습니다. 흐르는 문구를 상단 메뉴와 함께 고정하고, 구간 링크의 여백을 상단 높이에 맞췄으며, 가로 화면 메뉴를 스크롤 가능하게 하고 약관의 줄 길이를 다듬었습니다.",
        "첫 화면 영상을 고정하고 여백과 흐르는 문구를 다듬었으며 로드맵을 통합했습니다. 첫 프리세일은 2026년 11월 초로 잠정 계획합니다.",
        "RVYN 구성을 간결하게 정리하고 첫 화면에 계약 주소를 배치했습니다. 폼, 기록 가독성, 모바일 탐색과 지갑 선택 화면을 개선했습니다.",
        "자산 기록과 약관에 읽기 탐색을 추가하고 공지와 하단 영역을 정리했습니다. 이 웹사이트 배포는 등록이나 구매를 개시하거나 계약을 변경하거나 거래를 전송하지 않습니다."
      ]
    },
    {
      date: "2026년 9월 30일",
      isoDate: "2026-09-30",
      version: "2026.09.30-01",
      title: "RVYN 및 온체인 기록 시각 요소 업데이트",
      summary: "기존 사이트 구성은 유지하고 선택한 배분 및 기록 시각 요소만 추가했습니다.",
      changes: [
        "V5 계약의 7개 배분 한도를 표시하는 RVYN 대화형 궤도를 추가하고 실제 토큰 이전과 구분했습니다.",
        "온체인 기록 제목 옆에 궤도 시각 요소를 추가하고 공개 페이지 버튼을 짙은 에메랄드 테두리 스타일로 정리했습니다.",
        "그 밖의 레이아웃과 사용 흐름은 기존 상태로 유지했습니다. 이번 웹사이트 업데이트로 등록이나 프리세일이 열리거나 계약이 변경되지는 않습니다.",
      ],
    },
    {
      date: "2026년 9월 28일",
      isoDate: "2026-09-28",
      version: "2026.09.28-05",
      title: "홈페이지와 공개 페이지 사용성 개선",
      summary: "오늘의 홈페이지와 RVYN 페이지 개선, 공개 정보 정리 및 배포 점검을 하나로 묶었습니다.",
      changes: [
        "홈페이지 크리스털, 제목과 세 가지 버튼을 다듬고 화이트리스트 상태에 맞춰 버튼 문구를 표시합니다.",
        "X 게시물 표시 실패 안내, 네 가지 언어의 공개 문구와 페이지 제목을 개선하고 발행 초안 지우기 기능을 추가했습니다.",
        "향후 배포를 확인할 수 있도록 전체 소스 목록을 기록했습니다. 계약이나 판매 상태는 변경하지 않았습니다.",
        "RVYN 페이지에 화이트리스트 신청 및 프리세일 이동 버튼을 추가하고, 신청과 자격 확인을 두 단계로 분리했으며 영어 Whitelist 용어를 통일했습니다.",
        "스크롤에 따라 전개되는 제작 과정 안내, 온체인 기록 카드 등장 효과와 버튼의 미세한 움직임을 추가하고 RVYN 버튼의 호버 대비를 수정했습니다.",
      ],
    },
    {
      date: "2026년 9월 27일",
      isoDate: "2026-09-27",
      version: "2026.09.27-05",
      title: "홈페이지, RVYN 프리세일 작업 공간 및 최신 정보 업데이트",
      summary: "그날의 여러 변경을 하나로 묶어 홈페이지 주요 메뉴, 프리세일 안내와 공개 업데이트를 정리했습니다.",
      changes: [
        "홈페이지를 ROVYN CORE 워드마크 중심으로 다시 디자인하고 스토리 티커를 내비게이션 아래로 옮겼으며, Robinhood Chain 아이콘을 적용한 RVYN 화이트리스트 버튼과 푸터 배치를 다듬었습니다.",
        "RVYN 프리세일 상태와 계획을 명확히 하고 관리자 작업 순서를 안내했습니다. 온체인 조건을 충족하기 전까지 판매는 닫혀 있습니다.",
        "최신 정보 페이지에 공식 X 소식과 간결한 제품 업데이트 기록을 통합하고 4개 언어를 유지했습니다.",
      ],
    },
    {
      date: "2026년 9월 25일",
      isoDate: "2026-09-25",
      version: "2026.09.25-01",
      title: "허용 목록 운영과 지갑 선택 개선",
      summary: "RVYN 공개 페이지와 관리자 도구에 허용 목록 단계 및 지갑 안내를 추가했습니다.",
      changes: [
        "신청 기간 설정, 주소 검토, 온체인 허용 목록 루트 준비 절차를 추가했습니다.",
        "목록 등록은 구매 자격일 뿐 NFT, 진행 중인 판매 또는 토큰 배정이 아님을 명확히 했습니다.",
        "MetaMask 외에 자주 사용하는 지갑 선택지를 추가했습니다.",
      ],
    },
    {
      date: "2026년 9월 24일",
      isoDate: "2026-09-24",
      version: "2026.09.24-01",
      title: "Onchain Record: 출처, 스냅샷 및 현재 상태",
      summary: "토큰 발행의 최초 정보와 이후 관측을 분리해 보여주는 공개 기록을 도입했습니다.",
      changes: [
        "검색 가능한 공개 목록, 토큰 상세, 변경할 수 없는 발행 스냅샷과 온체인 상태 비교를 추가했습니다.",
        "기록 이력 및 버전이 지정된 공개 API를 추가하고 오래되거나 일시적으로 확인할 수 없는 체인 데이터를 더 명확하게 표시합니다.",
        "이전 호환 경로는 새 기록 페이지로 연결됩니다.",
      ],
    },
  ],
};

export default function DevelopmentLogPage({ initialPosts = INITIAL_X_UPDATES, initialReadFailed = false }: { initialPosts?: XUpdate[]; initialReadFailed?: boolean }) {
  const { locale } = useLanguage();
  const text = pageCopy[locale];
  const notes = releaseNotes[locale];

  return (
    <main className="workspace development-log latest-info">
      <header className="development-log__header">
        <span className="eyebrow">{text.eyebrow}</span>
        <div className="development-log__headline">
          <div>
            <h1>{text.title}</h1>
            <p>{text.intro}</p>
          </div>
          <div className="development-log__edition" aria-label={`${notes.length} ${text.releaseCount}`}>
            <History size={17} aria-hidden="true" />
            <span>{String(notes.length).padStart(2, "0")}</span>
            <small>{locale === "en" ? "UPDATES" : text.releaseCount.toLocaleUpperCase(locale)}</small>
          </div>
        </div>
      </header>

      <div className="latest-info__sections">
        <ReadingNav className="latest-info__jump-links" label={text.title}>
          <a href="#latest-info-flash-title">{text.flashSection}</a>
          <a href="#latest-info-log-title">{text.logSection}</a>
        </ReadingNav>
        <section className="latest-info__section latest-info__flash" aria-labelledby="latest-info-flash-title">
          <div className="latest-info__section-heading">
            <div>
              <span className="eyebrow">{text.flashSection}</span>
              <h2 id="latest-info-flash-title">{text.flashTitle}</h2>
              <p>{text.flashIntro}</p>
            </div>
            <a className="latest-info__profile-link" href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">
              <ExternalLink size={15} aria-hidden="true" />{text.flashProfile}
            </a>
          </div>
          <div className="latest-info__flash-card">
            <div className="latest-info__flash-card-heading">
              <span className="latest-info__x-mark" aria-hidden="true">𝕏</span>
              <span className="latest-info__account"><strong>ROVYN CORE</strong><small>@RovynCORE</small></span>
              <span className="latest-info__live"><Radio size={13} aria-hidden="true" />{text.flashStatus}</span>
            </div>
            <XProfileFeed initialPosts={initialPosts} initialReadFailed={initialReadFailed} fallback={text.flashFallback} unavailable={text.flashUnavailable} notice={text.flashNotice} />
          </div>
        </section>

        <section className="latest-info__section latest-info__releases" aria-labelledby="latest-info-log-title">
          <div className="latest-info__section-heading">
            <div>
              <span className="eyebrow">{text.logSection}</span>
              <h2 id="latest-info-log-title">{text.logTitle}</h2>
              <p>{text.logIntro}</p>
            </div>
            <p className="development-log__version-rule">{text.versionRule}</p>
          </div>
          <div className="development-log__feed release-timeline" aria-label={text.logTitle}>
            {notes.map((release, index) => (
              <article
                className={`panel development-log__release${index === 0 ? " is-latest" : ""}`}
                key={release.version}
                aria-labelledby={`release-${release.version}`}
              >
                <div className="development-log__release-meta">
                  <span className="development-log__meta-label"><CalendarDays size={13} aria-hidden="true" />{text.dateLabel}</span>
                  <time dateTime={release.isoDate}>{release.date}</time>
                  <span className="development-log__meta-label">{text.versionLabel}</span>
                  <code>{release.version}</code>
                </div>
                <div className="development-log__release-content">
                  {index === 0 ? <span className="development-log__latest">{text.latest}</span> : null}
                  <h3 id={`release-${release.version}`}>{release.title}</h3>
                  <p>{release.summary}</p>
                  <MotionDisclosure defaultOpen={index === 0} title={{ en: "What changed", "zh-Hant": "查看更新內容", "zh-Hans": "查看更新内容", ko: "변경 내용 보기" }[locale]}>
                    <ol>{release.changes.map((change) => <li key={change}>{change}</li>)}</ol>
                  </MotionDisclosure>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="development-log__footer">
        <p>{text.footer}</p>
        <div className="development-log__links">
          <Link className="secondary" href="/onchain-record">{text.records}<ArrowUpRight size={16} /></Link>
          <Link className="secondary" href="/launchpad">{text.launchpad}<ArrowUpRight size={16} /></Link>
        </div>
      </footer>
    </main>
  );
}
