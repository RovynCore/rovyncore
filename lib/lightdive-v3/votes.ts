// 世界觀投票 (G5, 10-23): once a month, observers choose where the story goes next. One vote per wallet per month
// (it can be changed until the month ends), kept in the table lightdive_vote (migration 0005). The result decides only
// what the next chapters, Rovyn's lines and the voyage stories are about: never a rule, an odd or a reward.
// Shared by the game and the API. Months are UTC, "YYYY-MM".
import { localized } from "./i18n";

export type VoteOption = { title: string; text: string };
export type Vote = { month: string; question: string; lead: string; options: VoteOption[] };

export const VOTES: Vote[] = localized([
  {
    month: "2026-10",
    question: "Rovyn 該先調查哪一個傳聞？",
    lead: "觀測站最近收到三個說不清楚的回報。票數最多的那一個，會寫成下一段故事。",
    options: [
      { title: "潮信燈塔的新節奏", text: "燈塔閃出了從來沒用過的節奏：短、短、長、長、短。它在回應誰？" },
      { title: "斷銘丘會亮的刻痕", text: "有些刻痕碰到探索者的光紋就會亮起來。碑上寫的，會不會是名字？" },
      { title: "無返隙回頭看的光", text: "最老的紀錄說，那裡的光會回頭看你。最近，它好像開始笑了。" },
    ],
  },
  {
    month: "2026-11",
    question: "碑原上要立起哪一座紀念碑？",
    lead: "觀測站想在碑原上立一座新的碑。立哪一座，由觀測者們決定；碑文會出現在之後的故事裡。",
    options: [
      { title: "第一位探索者", text: "迴聲灘上那聲還在等人回應的呼喊，屬於最早出發的那個人。" },
      { title: "每一支首航的隊伍", text: "每天第一個抵達目的地的隊伍，名字都刻在同一塊碑上。" },
      { title: "走散的光橋", text: "那些沒能接回來的光橋，也曾經照亮過一段路。" },
    ],
  },
  {
    month: "2026-12",
    question: "年底，觀測站要掛上什麼？",
    lead: "一年的最後一個月，觀測站要掛一樣東西迎接新的一年。它會出現在觀測站的畫面和 Rovyn 的話裡。",
    options: [
      { title: "燈籠礁的燈籠", text: "那盞睡過頭、後來亮得最久的燈。" },
      { title: "碎鏡原的一片鏡子", text: "照得出「已經回家的自己」的那一片。" },
      { title: "會唱歌的星砂", text: "星砂迴廊撿回來的那一顆，唱一首很短的歌。" },
    ],
  },
] as Vote[]);

export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
export const voteOf = (month: string) => VOTES.find((v) => v.month === month) ?? null;
/** The vote that closed before `month` (its result is what the story follows now). */
export const previousVote = (month: string) => [...VOTES].reverse().find((v) => v.month < month) ?? null;
/** When the month's vote closes (the start of the next UTC month), ms. */
export function closesAt(month: string) {
  const [y, m] = month.split("-").map(Number);
  return Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
}
