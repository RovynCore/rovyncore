import type { CSSProperties } from "react";

function seedOf(value: string) {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Decorative, deterministic identity mark. Never implies verification or a financial metric. */
export function AssetMark({ identity, className = "", style }: { identity: string; className?: string; style?: CSSProperties }) {
  const seed = seedOf(identity);
  const orbit = 65 + seed % 19;
  const stars = Array.from({ length: 90 }, (_, index) => {
    const angle = (seedOf(`${identity}:${index}:angle`)/4294967296)*Math.PI*2;
    const r = 24+(seedOf(`${identity}:${index}:radius`)/4294967296)*102;
    return { x: (160+Math.cos(angle)*r).toFixed(3), y: (95+Math.sin(angle)*r*.58).toFixed(3), radius: index%19===0?"1.7":".7", gold: index%17===0 };
  });
  return <svg className={`rc-asset-mark ${className}`} style={style} viewBox="0 0 320 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><radialGradient id={`rc-mark-${seed}`}><stop stopColor="#a7ffe6" stopOpacity=".75"/><stop offset=".28" stopColor="#39f0c1" stopOpacity=".24"/><stop offset="1" stopColor="#39f0c1" stopOpacity="0"/></radialGradient></defs>
    <circle cx="160" cy="95" r="103" fill={`url(#rc-mark-${seed})`}/>
    <ellipse cx="160" cy="95" rx={orbit+22} ry="40" transform="rotate(-23 160 95)" fill="none" stroke="#39f0c1" strokeOpacity=".54"/>
    <ellipse cx="160" cy="95" rx={orbit+8} ry="61" transform="rotate(31 160 95)" fill="none" stroke="#e7c16d" strokeOpacity=".35"/>
    <circle cx="160" cy="95" r={38+seed%17} fill="none" stroke="#39f0c1" strokeOpacity=".38" strokeDasharray="2 3"/>
    {stars.map((star,index)=><circle key={index} cx={star.x} cy={star.y} r={star.radius} fill={star.gold?"#e7c16d":"#39f0c1"} opacity={index%7===0?".95":".5"}/>)}
    <path d={`M160 ${68-seed%5}l22 13v27l-22 13-22-13V81Z`} fill="rgba(2,8,7,.76)" stroke="#a7ffe6" strokeWidth="1.5"/><path d="m138 81 22 13 22-13M160 94v27" fill="none" stroke="#39f0c1" strokeWidth="1"/>
  </svg>;
}
