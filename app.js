function segmentHitsCircle(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = dx*dx + dy*dy;
  if (a === 0) return null;

  // 原点(0,0)への最近点をパラメータ t で求める（0..1にクランプ）
  let t = -(x0*dx + y0*dy) / a;
  t = Math.max(0, Math.min(1, t));

  const cx = x0 + t*dx;
  const cy = y0 + t*dy;
  const d2 = cx*cx + cy*cy;

  if (d2 <= r*r) {
    return { t, x: cx, y: cy };
  }
  return null;
}

function simulate2D(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const aRoll = computeARoll(stimpFt);
  const v0 = computeInitialV0(D, Dover, aRoll, thetaDeg);

  const dt = 0.01;
  const g = 9.80665;

  let x = -D;
  let y = 0;

  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  const theta = deg2rad(thetaDeg);
  const aSlopeY = -g * Math.sin(theta);

  const path = [{ x, y }];
  let holed = false;
  let vCup = null;
  let cupIndex = null;
  let tStop = 0;

  const estimatedStopTime = v0 / aRoll;
  const maxTime = Math.max(10, estimatedStopTime + 2);

  for (let t = 0; t < maxTime; t += dt) {

    const v = Math.hypot(vx, vy);
    const ax = -aRoll * (vx / v);
    const ay = -aRoll * (vy / v) + aSlopeY;

    const aMag = Math.hypot(ax, ay);
    if (v < 0.01 || aMag < 0.01) {
      tStop = t;
      break;
    }

    // 更新前の位置
    const xPrev = x;
    const yPrev = y;

    // 速度更新
    vx += ax * dt;
    vy += ay * dt;

    // 位置更新
    x += vx * dt;
    y += vy * dt;

    // ★ 線分と円の交差判定（カップ通過）
    if (cupIndex === null) {
      const hit = segmentHitsCircle(xPrev, yPrev, x, y, CUP / 2);
      if (hit) {
        // 交点を path に挿入
        path.push({ x: hit.x, y: hit.y });
        cupIndex = path.length - 1;
        vCup = v;
      }
    }

    // 通常の点を追加
    path.push({ x, y });

    tStop = t;
  }

  return { path, stop: { x, y }, holed, v0, aRoll, tStop, vCup, cupIndex };
}
