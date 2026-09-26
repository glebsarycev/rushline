// Outline of the stadium bowl around a track: the field rectangle (track.stadium)
// with rounded corners. Shared by the stadium geometry and the automatic decor,
// which must keep clear of the stands in the corners.

export function cornerRadius(S) {
  return Math.min(72, 0.22 * Math.min(S.maxX - S.minX, S.maxZ - S.minZ));
}

// true when (x, z) is inside the field by at least `margin` metres
export function insideField(S, x, z, margin = 0) {
  if (x < S.minX + margin || x > S.maxX - margin || z < S.minZ + margin || z > S.maxZ - margin) return false;
  const R = cornerRadius(S);
  const cx = Math.min(Math.max(x, S.minX + R), S.maxX - R);
  const cz = Math.min(Math.max(z, S.minZ + R), S.maxZ - R);
  return Math.hypot(x - cx, z - cz) <= R - margin;
}

// Closed loop of samples along the field edge, clockwise seen from above:
// { p: [x, z], n: [nx, nz] outward normal, s: arc length }
export function outline(S, step = 6) {
  const R = cornerRadius(S);
  const pts = [];
  const corners = [
    [S.maxX - R, S.minZ + R, -Math.PI / 2], // north-east: arc from north to east
    [S.maxX - R, S.maxZ - R, 0],
    [S.minX + R, S.maxZ - R, Math.PI / 2],
    [S.minX + R, S.minZ + R, Math.PI],
  ];
  const push = (x, z, nx, nz) => pts.push({ p: [x, z], n: [nx, nz] });
  for (let c = 0; c < 4; c++) {
    const [cx, cz, a0] = corners[c];
    const arcN = Math.max(4, Math.ceil((R * Math.PI / 2) / step));
    for (let i = 0; i < arcN; i++) {
      const a = a0 + (i / arcN) * (Math.PI / 2);
      push(cx + Math.cos(a) * R, cz + Math.sin(a) * R, Math.cos(a), Math.sin(a));
    }
    // straight edge to the next corner
    const [nx2, nz2, b0] = corners[(c + 1) % 4];
    const ax = cx + Math.cos(a0 + Math.PI / 2) * R, az = cz + Math.sin(a0 + Math.PI / 2) * R;
    const bx = nx2 + Math.cos(b0) * R, bz = nz2 + Math.sin(b0) * R;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    const on = [Math.cos(a0 + Math.PI / 2), Math.sin(a0 + Math.PI / 2)];
    for (let i = 0; i < n; i++) push(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, on[0], on[1]);
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].p[0] - pts[i - 1].p[0], pts[i].p[1] - pts[i - 1].p[1]);
    pts[i].s = s;
  }
  const last = pts[pts.length - 1], first = pts[0];
  const total = s + Math.hypot(first.p[0] - last.p[0], first.p[1] - last.p[1]);
  return { pts, total, R };
}
