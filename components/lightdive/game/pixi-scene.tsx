"use client";

// React wrapper for the WebGL base scene. Loads PixiJS on demand, falls back to the SVG scene when
// WebGL is unavailable, and keeps keyboard/screen-reader buttons for every spire and coordinate.
import { useEffect, useRef, useState } from "react";
import type { Engine, EngineCallbacks, EngineState } from "./pixi-engine";
import { SkyScene, Starfield, type SceneBridge, type SceneNode, type SceneSpire } from "./scene";

type Props = {
  spires: SceneSpire[];
  nodes: SceneNode[];
  bridges: SceneBridge[];
  selected: bigint | null;
  onSpire: (id: bigint) => void;
  onNode: (depth: number) => void;
  plainLabel: string;
  emptyLabel: string;
};

export function PixiScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const callbacks = useRef<EngineCallbacks>({ onSpire: props.onSpire, onNode: props.onNode });
  const latest = useRef<EngineState>({ spires: props.spires, nodes: props.nodes, bridges: props.bridges, selected: props.selected });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbacks.current = { onSpire: props.onSpire, onNode: props.onNode };
  });

  useEffect(() => {
    let disposed = false;
    let made: Engine | null = null;
    (async () => {
      try {
        const { createEngine } = await import("./pixi-engine");
        if (disposed || !host.current) return;
        made = await createEngine(host.current, callbacks);
        if (disposed) {
          made.destroy();
          return;
        }
        engine.current = made;
        made.update(latest.current);
      } catch (error) {
        console.warn("lightdive scene: WebGL unavailable, using the SVG scene", error);
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      engine.current = null;
      made?.destroy();
    };
  }, []);

  useEffect(() => {
    latest.current = { spires: props.spires, nodes: props.nodes, bridges: props.bridges, selected: props.selected };
    engine.current?.update(latest.current);
  }, [props.spires, props.nodes, props.bridges, props.selected]);

  if (failed) {
    return (
      <>
        <Starfield />
        <SkyScene {...props} />
      </>
    );
  }
  return (
    <div ref={host} className="ldg-pixi" role="group" aria-label={props.plainLabel}>
      <div className="ldg-sr">
        {props.spires.length === 0 && <p>{props.emptyLabel}</p>}
        {props.spires.map((s) => (
          <button key={String(s.id)} type="button" aria-pressed={props.selected === s.id} onClick={() => props.onSpire(s.id)}>{s.title} · {s.sub}</button>
        ))}
        {props.nodes.filter((n) => n.state === "reachable" || n.state === "selected").map((n) => (
          <button key={n.depth} type="button" aria-pressed={n.state === "selected"} onClick={() => props.onNode(n.depth)}>{n.roman} · {n.light} · {n.sub}</button>
        ))}
      </div>
    </div>
  );
}
