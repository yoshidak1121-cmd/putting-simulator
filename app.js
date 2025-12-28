"use strict";

const deg2rad = d => d * Math.PI / 180;

function simulate(D, thetaDeg, S, alphaDeg, Dover) {
  const g = 9.81;
  const theta = deg2rad(thetaDeg);
  const aSlopeX = g * Math.tan(theta);

  const v0_stimp = 1.83;
  const s = Math.max(0.1, S * 0.3048);
  const aRoll = v0_stimp * v0_stimp / (2 * s);

  const v0 = Math.sqrt(2 * aRoll * (D + Dover));

  let x = 0;
  let y = D;

  let vx = v0 * Math.sin(deg2rad(alphaDeg));
  let vy = -v0 * Math.cos(deg2rad(alphaDeg));

  const path = [{ x, y }];
  const dt = 0.01;

  for (let t = 0; t < 12; t += dt) {
    const v = Math.hypot(vx, vy);
    if (v < 0.03 && Math.abs(aSlopeX) <= aRoll) break;

    const ax = -aRoll * vx / (v + 1e-9) + aSlopeX;
    const ay = -aRoll * vy / (v + 1e-9);

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    path.push({ x, y });
  }

  return { path, stop: { x, y } };
}

function draw(sim) {
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");

  cv.width = cv.clientWidth;
  cv.height = cv.clientHeight;

  ctx.clearRect(0, 0, cv.width, cv.height);

  const scale = 60;

  // 軌跡
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  sim.path.forEach((p, i) => {
    const px = cv.width / 2 + p.x * scale;
    const py = cv.height / 2 - p.y * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // カップ
  ctx.fillStyle = "#00ffcc";
  ctx.beginPath();
  ctx.arc(cv.width / 2, cv.height / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // 停止点
  const sp = sim.stop;
  ctx.fillStyle = "#ff4444";
  ctx.beginPath();
  ctx.arc(
    cv.width / 2 + sp.x * scale,
    cv.height / 2 - sp.y * scale,
    5, 0, Math.PI * 2
  );
  ctx.fill();
}

function run() {
  const D = parseFloat(document.getElementById("D").value);
  const theta = parseFloat(document.getElementById("theta").value);
  const S = parseFloat(document.getElementById("S").value);
  const alpha = parseFloat(document.getElementById("alpha").value);
  const Dover = parseFloat(document.getElementById("Dover").value);

  const sim = simulate(D, theta, S, alpha, Dover);
  draw(sim);
}

document.getElementById("run").onclick = run;
document.getElementById("reset").onclick = () => location.reload();

run();