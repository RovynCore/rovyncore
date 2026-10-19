// 潛光頻道 (10-19): the server-wide Lightdive chat. One channel for every language. Anyone can read; to speak an
// observer signs in with their wallet (the site's existing sign-in, no gas) and holds at least one Lightdive card.
// Messages are short, plain text, never links; the founder's admin wallet can hide a message or mute a wallet.
export const CHAT_MAX = 200; // characters per message
export const CHAT_GAP_SECONDS = 10; // one message per wallet every 10 seconds
export const CHAT_DAILY = 200; // messages per wallet per day
export const CHAT_KEEP_DAYS = 30; // older messages are deleted
export const CHAT_PAGE = 60; // messages a read returns (newest last)

export type ChatMessage = { id: number; account: string; body: string; at: number };

// links (scams love them) and anything asking for wallet secrets are refused outright
const LINK = /(https?:\/\/|www\.|\bt\.me\b|discord\.gg|\b[a-z0-9-]{2,}\.(com|net|org|io|xyz|me|gg|app|link|ly|co|top|vip|site|online|finance|money)\b)/i;
const SECRET = /(私鑰|私钥|助記詞|助记词|seed\s*phrase|private\s*key|mnemonic|recovery\s*phrase|개인\s*키|시드\s*구문)/i;
// a short list of slurs and insults in the four languages; matches are refused (the admin handles the rest)
const BLOCKED = /(幹你娘|干你娘|操你媽|操你妈|肏|屌你|婊子|雜種|杂种|fuck|cunt|nigg|faggot|retard|씨발|시발|병신|좆)/i;

/** The cleaned message, or the reason it is refused (a key of the game's dictionary). */
export function checkChat(raw: unknown): { body: string } | { error: string } {
  if (typeof raw !== "string") return { error: "訊息格式不正確" };
  const body = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  if (!body) return { error: "訊息是空的" };
  if ([...body].length > CHAT_MAX) return { error: "訊息太長了" };
  if (LINK.test(body)) return { error: "頻道裡不能貼連結" };
  if (SECRET.test(body)) return { error: "為了安全，頻道裡不能提到私鑰或助記詞" };
  if (BLOCKED.test(body)) return { error: "訊息含有不允許的字詞" };
  return { body };
}
