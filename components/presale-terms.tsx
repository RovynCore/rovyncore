"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function PresaleTerms({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className="presale-terms">
    <button type="button" className="presale-terms__toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <span>{title}<small>{badge}</small></span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div className="presale-terms__body" id={id} aria-hidden={!expanded} inert={!expanded} data-expanded={expanded}>
      <div>{children}</div>
    </div>
  </div>;
}
