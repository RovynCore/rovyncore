// The voyage route, shared by the HTML route (voyage.tsx) and the WebGL scene (voyage-engine.ts) so the ship, the
// markers and the drawn line always agree: 碑原 bottom left, the destination top right, a gentle S between them.
// Points are in % of the route box.

export const ROUTE_P = [[9, 78], [34, 12], [60, 96], [90, 26]] as const;

export const routeAt = (u: number) => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: c.reduce((a, w, i) => a + w * ROUTE_P[i][0], 0), y: c.reduce((a, w, i) => a + w * ROUTE_P[i][1], 0) };
};

/** Where the light is after a share `u` of the route's length (not of the curve parameter). Lengths are measured in
 *  the box's real pixels, so the result depends on the box's aspect ratio. Returns % of the box. */
export const alongRoute = (w: number, h: number) => {
  const N = 96;
  const pts = Array.from({ length: N + 1 }, (_, i) => routeAt(i / N));
  const len = [0];
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(((pts[i].x - pts[i - 1].x) * w) / 100, ((pts[i].y - pts[i - 1].y) * h) / 100));
  const total = len[N];
  return (u: number) => {
    const target = Math.min(1, Math.max(0, u)) * total;
    let i = 1;
    while (i < N && len[i] < target) i++;
    const k = (target - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
  };
};

/** The route as an SVG path in real pixels for a box of w×h, so dashes and stroke widths stay true at any size. */
export const routeIn = (w: number, h: number) => {
  const q = ROUTE_P.map(([x, y]) => `${(x / 100) * w} ${(y / 100) * h}`);
  return `M ${q[0]} C ${q[1]} ${q[2]} ${q[3]}`;
};
