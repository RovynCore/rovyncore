import type { Locale } from "./translations";

type Page = "home" | "game" | "transparency" | "rvyn" | "launchpad" | "records" | "asset" | "latest" | "legal" | "admin";

const titles: Record<Locale, Record<Page, string>> = {
  en: { home: "A World in the Making", transparency: "Transparency", game: "First Game", rvyn: "RVYN Whitelist & Token", launchpad: "Launchpad", records: "Onchain Records", asset: "Asset Record", latest: "Latest Information", legal: "Terms, Privacy & Risks", admin: "Admin Workspace" },
  "zh-Hant": { home: "一個正在成形的世界", transparency: "公開透明", game: "第一款遊戲", rvyn: "RVYN 白名單與代幣資訊", launchpad: "Token 發射台", records: "鏈上紀錄", asset: "資產紀錄", latest: "最新資訊", legal: "使用條款、隱私與風險", admin: "管理平台" },
  "zh-Hans": { home: "一个正在成形的世界", transparency: "公开透明", game: "第一款游戏", rvyn: "RVYN 白名单与代币信息", launchpad: "Token 发行平台", records: "链上记录", asset: "资产记录", latest: "最新信息", legal: "使用条款、隐私与风险", admin: "管理平台" },
  ko: { home: "만들어지고 있는 세계", transparency: "투명성", game: "첫 게임", rvyn: "RVYN 화이트리스트 및 토큰", launchpad: "토큰 런치패드", records: "온체인 기록", asset: "자산 기록", latest: "최신 정보", legal: "이용약관, 개인정보 및 위험", admin: "관리 플랫폼" },
};

export function pageTitle(locale: Locale, pathname: string) {
  const page: Page = pathname === "/game" ? "game"
    : pathname === "/transparency" ? "transparency"
    : pathname === "/rvyn" ? "rvyn"
    : pathname === "/launchpad" || pathname === "/launch" ? "launchpad"
    : pathname === "/onchain-record" || pathname === "/explore" || pathname === "/verify" ? "records"
    : pathname.startsWith("/assets/") || pathname.startsWith("/token/") ? "asset"
    : pathname === "/latest-info" || pathname === "/development-log" ? "latest"
    : pathname === "/legal" ? "legal"
    : pathname === "/admin" ? "admin"
    : "home";
  return `${titles[locale][page]} | ROVYN CORE`;
}
