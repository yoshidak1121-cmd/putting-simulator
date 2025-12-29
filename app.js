"use strict";

const CUP = 0.108;
const deg2rad = d => d * Math.PI / 180;

// ================= Physics =================

// スティンプから一定減速度 aRoll を計算
function computeARoll(stimpFt) {
  const v_stimp = 1.83;                 // スティンプメーター初速
  const s = stimpFt * 0.3048;           // ft → m
  return (v_stimp ** 2) / (2 * s);      // 一定減速度
}

// 初速 v0 を「D + Dover」から直接計算（一定減速度モデル）
function computeInitialV0(D, Dover, aRoll, thetaDeg) {
  const L = D + Dover;                  // 合計停止距離
  const g = 9.80665;
  const theta = deg2rad(thetaDeg);

  // 傾斜方向の重力成分（上りを正とする）
  const a_g = g * Math.sin(theta);

  // 有効減速度（上り：強く、下り：弱く）
  const aEff = aRoll + a_g;

  if (aEff <= 0) return 0.1;            // 下りが強すぎる場合の保険

  return Math.sqrt(2 * aEff * L);
}

// 一定減速度モデルで2Dシミュレーション
function simulate2D(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const aRoll = computeARoll(stimpFt);
  const v0 = computeInitialV0(D, Dover, aRoll, thetaDeg);

  const dt = 0.01;
  const g = 9.80665;

  // 初期位置（カップを原点とし、打ち出し位置は -D）
  let x = -D;
  let y = 0;

  // 初速ベクトル
  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);

  // 傾斜の重力成分（Y方向）
  const theta = deg2rad(thetaDeg);
  const aSlopeY = -g * Math.sin(theta);

  const path = [{ x, y }];
  let holed = false;

  for (let t = 0; t < 10; t += dt) {

    const v = Math.hypot(vx, vy);
    if (v < 0.01) break;

    // 一定減速度モデル：速度方向に aRoll の抵抗
    const ax = -aRoll * (vx / v);
    const ay = -aRoll * (vy / v) + aSlopeY;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    path.push({ x, y });

    // カップイン判定
    if (Math.hypot(x, y) <= CUP / 2) {
      holed = true;
      break;
    }
  }

  return { path, stop: { x, y }, holed, v0, aRoll };
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

  // 軸の範囲
  const xMin = -(D + 1);
  const xMax = Dover + 1;

  let yMin = -2, yMax = 2;

  const sx = w / (xMax - xMin);
  const sy = h / (yMax - yMin);

  const tx = x => (x - xMin) * sx;
  const ty = yCup => h - (yCup - yMin) * sy;

  // グリッド
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let xm = Math.ceil(xMin); xm <= xMax; xm++) {
    ctx.beginPath();
    ctx.moveTo(tx(xm), 0);
    ctx.lineTo(tx(xm), h);
    ctx.stroke();
  }

  for (let yc = yMin; yc <= yMax; yc++) {
    ctx.beginPath();
    ctx.moveTo(0, ty(yc));
    ctx.lineTo(w, ty(yc));
    ctx.stroke();
  }

  // カップ
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), 7, 0, Math.PI * 2);
  ctx.fill();

  // 軌跡
  sims.forEach(sim => {
    ctx.strokeStyle = sim.holed ? "#00ff66" : "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    sim.path.forEach((p, i) => {
      const px = tx(p.x);
      const py = ty(p.y / CUP);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 停止点
    ctx.fillStyle = sim.holed ? "#00ff66" : "#ffd400";
    ctx.beginPath();
    ctx.arc(tx(sim.stop.x), ty(sim.stop.y / CUP), 5, 0, Math.PI * 2);
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
    `初速 v0: ${sim.v0.toFixed(3)} m/s\n\n` +
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

run.onclick = runSingle;

reset.onclick = () => {
  D.value = 3; theta.value = 2; S.value = 9; alpha.value = 0; Dover.value = 0.5;
  runSingle();
};

window.addEventListener("resize", runSingle);
runSingle();
