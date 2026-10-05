"use client";
import { useEffect, useRef, useState } from "react";
import { reconcileXFeed } from "@/lib/x-feed-view";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useLanguage } from "./language-provider";
import type { PublicXSync } from "@/lib/x-auto-sync";
import type { XUpdate } from "@/lib/x-updates";

const labels = {
  en: { read: "Read original post", empty: "New official posts will appear here once collected.", retry: "Refresh posts", synced: "Last synced", pending: "Checking official posts…", delayed: "Sync delayed; saved posts remain available." },
  "zh-Hant": { read: "查看原文", empty: "新的官方貼文收錄後將顯示於此。", retry: "重新整理貼文", synced: "上次同步", pending: "正在檢查官方貼文…", delayed: "同步暫時延遲，已儲存的貼文仍可閱讀。" },
  "zh-Hans": { read: "查看原文", empty: "新的官方帖子收录后将显示于此。", retry: "刷新帖子", synced: "上次同步", pending: "正在检查官方帖子…", delayed: "同步暂时延迟，已保存的帖子仍可阅读。" },
  ko: { read: "원문 보기", empty: "수집된 새 공식 게시물이 여기에 표시됩니다.", retry: "게시물 새로고침", synced: "마지막 동기화", pending: "공식 게시물 확인 중…", delayed: "동기화가 지연되지만 저장된 게시물은 읽을 수 있습니다." },
};
type Props = { initialPosts: XUpdate[]; initialReadFailed: boolean; fallback: string; unavailable: string; notice: string };
export function XProfileFeed({ initialPosts, initialReadFailed, fallback, unavailable, notice }: Props) {
  const { locale } = useLanguage();
  const copy = labels[locale];
  const [posts, setPosts] = useState(initialPosts);
  const [sync, setSync] = useState<PublicXSync | null>(null);
  const [failed, setFailed] = useState(initialReadFailed);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<XUpdate[]>([]);
  const visiblePosts = useRef(initialPosts);
  const latestPosts = useRef(initialPosts);
  const arrivalLabel = { en: "Show new posts", "zh-Hant": "查看新貼文", "zh-Hans": "查看新帖子", ko: "새 게시물 보기" }[locale];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => { if (active) setBusy(true); });
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch("/api/x-updates", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unavailable"); return response.json() as Promise<{ posts: XUpdate[]; sync: PublicXSync }>; })
      .then(data => {
        if (!Array.isArray(data.posts)) throw new Error("Invalid collection");
        if (active) {
          latestPosts.current = data.posts;
          const next = reconcileXFeed(visiblePosts.current, data.posts);
          visiblePosts.current = next.visible;
          setPosts(next.visible); setIncoming(next.incoming); setSync(data.sync); setFailed(false);
        }
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setBusy(false); window.clearTimeout(timeout); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div className="latest-info__x-feed">
    {sync?.enabled && <p className="x-sync-status" role="status">{busy && <RefreshCw size={12} className="spin" aria-hidden="true" />}{sync.delayed ? copy.delayed : sync.lastSuccessAt ? copy.synced + ": " + new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(sync.lastSuccessAt * 1000)) : copy.pending}</p>}
    {incoming.length > 0 && <div className="x-new-posts" role="status"><button type="button" className="secondary" onClick={() => {
      visiblePosts.current = latestPosts.current;
      setPosts(latestPosts.current); setIncoming([]);
    }}><RefreshCw size={15} aria-hidden="true" />{arrivalLabel} · {incoming.length}</button></div>}
    {failed && <div className="latest-info__x-fallback" role="status">
      <p>{unavailable}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} aria-hidden="true" />{copy.retry}</button>
      <a href="https://x.com/RovynCore" target="_blank" rel="noopener noreferrer">{fallback}<ArrowUpRight size={14} aria-hidden="true" /></a>
    </div>}
    <div className="x-posts">
      {posts.length ? posts.map(post => <article className="x-post" key={post.id}>
        <header className="x-post__header"><div><strong>{post.authorName}</strong><span>@RovynCore</span></div><time dateTime={post.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(post.publishedAt))}</time></header>
        <p className="x-post__text">{post.text}</p>
        <a className="secondary x-post__link" href={post.url} target="_blank" rel="noopener noreferrer">{copy.read}<ArrowUpRight size={17} aria-hidden="true" /></a>
      </article>) : <p className="x-posts__empty">{copy.empty}</p>}
    </div>
    <p className="latest-info__x-notice">{notice}</p>
  </div>;
}
