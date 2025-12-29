"use strict";

const deg2rad = d => d * Math.PI / 180;

// ================= Physics =================
function simulate(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const dt = 0.01;
  const g = 9.80665;
  const cupR = 0.054;

  // Rolling resistance (approx)
  const v0_stimp = 1.83;
  const s = Math.max(0.1, stimpFt * 0.3048);
  const aRoll = (v0_stimp * v0_stimp) / (2 * s);

  // Initial position (9 o'clock)
  let x = -D;
  let y = 0;

  // Initial speed
  const travel = Math.max(0.05, D + Dover);
  const v0 = Math.sqrt(2 * aRoll * travel);

  // Aim direction (+X rotated by alpha)
  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  // Slope: θ>0 → -Y is lower
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

function drawMany(sims, D, title) {

  const rect = cv.getBoundingClientRect();
  const w = Math.max(320, rect.width | 0);
  const h = Math.max(320, rect.height | 0);
  cv.width = w;
  cv.height = h;

  ctx.clearRect(0, 0, w, h);

  const scale = Math.min(w, h) / (2 * (D + 1.5));
  const cx = w / 2, cy = h / 2;

  // Guides
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
  ctx.moveTo(0, cy); ctx.lineTo(w, cy);
  ctx.stroke();

  // Cup
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Paths
  sims.forEach((sim, i) => {
    ctx.strokeStyle = sim.holed ? "#00ff66" : "#ffffff";
    ctx.globalAlpha = (i === Math.floor(sims.length / 2)) ? 1 : 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    sim.path.forEach((p, k) => {
      const px = cx + p.x * scale;
      const py = cy - p.y * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Start ball
  const b0 = sims[0].path[0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx + b0.x * scale, cy - b0.y * scale, 6, 0, Math.PI * 2);
  ctx.fill();

  // Stops
  sims.forEach(sim => {
    ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
    ctx.beginPath();
    ctx.arc(cx + sim.stop.x * scale, cy - sim.stop.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (title) {
    ctx.fillStyle = "#fff";
    ctx.fillText(title, 10, 20);
  }
}

// ================= UI =================
function getInputs() {
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
  const i = getInputs();
  const sim = simulate(i.D, i.theta, i.S, i.alpha, i.Dover);
  drawMany([sim], i.D, "単発");
}

function runSweep(stepType) {
  const i = getInputs();
  let values, sims;

  if (stepType === "alpha") {
    values = makeValues(i.alpha, 1.0);
    sims = values.map(v => simulate(i.D, i.theta, i.S, v, i.Dover));
  }
  if (stepType === "theta") {
    values = makeValues(i.theta, 0.5);
    sims = values.map(v => simulate(i.D, v, i.S, i.alpha, i.Dover));
  }
  if (stepType === "dover") {
    values = makeValues(i.Dover, 0.25);
    sims = values.map(v => simulate(i.D, i.theta, i.S, i.alpha, v));
  }

  drawMany(sims, i.D, stepType);
}

// Events
run.onclick = runSingle;
runAlpha5.onclick = () => runSweep("alpha");
runTheta5.onclick = () => runSweep("theta");
runDover5.onclick = () => runSweep("dover");

reset.onclick = () => {
  D.value = 3.0;
  theta.value = 2.0;
  S.value = 9.0;
  alpha.value = 0.0;
  Dover.value = 0.5;
  showMinus.checked = true;
  showPlus.checked = true;
  runSingle();
};

runSingle();