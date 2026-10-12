"use client";

// Shared HUD building blocks for the Lightdive pages (styles in hud.css).
import type { ReactNode } from "react";
import { GameIcon } from "./icon";
import type { IconName } from "./icons";

export function Panel({ title, index, icon, action, children, className }: { title?: string; index?: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`hud-panel${className ? ` ${className}` : ""}`}>
      {title && (
        <header className="hud-panel__head">
          {icon && <GameIcon name={icon} />}
          <h2>{index && <em>{index}</em>}{title}</h2>
          {action && <div className="hud-panel__action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHead({ kicker, title, lead, icon, side }: { kicker: string; title: string; lead?: string; icon?: IconName; side?: ReactNode }) {
  return (
    <header className="hud-pagehead">
      <div>
        <span className="hud-kicker">{icon && <GameIcon name={icon} />}{kicker}</span>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {side}
    </header>
  );
}
