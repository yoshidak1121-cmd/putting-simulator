"use strict";

// ---------- Utils ----------
const deg2rad = (d) => (d * Math.PI) / 180.0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Physics (Phase 1 Approx) ----------
// Coordinate (clock-based):
// Cup at origin (0,0)
// Ball starts at 9 o'clock: (-D, 0)
// Positive x = 3 o'clock, positive y = 12 o'clock
// Aim direction baseline: toward cup from 9 o'clock = +x direction
// alphaDeg rotates aim direction: + is CCW (upwards)
// Slope acceleration fixed along +x (right side lower => +theta => +x accel)
// Rolling resistance: constant decel magnitude from Stimp (approx)
//
// Cup-in detection:
// This is an approximation: if path enters cup radius (5.4cm), holed=true.

function simulate(D, thetaDeg, stimpFt, alphaDeg, Dover) {
  const dt = 0.01;      // s
  const maxT = 12.0;    // s
  const epsV = 0.03;    // m/s

  const g = 9.80665;

  // slope accel (+x)
  const theta = deg2rad(thetaDeg);
  const aSlopeX = g * Math.tan(theta);

  // Stimp -> constant decel magnitude (approx)
  const v0_stimp = 1.83; // m/s (approx)
  const s = Math.max(0.1, stimpFt * 0.3048); // ft -> m
  const aRoll = (v0_stimp * v0_stimp) / (2 * s);

  // Initial position (9 o'clock)
  let x = -D;
  let y = 0.0;

  // Initial speed so that (on level) it travels D + Dover along the intended line
  const travel = Math.max(0.05, D + Dover);
  const v0 = Math.sqrt(2 * aRoll * travel);

  // Aim direction: (+1,0) rotated by alpha
  const a = deg2rad(alphaDeg);
  const dirx = Math.cos(a);
  const diry = Math.sin(a);

  let vx = v0 * dirx;
  let vy = v0 * diry;

  const path = [{ x, y }];

  // Cup-in
  const cupR = 0.054; // m
  let holed = false;

  let t = 0.0;
  while (t < maxT) {
    const v = Math.hypot(vx, vy);
    if (v < epsV) break;

    // rolling decel opposite velocity
    const ax_roll = (-aRoll * vx) / (v + 1e-9);
    const ay_roll = (-aRoll * vy) / (v + 1e-9);

    // total accel
    const ax = ax_roll + aSlopeX;
    const ay = ay_roll;

    // Euler integrate
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    // store points (light thinning)
    if ((path.length & 1) === 0) path.push({ x, y });

    // cup-in detection
    const distToCup = Math.hypot(x, y);
    if (distToCup <= cupR) {
      holed = true;
      path.push({ x, y });
      break;
    }

    t += dt;
  }

  return { path, stop: { x, y }, v0, aRoll, aSlopeX, holed };
}

// ---------- Drawing ----------
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function resizeCanvasForDevice() {
  const rect = cv.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

function computeScale(D) {
  // fit roughly within view
  const w = cv.getBoundingClientRect().width;
  const h = cv.getBoundingClientRect().height;
  const range = Math.max(1.0, D + 1.5); // margin
  return Math.min(w, h) / (2 * range);
}

function drawGuides(w, h) {
  // clock guides (12-6, 9-3) with labels
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;

  const cx = w / 2;
  const cy = h / 2;

  // vertical
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();

  // horizontal
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  // labels
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "12px system-ui, -apple-system, 'Yu Gothic', 'Meiryo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("12", cx, 12);
  ctx.fillText("6",  cx, h - 12);
  ctx.fillText("9",  12, cy);
  ctx.fillText("3",  w - 12, cy);

  ctx.restore();
}

function drawCup(w, h) {
  // cup = red circle at center
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawBallAtStart(sim, w, h, scale) {
  const b0 = sim.path[0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(w / 2 + b0.x * scale, h / 2 - b0.y * scale, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawStop(sim, w, h, scale) {
  const sp = sim.stop;
  // holed -> green, else yellow
  ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
  ctx.beginPath();
  ctx.arc(w / 2 + sp.x * scale, h / 2 - sp.y * scale, 5, 0, Math.PI * 2);
  ctx.fill();
}

const SWEEP_COLORS = ["#ffffff", "#cfd8ff", "#9fb3ff", "#6f8cff", "#3a63ff"];

function drawMany(sims, D, title) {
  resizeCanvasForDevice();

  const w = cv.getBoundingClientRect().width;
  const h = cv.getBoundingClientRect().height;

  ctx.clearRect(0, 0, w, h);

  const scale = computeScale(D);

  drawGuides(w, h);
  drawCup(w, h);

  // paths
  sims.forEach((sim, i) => {
    ctx.save();
    // center line (if 5) should be stronger; otherwise keep first stronger
    const centerIdx = Math.floor((sims.length - 1) / 2);
    ctx.globalAlpha = (i === centerIdx) ? 1.0 : 0.55;

    // holed -> green
    ctx.strokeStyle = sim.holed ? "#00ff66" : (SWEEP_COLORS[i] || "#ffffff");
    ctx.lineWidth = 3;

    ctx.beginPath();
    const p0 = sim.path[0];
    ctx.moveTo(w / 2 + p0.x * scale, h / 2 - p0.y * scale);
    for (let k = 1; k < sim.path.length; k++) {
      const pk = sim.path[k];
      ctx.lineTo(w / 2 + pk.x * scale, h / 2 - pk.y * scale);
    }
    ctx.stroke();
    ctx.restore();
  });

  // ball start (representative)
  drawBallAtStart(sims[0], w, h, scale);

  // stops (all)
  sims.forEach((sim) => drawStop(sim, w, h, scale));

  if (title) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "14px system-ui, -apple-system, 'Yu Gothic', 'Meiryo', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, 10, 10);
    ctx.restore();
  }
}

// ---------- UI ----------
function readInputs() {
  const D = parseFloat(document.getElementById("D").value);
  const theta = parseFloat(document.getElementById("theta").value);
  const S = parseFloat(document.getElementById("S").value);
  const alpha = parseFloat(document.getElementById("alpha").value);
  const Dover = parseFloat(document.getElementById("Dover").value);

  return {
    D: clamp(isFinite(D) ? D : 3.0, 0.1, 20),
    thetaDeg: clamp(isFinite(theta) ? theta : 2.0, -8, 8),
    stimpFt: clamp(isFinite(S) ? S : 9.0, 4, 15),
    alphaDeg: clamp(isFinite(alpha) ? alpha : 0.0, -30, 30),
    Dover: clamp(isFinite(Dover) ? Dover : 0.5, 0, 5),
  };
}

function makeValuesWithPM(center, step) {
  const showMinus = document.getElementById("showMinus")?.checked ?? true;
  const showPlus  = document.getElementById("showPlus")?.checked ?? true;

  const ks = [];
  if (showMinus) ks.push(-2, -1);
  ks.push(0);
  if (showPlus) ks.push(1, 2);

  return ks.map(k => center + k * step);
}

function formatStops(sims) {
  const lines = sims.map((s, i) => {
    const x = s.stop.x, y = s.stop.y;
    const tag = s.holed ? "IN" : "—";
    return `[${String(i+1).padStart(2,"0")}] stop x=${x.toFixed(3)}m, y=${y.toFixed(3)}m (${tag})`;
  });
  return lines.join("\n");
}

function renderSingle() {
  const inp = readInputs();
  const sim = simulate(inp.D, inp.thetaDeg, inp.stimpFt, inp.alphaDeg, inp.Dover);
  drawMany([sim], inp.D, "単発");

  document.getElementById("result").textContent =
`表示座標：カップ中心=原点、ボール=9時（-D,0）
入力: D=${inp.D.toFixed(2)}m, θ=${inp.thetaDeg.toFixed(2)}deg, S=${inp.stimpFt.toFixed(1)}ft, α=${inp.alphaDeg.toFixed(2)}deg, Dover=${inp.Dover.toFixed(2)}m
結果: holed=${sim.holed ? "true" : "false"}
stop: x=${sim.stop.x.toFixed(3)}m, y=${sim.stop.y.toFixed(3)}m
v0=${sim.v0.toFixed(2)} m/s
aRoll≈${sim.aRoll.toFixed(2)} m/s^2
aSlopeX≈${sim.aSlopeX.toFixed(2)} m/s^2`;
}

function renderAlpha5() {
  const inp = readInputs();
  const alphas = makeValuesWithPM(inp.alphaDeg, 1.0);

  const sims = alphas.map(a =>
    simulate(inp.D, inp.thetaDeg, inp.stimpFt, a, inp.Dover)
  );

  drawMany(sims, inp.D, `α sweep (deg): ${alphas.map(v => v.toFixed(0)).join(", ")}`);
  document.getElementById("result").textContent =
`α sweep（1°刻み、中心±2ステップ）
α: ${alphas.map(v => v.toFixed(0)).join(", ")} deg
${formatStops(sims)}`;
}

function renderTheta5() {
  const inp = readInputs();
  const thetas = makeValuesWithPM(inp.thetaDeg, 0.5);

  const sims = thetas.map(th =>
    simulate(inp.D, th, inp.stimpFt, inp.alphaDeg, inp.Dover)
  );

  drawMany(sims, inp.D, `θ sweep (deg): ${thetas.map(v => v.toFixed(1)).join(", ")}`);
  document.getElementById("result").textContent =
`θ sweep（0.5°刻み、中心±2ステップ）
θ: ${thetas.map(v => v.toFixed(1)).join(", ")} deg
${formatStops(sims)}`;
}

function renderDover5() {
  const inp = readInputs();
  const dovers = makeValuesWithPM(inp.Dover, 0.25);

  const sims = dovers.map(dv =>
    simulate(inp.D, inp.thetaDeg, inp.stimpFt, inp.alphaDeg, dv)
  );

  drawMany(sims, inp.D, `Dover sweep (m): ${dovers.map(v => v.toFixed(2)).join(", ")}`);
  document.getElementById("result").textContent =
`Dover sweep（0.25m刻み、中心±2ステップ）
Dover: ${dovers.map(v => v.toFixed(2)).join(", ")} m
${formatStops(sims)}`;
}

// ---------- Events ----------
document.getElementById("run").addEventListener("click", renderSingle);

document.getElementById("runAlpha5").addEventListener("click", renderAlpha5);
document.getElementById("runTheta5").addEventListener("click", renderTheta5);
document.getElementById("runDover5").addEventListener("click", renderDover5);

document.getElementById("reset").addEventListener("click", () => {
  document.getElementById("D").value = "3.0";
  document.getElementById("theta").value = "2.0";
  document.getElementById("S").value = "9.0";
  document.getElementById("alpha").value = "0.0";
  document.getElementById("Dover").value = "0.5";
  document.getElementById("showMinus").checked = true;
  document.getElementById("showPlus").checked = true;
  renderSingle();
});

// re-render when rotating or resizing
window.addEventListener("resize", () => {
  clearTimeout(window.__rto);
  window.__rto = setTimeout(() => {
    // 直近の表示を維持する状態管理は入れていないため、単発を再描画
    renderSingle();
  }, 80);
});

// initial
renderSingle();