"use strict";

const CUP = 0.108; // 1 cup = 10.8cm
const deg2rad = d => d * Math.PI / 180;

// ================= Physics =================
function simulate(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const dt = 0.01;
  const g = 9.80665;
  const cupR = CUP / 2;

  // rolling resistance (approx)
  const v0_stimp = 1.83;
  const s = Math.max(0.1, stimpFt * 0.3048);
  const aRoll = (v0_stimp ** 2) / (2 * s);

  // initial position (9 o'clock)
  let x = -D;
  let y = 0;

  // initial speed
  const travel = Math.max(0.05, D + Dover);
  const v0 = Math.sqrt(2 * aRoll * travel);

  // direction (+X rotated by alpha)
  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  // slope: θ>0 → -Y is down
  const theta = deg2rad(thetaDeg);
  const aSlopeY = -g * Math.tan(theta);

  const path = [{ x, y }];
  let holed = false;

  for (let t = 0; t < 12; t += dt) {
    const v = Math.hypot(vx, vy);
    if (v < 0.03) break;

    const ax = -aRoll * vx / (v + 1e-9);
    const ay = -aRoll * vy / (v + 1e-9) + aSlopeY;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    if (path.length % 2 === 0) path.push({ x, y });

    if (Math.hypot(x, y) <= cupR) {
      holed = true;
      path.push({ x, y });
      break;
    }
  }
  return { path, stop: { x, y }, holed };
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

  // ---- X axis (meters) ----
  const xMin = -(D + 1);
  const xMax = Dover + 1;

  // ---- Y axis (cups) ----
  let yMin = Infinity, yMax = -Infinity;
  sims.forEach(sim =>
    sim.path.forEach(p => {
      yMin = Math.min(yMin, p.y / CUP);
      yMax = Math.max(yMax, p.y / CUP);
    })
  );

  let yLo = Math.floor(yMin) - 1;
  let yHi = Math.ceil(yMax) + 1;

  // minimum ±2 cups
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

  // ---- Grid ----
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;

  // X grid (1m)
  for (let xm = Math.ceil(xMin); xm <= xMax; xm++) {
    const px = tx(xm);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  // Y grid (1 cup)
  for (let yc = yLo; yc <= yHi; yc++) {
    const py = ty(yc);
    ctx.lineWidth = (yc === 0) ? 2 : (Math.abs(yc) === 1 ? 1.5 : 1);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }

  // ---- Cup ----
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), 7, 0, Math.PI * 2);
  ctx.fill();

  // ---- Paths ----
  sims.forEach((sim, i) => {
    ctx.strokeStyle = sim.holed ? "#00ff66" : "#ffffff";
    ctx.globalAlpha = (i === Math.floor(sims.length / 2)) ? 1 : 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    sim.path.forEach((p, k) => {
      const px = tx(p.x);
      const py = ty(p.y / CUP);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ---- Start ball ----
  const b0 = sims[0].path[0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(tx(b0.x), ty(b0.y / CUP), 6, 0, Math.PI * 2);
  ctx.fill();

  // ---- Stops ----
  sims.forEach(sim => {
    ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
    ctx.beginPath();
    ctx.arc(tx(sim.stop.x), ty(sim.stop.y / CUP), 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // title
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
  const sim = simulate(i.D, i.theta, i.S, i.alpha, i.Dover);
  drawMany([sim], i.D, i.Dover, "単発");
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

// events
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