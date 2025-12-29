"use strict";

const CUP = 0.108;
const deg2rad = d => d * Math.PI / 180;

// ================= Physics =================

function simulateWithV0(D, thetaDeg, stimpFt, alphaDeg, v0) {

  if (!isFinite(v0) || v0 < 0.03) v0 = 0.03;

  const dt = 0.01;
  const g = 9.80665;
  const cupR = CUP / 2;

  const v0_stimp = 1.83;
  const s = Math.max(0.1, stimpFt * 0.3048);
  const aRoll = (v0_stimp ** 2) / (2 * s);

  let x = -D;
  let y = 0;

  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  const theta = deg2rad(thetaDeg);
  const aSlopeY = -g * Math.tan(theta);

  const k = aRoll / v0;

  const path = [{ x, y }];
  let holed = false;

  for (let t = 0; t < 12; t += dt) {
    const v = Math.hypot(vx, vy);
    if (v < 0.01) break;

    const ax = -k * vx;
    const ay = -k * vy + aSlopeY;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    if (!isFinite(x) || !isFinite(y)) break;

    path.push({ x, y });

    if (Math.hypot(x, y) <= cupR) {
      holed = true;
      break;
    }
  }

  if (path.length < 2) path.push({ x, y });

  return { path, stop: { x, y }, holed };
}

function findV0ForDover(D, theta, S, alpha, Dover) {

  let v0 = 1.2;

  for (let iter = 0; iter < 12; iter++) {

    const sim = simulateWithV0(D, theta, S, alpha, v0);

    const actual = Math.hypot(sim.stop.x, sim.stop.y);
    const error = actual - Dover;

    if (Math.abs(error) < 0.01) break;

    v0 = v0 - error * 0.2;

    if (!isFinite(v0) || v0 < 0.03) v0 = 0.03;
  }

  return v0;
}

function simulate(D, theta, S, alpha, Dover) {
  const v0 = findV0ForDover(D, theta, S, alpha, Dover);
  return simulateWithV0(D, theta, S, alpha, v0);
}

// ================= Drawing =================

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function setupCanvas() {
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(320, r.width | 0);
  cv.height = Math.max(320, r.height | 0);
}

function drawAxes(sims, D, Dover) {

  const xMin = -(D + 1);
  const xMax = Dover + 1;

  let yMin = Infinity, yMax = -Infinity;
  sims.forEach(sim =>
    sim.path.forEach(p => {
      yMin = Math.min(yMin, p.y / CUP);
      yMax = Math.max(yMax, p.y / CUP);
    })
  );

  if (!isFinite(yMin) || !isFinite(yMax)) {
    yMin = -1;
    yMax = 1;
  }

  let yLo = Math.floor(yMin) - 1;
  let yHi = Math.ceil(yMax) + 1;

  yLo = Math.min(yLo, -2);
  yHi = Math.max(yHi, 2);

  return { xMin, xMax, yLo, yHi };
}

function drawMany(sims, D, Dover, title) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const { xMin, xMax, yLo, yHi } = drawAxes(sims, D, Dover);

  const sx = w / (xMax - xMin);
  const sy = h / (yHi - yLo);

  const tx = x => (x - xMin) * sx;
  const ty = yCup => h - (yCup - yLo) * sy;

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;

  for (let xm = Math.ceil(xMin); xm <= xMax; xm++) {
    const px = tx(xm);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  for (let yc = yLo; yc <= yHi; yc++) {
    const py = ty(yc);
    ctx.lineWidth = (yc === 0) ? 2 : (Math.abs(yc) === 1 ? 1.5 : 1);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }

  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), 7, 0, Math.PI * 2);
  ctx.fill();

  sims.forEach((sim, i) => {
    if (!sim.path || sim.path.length < 2) return;

    ctx.strokeStyle = sim.holed ? "#00ff66" : "#ffffff";
    ctx.globalAlpha = (i === Math.floor(sims.length / 2)) ? 1 : 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    sim.path.forEach((p, k) => {
      if (!isFinite(p.x) || !isFinite(p.y)) return;
      const px = tx(p.x);
      const py = ty(p.y / CUP);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  const b0 = sims[0].path[0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(tx(b0.x), ty(b0.y / CUP), 6, 0, Math.PI * 2);
  ctx.fill();

  sims.forEach(sim => {
    ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
    ctx.beginPath();
    ctx.arc(tx(sim.stop.x), ty(sim.stop.y / CUP), 5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (title) {
    ctx.fillStyle = "#fff";
    ctx.fillText(title, 10, 14);
  }
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

function makeValues(center, step) {
  const ks = [];
  if (showMinus.checked) ks.push(-2, -1);
  ks.push(0);
  if (showPlus.checked) ks.push(1, 2);
  return ks.map(k => center + k * step);
}

function runSingle() {
  const i = getI();
  const v0 = findV0ForDover(i.D, i.theta, i.S, i.alpha, i.Dover);
  const sim = simulateWithV0(i.D, i.theta, i.S, i.alpha, v0);

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
    `オーバー距離 Dover: ${i.Dover} m\n` +
    `計算された初速 v0: ${v0.toFixed(3)} m/s\n\n` +
    `停止位置 X: ${stopX.toFixed(3)} m\n` +
    `停止位置 Y: ${stopY.toFixed(3)} m\n` +
    `停止距離（打ち出し基準）: ${stopDist.toFixed(3)} m\n` +
    `最大幅（左右）: ±${maxWidth.toFixed(2)} CUP\n\n` +
    `--- 軌跡データ ---\n`;

  sim.path.forEach((p, idx) => {
    text += `#${idx}: x=${p.x.toFixed(3)} m, y=${p.y.toFixed(3)} m\n`;
  });

  result.textContent = text;
}

function runSweep(type) {
  const i = getI();
  let values, sims;

  if (type === "alpha") {
    values = makeValues(i.alpha, 1);
    sims = values.map(v => simulate(i.D, i.theta, i.S, v, i.Dover));
    drawMany(sims, i.D, i.Dover, "α sweep");
  }
  if (type === "theta") {
    values = makeValues(i.theta, 0.5);
    sims = values.map(v => simulate(i.D, v, i.S, i.alpha, i.Dover));
    drawMany(sims, i.D, i.Dover, "θ sweep");
  }
  if (type === "dover") {
    values = makeValues(i.Dover, 0.25);
    sims = values.map(v => simulate(i.D, i.theta, i.S, i.alpha, v));
    drawMany(sims, i.D, i.Dover, "Dover sweep");
  }
}

run.onclick = runSingle;
runAlpha5.onclick = () => runSweep("alpha");
runTheta5.onclick = () => runSweep("theta");
runDover5.onclick = () => runSweep("dover");

reset.onclick = () => {
  D.value = 3; theta.value = 2; S.value = 9; alpha.value = 0; Dover.value = 0.5;
  showMinus.checked = true; showPlus.checked = true;
  runSingle();
};

window.addEventListener("resize", runSingle);
runSingle();
