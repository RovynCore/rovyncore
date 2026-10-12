"use client";

// Editor for the Lightdive observatory announcements (admin only). Saving is a signed admin action;
// the list replaces the stored one. Text is shown to players as written (Chinese, plus optional English).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePlatform } from "@/components/platform-context";
import { ANNOUNCEMENT_KINDS, MAX_ANNOUNCEMENTS, type Announcement } from "@/lib/lightdive-announcements";

const KIND_LABEL: Record<Announcement["kind"], string> = { news: "公告", event: "活動", update: "版本更新", maintenance: "維護" };
const blank = (): Announcement => ({ id: `a${Date.now().toString(36)}`, kind: "news", title: "", body: "", titleEn: "", bodyEn: "", link: "", pinned: false, startsAt: 0, endsAt: 0 });
const toLocal = (s: number) => (s ? new Date(s * 1000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0);

export function AnnouncementsAdmin() {
  const platform = usePlatform();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const data = await platform.admin<{ items: Announcement[] }>("lightdive-announcements-read", {});
      setItems(data.items);
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message.slice(0, 200));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    // Public read first (no signature) so the list shows right away; a signed read loads drafts too.
    fetch("/api/lightdive/announcements", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ items: Announcement[] }>)
      .then((d) => setItems((cur) => cur ?? d.items))
      .catch(() => setItems((cur) => cur ?? []));
  }, []);

  const save = async () => {
    if (!items) return;
    setBusy(true);
    try {
      const data = await platform.admin<{ items: Announcement[] }>("lightdive-announcements", { items });
      setItems(data.items);
      setDirty(false);
      toast.success("公告已儲存");
    } catch (e) {
      toast.error((e as Error).message.slice(0, 200));
    } finally {
      setBusy(false);
    }
  };
  const edit = (i: number, patch: Partial<Announcement>) => {
    setItems((list) => (list ?? []).map((a, k) => (k === i ? { ...a, ...patch } : a)));
    setDirty(true);
  };

  return (
    <section className="ld-sub ld-announce">
      <h3>觀測站公告與活動</h3>
      <p className="ld-dim">顯示在遊戲「觀測站」最上方。可設定開始與結束時間；釘選的排在最前面。儲存需要管理錢包簽名。</p>
      <div className="ld-actions">
        <button type="button" className="ld-btn ld-btn--ghost" disabled={busy} onClick={() => void load()}>重新讀取（含已排程）</button>
        <button type="button" className="ld-btn ld-btn--ghost" disabled={busy || (items?.length ?? 0) >= MAX_ANNOUNCEMENTS} onClick={() => { setItems((l) => [blank(), ...(l ?? [])]); setDirty(true); }}>新增一則</button>
        <button type="button" className="ld-btn" disabled={busy || !dirty} onClick={() => void save()}>{dirty ? "簽名並儲存" : "已儲存"}</button>
      </div>
      {items === null ? <p className="ld-dim">讀取中…</p> : items.length === 0 ? <p className="ld-dim">目前沒有公告。</p> : (
        <ol className="ld-announce__list">
          {items.map((a, i) => (
            <li key={a.id}>
              <div className="ld-announce__row">
                <select value={a.kind} onChange={(e) => edit(i, { kind: e.target.value as Announcement["kind"] })}>
                  {ANNOUNCEMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <label><input type="checkbox" checked={a.pinned} onChange={(e) => edit(i, { pinned: e.target.checked })} /> 釘選</label>
                <label>開始 <input type="datetime-local" value={toLocal(a.startsAt)} onChange={(e) => edit(i, { startsAt: fromLocal(e.target.value) })} /></label>
                <label>結束 <input type="datetime-local" value={toLocal(a.endsAt)} onChange={(e) => edit(i, { endsAt: fromLocal(e.target.value) })} /></label>
                <button type="button" className="ld-btn ld-btn--ghost" onClick={() => { setItems((l) => (l ?? []).filter((_, k) => k !== i)); setDirty(true); }}>刪除</button>
              </div>
              <input placeholder="標題（必填，80 字內）" value={a.title} maxLength={80} onChange={(e) => edit(i, { title: e.target.value })} />
              <textarea placeholder="內文（600 字內）" value={a.body} maxLength={600} rows={3} onChange={(e) => edit(i, { body: e.target.value })} />
              <details>
                <summary>英文版與連結（選填）</summary>
                <input placeholder="English title" value={a.titleEn} maxLength={80} onChange={(e) => edit(i, { titleEn: e.target.value })} />
                <textarea placeholder="English text" value={a.bodyEn} maxLength={600} rows={2} onChange={(e) => edit(i, { bodyEn: e.target.value })} />
                <input placeholder="https:// 連結" value={a.link} maxLength={300} onChange={(e) => edit(i, { link: e.target.value })} />
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
