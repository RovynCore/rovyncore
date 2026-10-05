import type { CSSProperties } from "react";
import Image from "next/image";

type RovynHeroAnimationProps = {
  loopDuration?: number;
};

const particles = [
  { left: "57%", top: "29%", size: 3, delay: "-1.8s" },
  { left: "82%", top: "24%", size: 2, delay: "-4.1s" },
  { left: "88%", top: "49%", size: 4, delay: "-6.2s" },
  { left: "57%", top: "72%", size: 2, delay: "-2.7s" },
  { left: "79%", top: "76%", size: 3, delay: "-5.4s" },
  { left: "91%", top: "61%", size: 2, delay: "-7.3s" },
  { left: "68%", top: "17%", size: 2, delay: "-3.6s" },
  { left: "69%", top: "84%", size: 2, delay: "-0.9s" },
];

export default function RovynHeroAnimation({ loopDuration = 9 }: RovynHeroAnimationProps) {
  const style = { "--rovyn-loop": `${loopDuration}s` } as CSSProperties;

  return (
    <div className="rovyn-hero-animation" style={style} aria-hidden="true">
      <div className="rovyn-hero-animation__haze" />
      <div className="rovyn-hero-animation__orbits">
        <span className="rovyn-hero-animation__orbit rovyn-hero-animation__orbit--one" />
        <span className="rovyn-hero-animation__orbit rovyn-hero-animation__orbit--two" />
        <span className="rovyn-hero-animation__orbit rovyn-hero-animation__orbit--three" />
      </div>
      <div className="rovyn-hero-animation__turntable">
        <div className="rovyn-hero-animation__face rovyn-hero-animation__face--front">
          <Image src="/rovyn-core-reference-cutout.png" alt="" width={1200} height={1200} unoptimized />
        </div>
        <div className="rovyn-hero-animation__face rovyn-hero-animation__face--back">
          <Image src="/rovyn-core-reference-cutout.png" alt="" width={1200} height={1200} unoptimized />
        </div>
      </div>
      <div className="rovyn-hero-animation__particles">
        {particles.map((particle, index) => (
          <span
            key={index}
            className="rovyn-hero-animation__particle"
            style={
              {
                left: particle.left,
                top: particle.top,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: particle.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
