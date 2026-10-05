"use client";

import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { getVisualQuality, MOTION, QUALITY, type VisualQuality } from "@/lib/visual/runtime";

export type VisualMode = "home" | "launch" | "explorer" | "asset" | "rvyn";

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function ParticleField({ mode, energy = 0.5, label }: { mode: VisualMode; energy?: number; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const energyTarget = useRef(energy);
  const [quality, setQuality] = useState<VisualQuality>("off");
  const [failed, setFailed] = useState(false);

  useEffect(() => { energyTarget.current = energy; }, [energy]);

  useEffect(() => {
    const refresh = () => setQuality(getVisualQuality());
    refresh();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.addEventListener("change", refresh);
    window.addEventListener("resize", refresh, { passive: true });
    return () => { reduced.removeEventListener("change", refresh); window.removeEventListener("resize", refresh); };
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element || quality === "off" || failed) return;
    let disposed = false;
    let frame = 0;
    let visible = false;
    let renderer: import("three").WebGLRenderer | undefined;
    let composer: import("three/examples/jsm/postprocessing/EffectComposer.js").EffectComposer | undefined;
    let bloomEnabled = false;
    let observer: IntersectionObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let renderOnVisibility = () => {};
    const resources: { dispose(): void }[] = [];
    const onPointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.current.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2;
      pointer.current.y = -((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2;
    };
    const onLeave = () => { pointer.current.x = 0; pointer.current.y = 0; };
    element.addEventListener("pointermove", onPointer, { passive: true });
    element.addEventListener("pointerleave", onLeave);

    void (async () => {
      const T = await import("three");
      if (disposed) return;
      try {
        const config = QUALITY[quality];
        renderer = new T.WebGLRenderer({ alpha: true, antialias: config.antialias, powerPreference: quality === "low" ? "low-power" : "high-performance" });
        renderer.setClearColor(0x020807, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.dpr));
        renderer.outputColorSpace = T.SRGBColorSpace;
        element.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(45, 1, .1, 100);
        camera.position.z = mode === "launch" ? 6.6 : mode === "home" ? 5.2 : 5.7;
        const group = new T.Group();
        if (mode === "home") group.position.y = .28;
        else if (mode === "rvyn" || mode === "explorer") group.position.y = .1;
        scene.add(group);
        const n = Math.floor(config.particles * (mode === "home" || mode === "rvyn" ? .78 : mode === "explorer" ? .48 : .8));
        const positions = new Float32Array(n * 3);
        const colors = new Float32Array(n * 3);
        const phases = new Float32Array(n);
        const rng = random(533 + mode.length * 107);
        const c = new T.Color();
        const sphereMode = mode !== "explorer";
        for (let i = 0; i < n; i++) {
          const u = rng();
          const v = rng();
          const theta = 2 * Math.PI * u;
          const phi = Math.acos(2 * v - 1);
          const family = rng();
          let radius = sphereMode ? 1.5 + (rng() - .5) * .22 : 1.4 + (rng() - .5) * .38;
          let x = radius * Math.sin(phi) * Math.cos(theta);
          let y = radius * Math.sin(phi) * Math.sin(theta);
          let z = radius * Math.cos(phi);
          if (mode === "explorer") { y *= .64; x *= 1.2; }
          if (mode === "rvyn") { x *= 1.13; y *= 1.1; }
          if (sphereMode && family > .54 && family < .83) {
            const band = i % 7;
            const a = theta * (1 + (band % 3) * .21) + band * .7;
            radius = 1.45 + (rng() - .5) * .15;
            const flatX = Math.cos(a) * radius;
            const flatY = Math.sin(a) * radius * (.42 + band % 3 * .12);
            const tilt = -.62 + band * .24;
            x = flatX * Math.cos(tilt) - flatY * Math.sin(tilt);
            y = flatX * Math.sin(tilt) + flatY * Math.cos(tilt);
            z = Math.sin(a * 2 + band) * .32 + (rng() - .5) * .18;
          }
          if ((mode === "home" || mode === "rvyn") && family >= .83) {
            const progress = rng();
            x = -1.7 + progress * 5.35;
            y = .08 + Math.sin(progress * 11 + (i % 4) * .75) * (.12 + progress * .28) + (rng() - .5) * .22;
            z = Math.cos(progress * 9 + (i % 5)) * .3 + (rng() - .5) * .45;
          }
          if (sphereMode && family < .07) {
            radius = 1.75 + rng() * 1.1;
            x = radius * Math.sin(phi) * Math.cos(theta);
            y = radius * Math.sin(phi) * Math.sin(theta);
            z = radius * Math.cos(phi);
          }
          positions.set([x, y, z], i * 3);
          const spark = rng();
          c.set(spark > .981 ? 0xe7c16d : spark > .47 ? 0x39f0c1 : 0x17cfa9);
          const brightness = family > .54 && family < .83 ? .58 + rng() * .7 : family >= .83 ? .3 + rng() * .9 : rng() > .7 ? .48 + rng() * .55 : .09 + rng() * .22;
          colors.set([c.r * brightness, c.g * brightness, c.b * brightness], i * 3);
          phases[i] = rng() * 6.28;
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
        geometry.setAttribute("aPhase", new T.BufferAttribute(phases, 1));
        resources.push(geometry);
        const material = new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          uniforms: { uTime: { value: 0 }, uSize: { value: quality === "low" ? 3.7 : 2.35 }, uPointer: { value: new T.Vector2() }, uEnergy: { value: energyTarget.current } },
          vertexShader: `attribute vec3 color; attribute float aPhase; varying vec3 vColor; varying float vAlpha; uniform float uTime; uniform float uSize; uniform vec2 uPointer; void main(){ vec3 p=position; float wave=sin(aPhase+uTime*.23)*.018; p+=normalize(p)*wave; vec4 mv=modelViewMatrix*vec4(p,1.); vec4 clip=projectionMatrix*mv; vec2 screen=clip.xy/clip.w; float d=distance(screen,uPointer); p.xy+=normalize(screen-uPointer+vec2(.0001))*max(0.,1.-d/.28)*.07; mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(7.,uSize*(6.5/-mv.z)*(1.+.42*sin(aPhase+uTime))); vColor=color; vAlpha=.5+.5*sin(aPhase*2.+uTime*.3); }`,
          fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float uEnergy; void main(){ float r=length(gl_PointCoord-.5); float core=smoothstep(.48,.03,r); float halo=exp(-r*r*16.); float alpha=(core*.62+halo*.18)*(.55+vAlpha*.45)*(.7+uEnergy*.3); if(alpha<.02) discard; gl_FragColor=vec4(vColor*(1.+core*.6),alpha); }`,
        });
        resources.push(material);
        const points = new T.Points(geometry, material);
        group.add(points);
        const beaconCount = quality === "high" ? 38 : quality === "medium" ? 22 : 10;
        const beaconPositions = new Float32Array(beaconCount * 3);
        const beaconColors = new Float32Array(beaconCount * 3);
        const beaconScales = new Float32Array(beaconCount);
        for (let i = 0; i < beaconCount; i++) {
          const a = (i * 2.39996) % (Math.PI * 2);
          const onFlow = (mode === "home" || mode === "rvyn") && i % 4 === 0;
          const bx = onFlow ? 1.15 + (i / beaconCount) * 2.6 : Math.cos(a) * (1.45 + rng() * .28);
          const by = onFlow ? Math.sin(i * 1.7) * .26 : Math.sin(a) * (1.15 + rng() * .22);
          const bz = onFlow ? Math.cos(i * .7) * .24 : Math.sin(a * 2.3) * .32;
          beaconPositions.set([bx, by, bz], i * 3);
          c.set(i % 8 === 0 ? 0xe7c16d : i % 3 === 0 ? 0xa7ffe6 : 0x39f0c1);
          beaconColors.set([c.r, c.g, c.b], i * 3);
          beaconScales[i] = .55 + rng() * .9;
        }
        const beaconGeometry = new T.BufferGeometry();
        beaconGeometry.setAttribute("position", new T.BufferAttribute(beaconPositions, 3));
        beaconGeometry.setAttribute("color", new T.BufferAttribute(beaconColors, 3));
        beaconGeometry.setAttribute("aScale", new T.BufferAttribute(beaconScales, 1));
        resources.push(beaconGeometry);
        const beaconMaterial = new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          uniforms: { uTime: { value: 0 } },
          vertexShader: `attribute vec3 color; attribute float aScale; varying vec3 vColor; varying float vPulse; uniform float uTime; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(55.,aScale*24.*(6.5/-mv.z)); vColor=color; vPulse=.72+.28*sin(uTime*.57+aScale*8.); }`,
          fragmentShader: `varying vec3 vColor; varying float vPulse; void main(){ float d=length(gl_PointCoord-.5); float halo=exp(-d*d*25.); float core=exp(-d*d*290.); float alpha=(halo*.21+core*.74)*vPulse; if(alpha<.015) discard; gl_FragColor=vec4(vColor*(1.+core*.82),alpha); }`,
        });
        resources.push(beaconMaterial);
        group.add(new T.Points(beaconGeometry, beaconMaterial));
        if (mode === "home" || mode === "rvyn") {
          const streamCount = quality === "high" ? 18 : quality === "medium" ? 11 : 6;
          for (let strand = 0; strand < streamCount; strand++) {
            const stream = new Float32Array(170 * 3);
            for (let i = 0; i < 170; i++) {
              const t = i / 169;
              const envelope = Math.exp(-Math.pow((t - .45) / .32, 2));
              const x = -2.55 + t * 6.75;
              const y = (strand - streamCount / 2) * .029 + Math.sin(t * 11 + strand * .54) * (.08 + .15 * envelope) + (t - .45) * .16;
              const z = Math.sin(t * 8 + strand * .39) * .22 + (strand % 3 - 1) * .07;
              stream.set([x, y, z], i * 3);
            }
            const streamGeometry = new T.BufferGeometry();
            streamGeometry.setAttribute("position", new T.BufferAttribute(stream, 3));
            const streamMaterial = new T.LineBasicMaterial({ color: strand % 5 === 0 ? 0xe7c16d : strand % 3 === 0 ? 0xa7ffe6 : 0x39f0c1, transparent: true, opacity: .1 + (strand % 4) * .055, blending: T.AdditiveBlending, depthWrite: false });
            resources.push(streamGeometry, streamMaterial);
            group.add(new T.Line(streamGeometry, streamMaterial));
          }
        }
        const orbitGroups: Group[] = [];
        for (let j = 0; j < config.orbits; j++) {
          const orbit = new T.Group();
          const count = 320;
          const path = new Float32Array(count * 3);
          const radius = 1.77 + j * .092;
          for (let i = 0; i < count; i++) {
            const a = (i / (count - 1)) * Math.PI * 2;
            path.set([Math.cos(a) * radius, Math.sin(a) * radius * (.38 + (j % 3) * .13), Math.sin(a * 2 + j) * .23], i * 3);
          }
          const lineGeometry = new T.BufferGeometry();
          lineGeometry.setAttribute("position", new T.BufferAttribute(path, 3));
          resources.push(lineGeometry);
          const lineMaterial = new T.LineBasicMaterial({ color: j % 5 === 0 ? 0xe7c16d : 0x39f0c1, transparent: true, opacity: .32 + (j % 3) * .09, blending: T.AdditiveBlending, depthWrite: false });
          resources.push(lineMaterial);
          orbit.add(new T.LineLoop(lineGeometry, lineMaterial));
          orbit.rotation.set(j * .43, j * .61, j * .28);
          group.add(orbit);
          orbitGroups.push(orbit);
        }
        if (quality === "high") {
          const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
            import("three/examples/jsm/postprocessing/EffectComposer.js"),
            import("three/examples/jsm/postprocessing/RenderPass.js"),
            import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
          ]);
          if (disposed) return;
          composer = new EffectComposer(renderer);
          composer.addPass(new RenderPass(scene, camera));
          const bloom = new UnrealBloomPass(new T.Vector2(1, 1), .72, .3, .77);
          composer.addPass(bloom);
          resources.push(bloom);
          bloomEnabled = true;
        }
        const startTime = performance.now();
        const visualTest = new URLSearchParams(window.location.search).has("visual-test");
        const pointerTarget = new T.Vector2();
        let sampleStart = startTime;
        let sampleFrames = 0;
        let adapted = false;
        let slowWindows = 0;
        const render = () => {
          if (disposed || !renderer) return;
          if (!visible || document.hidden) { frame = 0; return; }
          const elapsed = visualTest ? 2.2 : (performance.now() - startTime) / 1000;
          material.uniforms.uTime.value = elapsed;
          beaconMaterial.uniforms.uTime.value = elapsed;
          material.uniforms.uEnergy.value += (energyTarget.current - material.uniforms.uEnergy.value) * .08;
          pointerTarget.set(visualTest ? 0 : pointer.current.x, visualTest ? 0 : pointer.current.y);
          material.uniforms.uPointer.value.lerp(pointerTarget, MOTION.pointerLerp);
          group.rotation.y = elapsed * .025 + material.uniforms.uPointer.value.x * .045;
          group.rotation.x = material.uniforms.uPointer.value.y * .045;
          orbitGroups.forEach((orbit, index) => {
            orbit.rotation.z = index * .28 + elapsed / MOTION.orbitSeconds[index % 3];
          });
          if (bloomEnabled && composer) composer.render();
          else renderer.render(scene, camera);
          sampleFrames++;
          const sampleElapsed = performance.now() - sampleStart;
          if (sampleElapsed >= 1500 && !visualTest) {
            const fps = Math.round(sampleFrames * 1000 / sampleElapsed);
            element.dataset.visualFps = String(fps);
            const targetFps = quality === "high" ? 55 : quality === "medium" ? 45 : 30;
            slowWindows = fps < targetFps ? slowWindows + 1 : 0;
            if (!adapted && slowWindows >= 2) {
              renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.dpr * .75));
              geometry.setDrawRange(0, Math.floor(n * .7));
              bloomEnabled = false;
              element.dataset.visualAdaptive = "reduced";
              adapted = true;
            }
            sampleStart = performance.now();
            sampleFrames = 0;
          }
          if (!visualTest) frame = requestAnimationFrame(render);
        };
        const resize = () => {
          if (!renderer) return;
          const width = element.clientWidth;
          const height = element.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          composer?.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(element);
        observer = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible && !frame) { sampleStart = performance.now(); sampleFrames = 0; render(); }
          else if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
        }, { threshold: .01 });
        observer.observe(element);
        resize();
        renderOnVisibility = () => {
          if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
          else if (!document.hidden && visible && !frame) { sampleStart = performance.now(); sampleFrames = 0; render(); }
        };
        document.addEventListener("visibilitychange", renderOnVisibility);
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      resizeObserver?.disconnect();
      element.removeEventListener("pointermove", onPointer);
      element.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", renderOnVisibility);
      resources.forEach((resource) => resource.dispose());
      composer?.dispose();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
    };
  }, [quality, failed, mode]);

  return <div ref={host} className={`rc-particle-field rc-particle-field--${mode} rc-particle-field--${quality}${failed ? " rc-particle-field--fallback" : ""}`} aria-label={label} role={label ? "img" : undefined} aria-hidden={label ? undefined : true}>
    <svg className="rc-particle-fallback" viewBox="0 0 600 600" aria-hidden="true"><defs><radialGradient id={`rc-core-${mode}`}><stop stopColor="#a7ffe6" stopOpacity=".72"/><stop offset=".27" stopColor="#39f0c1" stopOpacity=".12"/><stop offset="1" stopColor="#39f0c1" stopOpacity="0"/></radialGradient></defs><circle cx="300" cy="300" r="245" fill={`url(#rc-core-${mode})`} /><circle cx="300" cy="300" r="158" fill="none" stroke="#39f0c1" strokeOpacity=".38" strokeWidth="1"/><ellipse cx="300" cy="300" rx="233" ry="87" fill="none" stroke="#39f0c1" strokeOpacity=".4" strokeWidth="1" transform="rotate(-24 300 300)"/><ellipse cx="300" cy="300" rx="222" ry="110" fill="none" stroke="#e7c16d" strokeOpacity=".3" strokeWidth="1" transform="rotate(31 300 300)"/></svg>
  </div>;
}
