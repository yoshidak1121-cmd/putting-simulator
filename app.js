"use strict";

const deg2rad = d => d * Math.PI / 180;

// ================= Physics =================
// 座標：カップ中心=(0,0)
// +Y=12時、-Y=6時、+X=3時、-X=9時
// 初期位置：9時（-D,0）
// 傾斜：θ>0 のとき -Y 方向が低い（-Yへ加速）
function simulate(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const dt = 0.01;
  const g = 9.80665;
  const cupR = 0.054; // 5.4cm（簡易カップイン判定）

  // Rolling resistance (approx from Stimp)
  const v0_stimp = 1.83;
  const s = Math.max(0.1, stimpFt * 0.3048);
  const aRoll = (v0_stimp * v0_stimp) / (2 * s);

  // Initial position (9 o'clock)
  let x = -D;
  let y = 0;

  // Initial speed: level green travel approx D + Dover
  const travel = Math.max(0.05, D + Dover);
  const v0 = Math.sqrt(2 * aRoll * travel);

  // Aim direction: +X rotated by alpha
  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  // Slope accel: θ>0 => -Y is down
  const theta = deg2rad(thetaDeg);
  const aSlopeY = -g * Math.tan(theta);

  const path = [{ x, y }];
  let holed = false;

  for (let t = 0; t < 12; t += dt) {

    const v = Math.hypot(vx, vy);
    if (v < 0.03) break;

    // rolling decel opposite velocity
    const ax = -aRoll * vx / (v + 1e-9);
    const ay = -aRoll * vy / (v + 1e-9) + aSlopeY;

    // integrate
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    if (path.length % 2 === 0) path.push({ x, y });

    // cup-in detection (simple)
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

function setupCanvasSize() {
  // iPhoneで0になるのを避ける
  const rect = cv.getBoundingClientRect();
  const w = Math.max(320, (rect.width | 0));
  const h = Math.max(320, (rect.height | 0));
  cv.width = w;
  cv.height = h;
  return { w, h };
}

function drawMany(sims, D, title) {

  const { w, h } = setupCanvasSize();
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // scale: fit roughly (D + margin)
  const range = Math.max(1.0, D + 1.5);
  const scale = Math.min(w, h) / (2 * range);

  // Guides
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
  ctx.moveTo(0, cy); ctx.lineTo(w, cy);
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

  // Cup (red)
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Paths
  const centerIdx = Math.floor(sims.length / 2);
  sims.forEach((sim, i) => {
    ctx.save();
    ctx.globalAlpha = (i === centerIdx) ? 1.0 : 0.55;
    ctx.strokeStyle = sim.holed ? "#00ff66" : "#ffffff";
    ctx.lineWidth = 3;

    ctx.beginPath();
    sim.path.forEach((p, k) => {
      const px = cx + p.x * scale;
      const py = cy - p.y * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  });

  // Ball start (white)
  const b0 = sims[0].path[0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx + b0.x * scale, cy - b0.y * scale, 6, 0, Math.PI * 2);
  ctx.fill();

  // Stop points (yellow / green if holed)
  sims.forEach(sim => {
    ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
    ctx.beginPath();
    ctx.arc(cx + sim.stop.x * scale, cy - sim.stop.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Title
  if (title) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "14px system-ui, -apple-system, 'Yu Gothic', 'Meiryo', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, 10, 10);
  }
}

// ================= UI =================
function getInputs() {
  return {
    D: +document.getElementById("D").value,
    theta: +document.getElementById("theta").value,
    S: +document.getElementById("S").value,
    alpha: +document.getElementById("alpha").value,
    Dover: +document.getElementById("Dover").value
  };
}

function makeValues(center, step) {
  const showMinus = document.getElementById("showMinus").checked;
  const showPlus  = document.getElementById("showPlus").checked;

  const ks = [];
  if (showMinus) ks.push(-2, -1);
  ks.push(0);
  if (showPlus) ks.push(1, 2);

  return ks.map(k => center + k * step);
}

function formatStops(values, sims, label) {
  const rows = sims.map((sim, i) => {
    const v = values[i];
    const tag = sim.holed ? "IN" : "--";
    return `${label}=${v} : stop x=${sim.stop.x.toFixed(3)}m, y=${sim.stop.y.toFixed(3)}m [${tag}]`;
  });
  return rows.join("\n");
}

function runSingle() {
  const i = getInputs();
  const sim = simulate(i.D, i.theta, i.S, i.alpha, i.Dover);
  drawMany([sim], i.D, "単発");
  document.getElementById("result").textContent =
`座標：カップ中心(0,0) / ボール初期=9時(-D,0)
傾斜：θ>0 で -Y が低い
入力: D=${i.D}, θ=${i.theta}, S=${i.S}, α=${i.alpha}, Dover=${i.Dover}
結果: stop x=${sim.stop.x.toFixed(3)}m, y=${sim.stop.y.toFixed(3)}m, holed=${sim.holed}`;
}

function runSweep(type) {
  const i = getInputs();
  let values = [];
  let sims = [];

  if (type === "alpha") {
    values = makeValues(i.alpha, 1.0);
    sims = values.map(v => simulate(i.D, i.theta, i.S, v, i.Dover));
    drawMany(sims, i.D, "α sweep (±2 step, 1°)");
    document.getElementById("result").textContent =
`α sweep（中心±2ステップ、1°刻み）
${formatStops(values, sims, "α")}`;
  }

  if (type === "theta") {
    values = makeValues(i.theta, 0.5);
    sims = values.map(v => simulate(i.D, v, i.S, i.alpha, i.Dover));
    drawMany(sims, i.D, "θ sweep (±2 step, 0.5°)");
    document.getElementById("result").textContent =
`θ sweep（中心±2ステップ、0.5°刻み）
${formatStops(values, sims, "θ")}`;
  }

  if (type === "dover") {
    values = makeValues(i.Dover, 0.25);
    sims = values.map(v => simulate(i.D, i.theta, i.S, i.alpha, v));
    drawMany(sims, i.D, "Dover sweep (±2 step, 0.25m)");
    document.getElementById("result").textContent =
`Dover sweep（中心±2ステップ、0.25m刻み）
${formatStops(values, sims, "Dover")}`;
  }
}

// ================= Events =================
document.getElementById("run").onclick = runSingle;
document.getElementById("runAlpha5").onclick = () => runSweep("alpha");
document.getElementById("runTheta5").onclick = () => runSweep("theta");
document.getElementById("runDover5").onclick = () => runSweep("dover");

document.getElementById("reset").onclick = () => {
  document.getElementById("D").value = "3.0";
  document.getElementById("theta").value = "2.0";
  document.getElementById("S").value = "9.0";
  document.getElementById("alpha").value = "0.0";
  document.getElementById("Dover").value = "0.5";
  document.getElementById("showMinus").checked = true;
  document.getElementById("showPlus").checked = true;
  runSingle();
};

// 画面回転などでサイズが変わるとキャンバスが崩れることがあるため再描画
window.addEventListener("resize", () => {
  clearTimeout(window.__rto);
  window.__rto = setTimeout(runSingle, 120);
});

// 初期描画
runSingle();