"use strict";

const CUP = 0.108;
const deg2rad = d => d * Math.PI / 180;

// ================= DOM references =================
const D        = document.getElementById("D");
const theta    = document.getElementById("theta");
const S        = document.getElementById("S");
const alpha    = document.getElementById("alpha");
const Dover    = document.getElementById("Dover");

const run       = document.getElementById("run");
const reset     = document.getElementById("reset");
const runAlpha5 = document.getElementById("runAlpha5");
const runTheta5 = document.getElementById("runTheta5");
const runDover5 = document.getElementById("runDover5");

const result    = document.getElementById("result");

// ================= Physics =================

// スティンプから一定減速度 aRoll を計算
function computeARoll(stimpFt) {
  const v_stimp = 1.83;
  const s = stimpFt * 0.3048;
  return (v_stimp ** 2) / (2 * s);
}

// 初速 v0 を「D + Dover」から直接計算
function computeInitialV0(D, Dover, aRoll, thetaDeg) {
  const L = D + Dover;
  const g = 9.80665;
  const theta = deg2rad(thetaDeg);

  const a_g = -g * Math.sin(theta);
  const aEff = aRoll + a_g;

  if (aEff <= 0) return 0.1;
  return Math.sqrt(2 * aEff * L);
}

// ================= Cup crossing (線分と円の交差判定) =================

function segmentHitsCircle(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = dx*dx + dy*dy;
  if (a === 0) return null;

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

// ================= Simulation =================

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

    const xPrev = x;
    const yPrev = y;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    // ★ 線分と円の交差判定
    if (cupIndex === null) {
      const hit = segmentHitsCircle(xPrev, yPrev, x, y, CUP / 2);
      if (hit) {
        path.push({ x: hit.x, y: hit.y });
        cupIndex = path.length - 1;
        vCup = v;
      }
    }

    path.push({ x, y });
    tStop = t;
  }

  return { path, stop: { x, y }, v0, aRoll, tStop, vCup, cupIndex };
}

// ================= Drawing =================

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function setupCanvas() {
  const r = cv.getBoundingClientRect();
  cv.width = r.width;
  cv.height = r.height;
}

function drawMany(sims, D, Dover, title) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;

  sims.forEach(sim => {
    sim.path.forEach(p => {
      xMin = Math.min(xMin, p.x);
      xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    });
  });

  xMin -= 0.5;
  xMax += 0.5;

  const baseYMin = -2 * CUP;
  const baseYMax =  2 * CUP;
  yMin = Math.min(yMin, baseYMin) - 0.2;
  yMax = Math.max(yMax, baseYMax) + 0.2;

  const sx = w / (xMax - xMin);
  const sy = h / (yMax - yMin);

  const tx = x => (x - xMin) * sx;
  const ty = y => h - (y - yMin) * sy;

  // グリッド
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let xm = Math.ceil(xMin); xm <= xMax; xm++) {
    ctx.beginPath();
    ctx.moveTo(tx(xm), 0);
    ctx.lineTo(tx(xm), h);
    ctx.stroke();
  }

  // カップ
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), 7, 0, Math.PI * 2);
  ctx.fill();

  // 軌跡
  sims.forEach((sim, idx) => {

    const colorBefore = sim.color || "#ffffff";
    const colorAfter  = "#00ff66";

    ctx.lineWidth = idx === 0 ? 3 : 2;

    // カップ前
    ctx.strokeStyle = colorBefore;
    ctx.beginPath();
    sim.path.forEach((p, i) => {
      if (sim.cupIndex !== null && i >= sim.cupIndex) return;
      const px = tx(p.x);
      const py = ty(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // カップ後
    if (sim.cupIndex !== null) {
      ctx.strokeStyle = colorAfter;
      ctx.beginPath();
      sim.path.forEach((p, i) => {
        if (i < sim.cupIndex) return;
        const px = tx(p.x);
        const py = ty(p.y);
        if (i === sim.cupIndex) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // 停止点
    ctx.fillStyle = colorAfter;
    ctx.beginPath();
    ctx.arc(tx(sim.stop.x), ty(sim.stop.y), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#fff";
  ctx.fillText(title, 10, 14);
}

// ================= UI =================

function getI() {
  return {
    D: +D.value,
    theta: +theta.value,
    S: +S.value,
    alpha: +alpha.value,
    Dover: +Dover.value
  };
}

function runSingle() {
  const i = getI();
  const sim = simulate2D(i.D, i.theta, i.S, i.alpha, i.Dover);

  drawMany([sim], i.D, i.Dover, "単発");

  const stopX = sim.stop.x;
  const stopY = sim.stop.y;
  const stopDist = Math.hypot(stopX + i.D, stopY);

  const maxY = Math.max(...sim.path.map(p => Math.abs(p.y)));
  const maxWidth = maxY / CUP;

  let text =
    `距離 D: ${i.D} m\n` +
    `傾斜 θ: ${i.theta}°\n` +
    `スティンプ S: ${i.S} ft\n` +
    `打ち出し角 α: ${i.alpha}°\n` +
    `オーバー距離 Dover: ${i.Dover} m\n\n` +
    `一定減速度 aRoll: ${sim.aRoll.toFixed(3)} m/s²\n` +
    `初速 v0: ${sim.v0.toFixed(3)} m/s\n` +
    `停止時間 tStop: ${sim.tStop.toFixed(2)} s\n` +
    `カップ通過速度 vCup: ${sim.vCup !== null ? sim.vCup.toFixed(3) + " m/s" : "未通過"}\n\n` +
    `停止位置 X: ${stopX.toFixed(3)} m\n` +
    `停止位置 Y: ${stopY.toFixed(3)} m\n` +
    `停止距離（打ち出し基準）: ${stopDist.toFixed(3)} m\n` +
    `最大幅（左右）: ±${maxWidth.toFixed(2)} CUP\n`;

  result.textContent = text;
}

// α 5本比較
function runAlpha5() {
  const i = getI();
  const sims = [];
  const baseAlpha = i.alpha;
  const deltas = [-2, -1, 0, 1, 2];

  deltas.forEach(d => {
    const a = baseAlpha + d;
    const sim = simulate2D(i.D, i.theta, i.S, a, i.Dover);
    sim.color = d === 0 ? "#00ff66" : "#66ccff";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `α 5本 (中心 ${baseAlpha}°)`);

  let best = null;
  sims.forEach((sim, idx) => {
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, alpha: baseAlpha + deltas[idx] };
    }
  });

  result.textContent =
    `α 5本比較\n最適 α: ${best.alpha}°（カップ中心から ${best.dist.toFixed(3)} m）`;
}

// θ 5本比較
function runTheta5() {
  const i = getI();
  const sims = [];
  const baseTheta = i.theta;
  const deltas = [-1, -0.5, 0, 0.5, 1];

  deltas.forEach(d => {
    const th = baseTheta + d;
    const sim = simulate2D(i.D, th, i.S, i.alpha, i.Dover);
    sim.color = d === 0 ? "#ff66cc" : "#cc99ff";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `θ 5本 (中心 ${baseTheta}°)`);

  result.textContent = `θ 5本比較（中心 ${baseTheta}°）`;
}

// Dover 5本比較
function runDover5() {
  const i = getI();
  const sims = [];
  const baseDover = i.Dover;
  const deltas = [-0.5, -0.25, 0, 0.25, 0.5];

  deltas.forEach(d => {
    const DoverVal = Math.max(0, baseDover + d);
    const sim = simulate2D(i.D, i.theta, i.S, i.alpha, DoverVal);
    sim.color = d === 0 ? "#ffaa00" : "#ffdd66";
    sims.push(sim);
  });

  drawMany(sims, i.D, baseDover + 0.5, `Dover 5本 (中心 ${baseDover} m)`);

  let best = null;
  sims.forEach((sim, idx) => {
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, Dover: baseDover + deltas[idx] };
    }
  });

  result.textContent =
    `Dover 5本比較\n最適 Dover: ${best.Dover.toFixed(2)} m（カップ中心から ${best.dist.toFixed(3)} m）`;
}

run.onclick = runSingle;
reset.onclick = () => {
  D.value = 3;
  theta.value = 0;
  S.value = 9;
  alpha.value = 0;
  Dover.value = 0.5;
  runSingle();
};

runAlpha5.onclick = runAlpha5;
runTheta5.onclick = runTheta5;
runDover5.onclick = runDover5;

window.addEventListener("resize", runSingle);
runSingle();
