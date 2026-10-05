"use client";

import { useState } from "react";
import { Orbit, Rocket, ShieldCheck, Telescope, ArrowDown } from "lucide-react";

type Step = { n: string; title: string; body: string };
type Props = { eyebrow: string; title: string; lead: string; steps: Step[]; selectionHint: string; nextLabel: string };
const icons = [Orbit, Rocket, ShieldCheck, Telescope];
const nodes = [{ x: 74, y: 103 }, { x: 275, y: 63 }, { x: 345, y: 239 }, { x: 123, y: 297 }];
const stars = Array.from({ length: 30 }, (_, i) => ({ x: 24 + ((i * 97) % 371), y: 30 + ((i * 61) % 305), r: i % 7 === 0 ? 1.4 : .7 }));

export function ConstellationStory({ eyebrow, title, lead, steps, selectionHint, nextLabel }: Props) {
  const [active, setActive] = useState(0);
  return <section className="reboot-flow constellation-story content-motion-zone" id="reboot-flow" aria-labelledby="reboot-flow-title">
    <div className="reboot-flow__intro">
      <span className="reboot-kicker">{eyebrow}</span><h2 id="reboot-flow-title">{title}</h2><p>{lead}</p>
      <div className="story-constellation content-motion-zone" aria-hidden="true">
        <svg viewBox="0 0 420 360">
          <defs><radialGradient id="story-core-light"><stop stopColor="#c9ff55" stopOpacity=".13" /><stop offset="1" stopColor="#c9ff55" stopOpacity="0" /></radialGradient></defs>
          <circle cx="210" cy="178" r="108" fill="url(#story-core-light)" />
          {stars.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={point.r} fill="#bdcf83" opacity=".4" />)}
          <ellipse className="story-constellation__orbit" cx="210" cy="178" rx="157" ry="118" transform="rotate(-25 210 178)" />
          <circle className="story-constellation__core-ring" cx="210" cy="178" r="61" />
          <circle className="story-constellation__core-ring story-constellation__core-ring--outer" cx="210" cy="178" r="72" />
          {nodes.map((node, index) => <g key={index} className={active === index ? "story-constellation__node is-active" : "story-constellation__node"}>
            <path d={`M${node.x} ${node.y} Q210 ${index < 2 ? 72 : 282} 210 178`} />
            <circle className="story-constellation__halo" cx={node.x} cy={node.y} r="23" />
            <circle className="story-constellation__dot" cx={node.x} cy={node.y} r="6" />
            <text x={node.x} y={node.y + 39} textAnchor="middle">0{index + 1}</text>
          </g>)}
          <text className="story-constellation__word" x="210" y="175" textAnchor="middle">ROVYN</text>
          <text className="story-constellation__subword" x="210" y="197" textAnchor="middle">CORE</text>
        </svg>
        <div className="story-constellation__caption"><span>{steps[active].n}</span><p key={active}>{steps[active].title}</p></div>
      </div>
    </div>
    <div className="reboot-flow__steps">
      <p className="story-selector-hint">{selectionHint}</p>
      {steps.map(({ n, title: stepTitle, body }, index) => {
        const Icon = icons[index];
        return <article className={`reboot-step${active === index ? " is-active" : ""}`} key={n}>
          <h3 className="story-step-heading"><button type="button" className="story-step-selector" aria-pressed={active === index} onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia("(min-width: 761px) and (hover: hover)").matches) setActive(index); }} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
            <span className="reboot-step__top"><span>{n}</span><Icon aria-hidden="true" /></span><span className="story-step-selector__title">{stepTitle}</span>
          </button></h3>
          <p>{body}</p>
        </article>;
      })}
    </div>
    <a className="reboot-scroll reboot-flow__scroll" href="#reboot-launches" aria-label={nextLabel}><ArrowDown size={30} /></a>
  </section>;
}



