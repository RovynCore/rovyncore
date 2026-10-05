import { z } from "zod";
export const safeUrl = z
  .string()
  .max(250)
  .refine(
    (s) =>
      !s ||
      (/^https:\/\//i.test(s) &&
        (() => {
          try {
            const u = new URL(s);
            return !u.username && !u.password;
          } catch {
            return false;
          }
        })()),
    "請使用有效的 HTTPS 網址",
  );
export const tokenSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "請輸入名稱")
      .max(40)
      .refine(
        (s) => new TextEncoder().encode(s).length <= 64,
        "名稱 UTF-8 長度不可超過 64 bytes",
      ),
    symbol: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z][A-Za-z0-9]{0,11}$/,
        "代號須為 1–12 個英數字並以字母開頭",
      ),
    supply: z
      .string()
      .regex(/^[1-9][0-9]{0,12}$/, "請輸入整數供應量")
      .refine(
        (s) => /^[1-9][0-9]{0,12}$/.test(s) && BigInt(s) <= 1_000_000_000_000n,
        "供應上限為 1 兆",
      ),
    description: z.string().trim().min(10, "請至少輸入 10 個字元").max(2000),
    website: safeUrl,
    x: safeUrl,
    telegram: safeUrl,
    /** Optional creator-provided link to the token's liquidity pool or trading page. */
    liquidityUrl: safeUrl.optional().default(""),
    logo: z
      .string()
      .max(120)
      .regex(/^(\/api\/media\/[a-f0-9-]+\.(png|jpg|webp))?$/),
  })
  .strict();
export type TokenDraft = z.infer<typeof tokenSchema>;
export const EMPTY_DRAFT: TokenDraft = {
  name: "",
  symbol: "",
  supply: "",
  description: "",
  website: "",
  x: "",
  telegram: "",
  liquidityUrl: "",
  logo: "",
};
export function trendingScore(views: number, created: number, now: number) {
  return views / (1 + Math.max(0, now - created) / 86400);
}
