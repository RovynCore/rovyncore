"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useState } from "react";
import { encodeFunctionData, parseEther } from "viem";
import Image from "next/image";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePlatform } from "./platform-context";
import { api, message } from "./platform-provider";
import artifacts from "@/packages/web3/artifacts.json";
export function BoostButton({
  address,
  name,
  onSuccess,
}: {
  address: string;
  name: string;
  onSuccess?: () => void;
}) {
  const { tr } = useLanguage();

  const { config, transact } = usePlatform();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("0");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<`0x${string}` | null>(null);
  const storageKey = `genesis:boost:${config.chainId}:${address}`;
  useEffect(() => {
    let cancelled = false;
    try {
      const stored = sessionStorage.getItem(storageKey) as `0x${string}` | null;
      queueMicrotask(() => { if (!cancelled) setPending(stored); });
    } catch {}
    return () => { cancelled = true; };
  }, [storageKey]);
  async function buy() {
    setBusy(true);
    try {
      if (pending) {
        await api<unknown>("sync", { tx: pending });
        setPending(null);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        toast.success(tr("Boost 已同步"));
        setOpen(false);
        onSuccess?.();
        return;
      }
      if (!config.platform) throw new Error(tr("平台合約尚未部署"));
      const p = config.plans.find((p) => p.id === Number(plan));
      if (!p || !p.enabled) throw new Error(tr("方案已停用"));
      const tx = await transact({
        title: `Boost ${name}`,
        to: config.platform,
        data: encodeFunctionData({
          abi: artifacts.GenesisPlatform.abi,
          functionName: "boost",
          args: [address, Number(plan)],
        }),
        value: parseEther(p.price),
        onSubmitted: (hash) => {
          setPending(hash);
          try {
            sessionStorage.setItem(storageKey, hash);
          } catch {}
        },
        details: [
          [tr("方案"), tr("{0} · {1} 點", { 0: p.name, 1: p.units })],
          [tr("有效期"), tr("{0} 小時", { 0: p.duration / 3600 })],
          [tr("推廣 Token"), address],
        ],
      });
      await api<unknown>("sync", { tx });
      setPending(null);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      toast.success(tr("Boost 已生效"));
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="boost-button" onClick={() => setOpen(true)}>
        <Zap size={15} />
        {tr("Boost")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>
            {tr("讓")}
            {name}
            {tr("被看見")}
          </DialogTitle>
          <DialogDescription>
            {tr("付費推廣將顯示於 Boosted；不影響 Trending 自然排名。")}
          </DialogDescription>
          <RadioGroup value={plan} onValueChange={setPlan} className="plans">
            {config.plans.map((p) => (
              <label
                className={`plan ${plan === String(p.id) ? "chosen" : ""}`}
                key={p.id}
              >
                <RadioGroupItem value={String(p.id)} disabled={!p.enabled} />
                <div>
                  <strong>{p.name}</strong>
                  <p>
                    {p.units}
                    {tr("點 ·")}
                    {p.duration / 3600}
                    {tr("小時")}
                  </p>
                </div>
                <b>{p.price} ETH</b>
              </label>
            ))}
          </RadioGroup>
          <p className="muted">
            {tr(
              "任何錢包都可以替此項目購買曝光。費用記入 Treasury 合約餘額；Boost 不能保證瀏覽或交易。",
            )}
          </p>
          {pending && (
            <p className="muted">
              {tr("交易已送出，請先同步，不需再次付款。")}
              <a
                href={`${config.chainId === 46630 ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com"}/tx/${pending}`}
                target="_blank"
                rel="noreferrer"
              >
                {tr("查看交易")}
              </a>
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void buy()}
          >
            {busy
              ? tr("處理中…")
              : pending
                ? tr("同步已付款交易")
                : tr("繼續付款")}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function TokenAvatar({ name, logo }: { name: string; logo?: string }) {
  const [failedLogo, setFailedLogo] = useState("");
  return (
    <div className="token-avatar">
      {logo && failedLogo !== logo ? (
        <Image src={logo} alt={`${name} logo`} width={64} height={64} unoptimized onError={() => setFailedLogo(logo)} />
      ) : (
        (name[0] || "?").toUpperCase()
      )}
    </div>
  );
}
