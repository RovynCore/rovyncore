// 潛光頻道 (10-19): the Lightdive chat. Five channels — one global, and one for each of the game's four languages.
// Anyone can read; to speak an observer signs in with their wallet (the site's existing sign-in, no gas) and holds at
// least one Lightdive card. Messages are short plain text. The filter below refuses what scams need (links, contact
// handles, wallet secrets, "free airdrop / guaranteed profit" bait, people posing as staff) and a short list of slurs;
// the rest is left to players' reports and the founder's admin wallet (hide, mute). Only the admin wallet's messages
// carry the 官方 (official) mark.
export const CHAT_CHANNELS = ["global", "zh-Hant", "zh-Hans", "en", "ko"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
export const isChannel = (c: unknown): c is ChatChannel => typeof c === "string" && (CHAT_CHANNELS as readonly string[]).includes(c);

export const CHAT_MAX = 200; // characters per message
export const CHAT_GAP_SECONDS = 10; // one message per wallet every 10 seconds, across all channels
export const CHAT_DAILY = 200; // messages per wallet per day
export const CHAT_KEEP_DAYS = 30; // older messages are deleted
export const CHAT_PAGE = 60; // messages a read returns (newest last)
export const CHAT_REPORTS_HIDE = 3; // reports from different wallets that hide a message until the admin looks

export type ChatMessage = { id: number; account: string; body: string; at: number; official?: boolean };

// links and anything that points people somewhere else: scams need a place to send their victims
const LINK = /(https?:\/\/|www\.|\bt\.me\b|discord\.gg|bit\.ly|\b[a-z0-9-]{2,}\s?\.\s?(com|net|org|io|xyz|me|gg|app|link|ly|co|top|vip|site|online|finance|money|cc|tk|pro|info|club|live)\b)/i;
// contact handles and "message me privately": the usual first step of a scam
const CONTACT = /(telegram|whats\s*app|wechat|微信|\bline\s*(id|:)|加\s*line|加賴|加我|私訊我|私讯我|私聊|密我|\bdm\s*me\b|\bpm\s*me\b|inbox\s*me|텔레그램|카톡|오픈채팅|디엠)/i;
// wallet secrets: nobody legitimate ever asks for them
const SECRET = /(私鑰|私钥|助記詞|助记词|註記詞|seed\s*phrase|private\s*key|secret\s*phrase|mnemonic|recovery\s*phrase|개인\s*키|시드\s*구문|복구\s*구문|니모닉)/i;
// bait: free tokens, guaranteed returns, managed trading, "send me and get double back"
const BAIT = /(空投|airdrop|保證獲利|保证获利|穩賺|稳赚|guaranteed\s*(profit|return|income)|代操|帶單|带单|double\s*your|giveaway|claim\s*(now|your|reward)|免費領|免费领|에어드랍|수익\s*보장|무료\s*지급)/i;
// posing as the team
const STAFF = /(官方客服|客服人員|客服人员|管理員通知|管理员通知|官方通知|admin\s*here|official\s*support|support\s*team|i\s*am\s*(the\s*)?(admin|dev|developer|team)|공식\s*고객센터|운영자\s*공지)/i;
// a short list of slurs and insults in the four languages
const SLUR = /(幹你娘|干你娘|操你媽|操你妈|肏你|屌你老|婊子|雜種|杂种|fuck|cunt|nigg|faggot|retard|씨발|시발|병신|좆)/i;

/** The cleaned message, or the reason it is refused (a key of the game's dictionary). The admin wallet may post
 *  links and staff notices. */
export function checkChat(raw: unknown, official = false): { body: string } | { error: string } {
  if (typeof raw !== "string") return { error: "訊息格式不正確" };
  const body = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "").replace(/\s+/g, " ").trim();
  if (!body) return { error: "訊息是空的" };
  if ([...body].length > CHAT_MAX) return { error: "訊息太長了" };
  if (SECRET.test(body)) return { error: "為了安全，頻道裡不能提到私鑰或助記詞" };
  if (SLUR.test(body)) return { error: "訊息含有不允許的字詞" };
  if (official) return { body };
  if (LINK.test(body)) return { error: "頻道裡不能貼連結" };
  if (CONTACT.test(body)) return { error: "頻道裡不能留聯絡方式或要別人私訊" };
  if (BAIT.test(body)) return { error: "這則訊息很像常見的詐騙說法，沒有送出" };
  if (STAFF.test(body)) return { error: "只有官方錢包能發布官方訊息" };
  return { body };
}
