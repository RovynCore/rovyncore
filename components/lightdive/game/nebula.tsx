"use client";

// GPU nebula backdrop for the game pages: domain-warped fractal noise in one fragment shader,
// drawn at half resolution and ~24 fps so it stays light. Static frame for reduced motion.
import { useEffect, useRef } from "react";

const VERT = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform float t; uniform vec2 res; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1,0)), u.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++){ v += a * n(p); p = m * p; a *= 0.5; } return v; }
void main(){
  vec2 q = (uv - 0.5) * vec2(res.x / res.y, 1.0) * 2.2;
  float tt = t * 0.015;
  vec2 w = vec2(fbm(q + tt), fbm(q + vec2(5.2, 1.3) - tt));
  vec2 r = vec2(fbm(q + 3.0 * w + vec2(1.7, 9.2) + tt * 0.6), fbm(q + 3.0 * w + vec2(8.3, 2.8)));
  float f = fbm(q + 2.6 * r);
  vec3 col = mix(vec3(0.004, 0.010, 0.016), c1 * 0.55, clamp(f * f * 2.2, 0.0, 1.0));
  col = mix(col, c2 * 0.7, clamp(length(w) * 0.55, 0.0, 1.0) * 0.55);
  col = mix(col, c3, clamp(pow(r.x, 3.0) * 1.4, 0.0, 1.0) * 0.45);
  col *= 0.35 + 0.95 * f;
  col *= 0.75 + 0.35 * smoothstep(0.25, 0.75, fbm(q * 3.0 - r));
  vec2 g = uv * res / 2.5; vec2 id = floor(g); float s = h(id);
  col += vec3(1.0) * smoothstep(0.996, 1.0, s) * (0.6 + 0.4 * sin(t * (1.0 + s * 3.0) + s * 40.0)) * 1.2;
  vec2 v = uv - 0.5; col *= 1.0 - dot(v, v) * 1.25;
  o = vec4(col * 1.35, 1.0);
}`;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export function Nebula({ colors = ["#8fe04a", "#1f8f86", "#6a52e0"], className }: { colors?: [string, string, string]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = colors.join(",");
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl2", { antialias: false });
    if (!canvas || !gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const cols = palette.split(",");
    gl.uniform3fv(u("c1"), rgb(cols[0]));
    gl.uniform3fv(u("c2"), rgb(cols[1]));
    gl.uniform3fv(u("c3"), rgb(cols[2]));
    const resize = () => {
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * 0.5));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * 0.5));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u("res"), canvas.width, canvas.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 1000 / 24) return;
      last = now;
      gl.uniform1f(u("t"), reduce ? 20 : (now - start) / 1000 + 20);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Free GPU objects but keep the context: a re-run of this effect gets the same one back.
      gl.deleteBuffer(buffer);
      gl.deleteProgram(prog);
    };
  }, [palette]);
  return <canvas ref={ref} className={className ?? "hud-nebula"} aria-hidden="true" />;
}
