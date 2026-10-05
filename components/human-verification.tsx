"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "./language-provider";
type Challenge = {
  action: string;
  key: string;
  resolve: (token: string) => void;
  reject: (e: Error) => void;
};
type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
const getWidget = () =>
  (window as unknown as { turnstile?: Turnstile }).turnstile;
let active = false;
export async function humanProof(
  action: string,
): Promise<Record<string, string>> {
  if (!["metadata", "upload", "report"].includes(action)) return {};
  const response = await fetch("/api/protection", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Verification service unavailable");
  const config = (await response.json()) as {
    enabled: boolean;
    siteKey: string;
  };
  if (!config.enabled) return {};
  if (!config.siteKey) throw new Error("Verification service unavailable");
  if (active) throw new Error("Human verification already in progress");
  active = true;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.dispatchEvent(new Event("rovyn:verification-close"));
        reject(new Error("Human verification timed out"));
      }, 180000);
      window.dispatchEvent(
        new CustomEvent<Challenge>("rovyn:verification", {
          detail: {
            action,
            key: config.siteKey,
            resolve: (v) => {
              clearTimeout(timeout);
              resolve(v);
            },
            reject: (e) => {
              clearTimeout(timeout);
              reject(e);
            },
          },
        }),
      );
    });
    return { "X-Human-Verification": token };
  } finally {
    active = false;
  }
}
export function HumanVerification() {
  const { locale, tr } = useLanguage();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState(false);
  // Radix mounts portal children after opening. Start only once the node exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      setError(false);
      setChallenge((e as CustomEvent<Challenge>).detail);
    };
    const close = () => setChallenge(null);
    window.addEventListener("rovyn:verification", open);
    window.addEventListener("rovyn:verification-close", close);
    return () => {
      window.removeEventListener("rovyn:verification", open);
      window.removeEventListener("rovyn:verification-close", close);
    };
  }, []);
  useEffect(() => {
    if (!challenge || !container) return;
    let cancelled = false;
    let widget: string | undefined;
    let settled = false;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => {
      if (cancelled || settled) return;
      settled = true;
      setError(true);
      challenge.reject(new Error(message));
      setChallenge(null);
    };
    const render = () => {
      if (cancelled || settled || widget) return;
      const api = getWidget();
      if (!api) {
        fail("Verification service unavailable");
        return;
      }
      if (loadTimeout) clearTimeout(loadTimeout);
      try {
        widget = api.render(container, {
          sitekey: challenge.key,
          action: challenge.action,
          theme: "dark",
          language:
            locale === "zh-Hant"
              ? "zh-TW"
              : locale === "zh-Hans"
                ? "zh-CN"
                : locale,
          callback: (token: string) => {
            if (cancelled || settled) return;
            settled = true;
            challenge.resolve(token);
            setChallenge(null);
          },
          "error-callback": () => fail("Human verification failed"),
          "expired-callback": () => fail("Human verification expired"),
          "timeout-callback": () => fail("Human verification timed out"),
        });
      } catch {
        fail("Verification service unavailable");
      }
    };
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-rovyn-turnstile]",
    );
    if (getWidget()) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.rovynTurnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      script.addEventListener("error", failed);
      loadTimeout = setTimeout(() => {
        script?.remove();
        fail("Verification service unavailable");
      }, 10000);
    }
    function failed() {
      script?.remove();
      fail("Verification service unavailable");
    }
    return () => {
      cancelled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", failed);
      if (widget) getWidget()?.remove(widget);
    };
  }, [challenge, locale, container]);
  return (
    <Dialog
      open={!!challenge}
      onOpenChange={(open) => {
        if (!open) {
          challenge?.reject(new Error("Human verification cancelled"));
          setChallenge(null);
        }
      }}
    >
      <DialogContent>
        <DialogTitle>{tr("人機驗證")}</DialogTitle>
        <DialogDescription>{tr("請完成驗證以繼續。")}</DialogDescription>
        <div ref={setContainer} style={{ minHeight: 65 }} />
        {error && <p role="alert">{tr("驗證無法完成，請關閉後重試。")}</p>}
      </DialogContent>
    </Dialog>
  );
}
