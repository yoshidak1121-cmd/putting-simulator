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

  // 傾斜角 θ > 0 は -Y方向の下り坂 → a_g < 0
  const a_g = -g * Math.sin(theta);

  // 有効減速度（上り：強く、下り：弱く）
  const aEff = aRoll + a_g;

  if (aEff <= 0) return 0.1;            // 下りが強すぎる場合の保険

  return Math.sqrt(2 * aEff * L);
}

// 一定減速度モデルで2Dシミュレーション
// 追加情報: tStop（停止まで時間）, vCup（カップ通過速度 or null）
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
  let tStop = 0;
  let vCup = null;

  // 必要な時間を見積もる（余裕 +2秒）
  const estimatedStopTime = v0 / aRoll;
  const maxTime = Math.max(10, estimatedStopTime + 2);

  for (let t = 0; t < maxTime; t += dt) {

    const v = Math.hypot(vx, vy);
    const ax = -aRoll * (vx / v);
    const ay = -aRoll * (vy / v) + aSlopeY;

    // 停止条件：速度が小さい or 加速度が小さい
    const aMag = Math.hypot(ax, ay);
    if (v < 0.01 || aMag < 0.01) {
      tStop = t;
      break;
    }

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    path.push({ x, y });

    // カップ通過判定（最初に通過したときの速度を記録）
    const r = Math.hypot(x, y);
    if (!holed && r <= CUP / 2) {
      holed = true;
      vCup = v;
      tStop = t;
      break;
    }

    tStop = t; // 通過しなくても最後の時刻を記録
  }

  return { path, stop: { x, y }, holed, v0, aRoll, tStop, vCup };
}

// ================= Drawing =================

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function setupCanvas() {
  const r = cv.getBoundingClientRect();
  cv.width = r.width;
  cv.height = r.height;
}

// sims: [{path, holed, stop, color?}, ...]
function drawMany(sims, D, Dover, title) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  // 全軌跡から x,y の最小・最大をとる（自動スケーリング）
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;

  sims.forEach(sim => {
    sim.path.forEach(p => {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    });
  });

  // 予備マージン
  const marginX = 0.5;
  const marginY = 0.5;

  xMin = Math.min(xMin, -D) - marginX;
  xMax = Math.max(xMax, Dover) + marginX;

  // y はカップ ±2cup 程度をデフォルトに
  const baseYMin = -2 * CUP;
  const baseYMax =  2 * CUP;
  yMin = Math.min(yMin, baseYMin) - marginY * CUP;
  yMax = Math.max(yMax, baseYMax) + marginY * CUP;

  // 最低幅確保
  if (xMax - xMin < 1) { xMin -= 0.5; xMax += 0.5; }
  if (yMax - yMin < 1 * CUP) { yMin -= 0.5 * CUP; yMax += 0.5 * CUP; }

  const sx = w / (xMax - xMin);
  const sy = h / (yMax - yMin);

  const tx = x => (x - xMin) * sx;
  const ty = yWorld => h - (yWorld - yMin) * sy;

  // グリッド（1m間隔）
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;

  const gridStartX = Math.ceil(xMin);
  const gridEndX   = Math.floor(xMax);
  for (let xm = gridStartX; xm <= gridEndX; xm++) {
    ctx.beginPath();
    ctx.moveTo(tx(xm), 0);
    ctx.lineTo(tx(xm), h);
    ctx.stroke();
  }

  const gridStartY = Math.ceil(yMin / CUP);
  const gridEndY   = Math.floor(yMax / CUP);
  for (let yc = gridStartY; yc <= gridEndY; yc++) {
    const yWorld = yc * CUP;
    ctx.beginPath();
    ctx.moveTo(0, ty(yWorld));
    ctx.lineTo(w, ty(yWorld));
    ctx.stroke();
  }

  // カップ
  ctx.fillStyle = "#e60000";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), 7, 0, Math.PI * 2);
  ctx.fill();

  // 軌跡たち
  sims.forEach((sim, idx) => {
    const color = sim.color || (sim.holed ? "#00ff66" : "#ffffff");
    ctx.strokeStyle = color;
    ctx.lineWidth = (idx === 0 ? 3 : 2);

    ctx.beginPath();
    sim.path.forEach((p, i) => {
      const px = tx(p.x);
      const py = ty(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 停止点
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx(sim.stop.x), ty(sim.stop.y), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
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

// 単発
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
    `停止までの時間 tStop: ${sim.tStop.toFixed(2)} s\n` +
    `カップ通過速度 vCup: ${sim.vCup !== null ? sim.vCup.toFixed(3) + " m/s" : "未通過"}\n\n` +
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

// α を中心 ±2度で 5 本比較（例）
function runAlpha5() {
  const i = getI();
  const sims = [];
  const baseAlpha = i.alpha;
  const deltas = [-2, -1, 0, 1, 2];

  deltas.forEach((d, idx) => {
    const a = baseAlpha + d;
    const sim = simulate2D(i.D, i.theta, i.S, a, i.Dover);
    sim.color = d === 0 ? "#00ff66" : "#66ccff";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `α 5本 (中心 ${baseAlpha}°)`);

  // 簡易「最適 α」：カップ中心に最も近く止まったもの
  let best = null;
  sims.forEach((sim, idx) => {
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, alpha: baseAlpha + deltas[idx] };
    }
  });

  result.textContent =
    `α 5本比較 (中心 ${baseAlpha}°)\n` +
    `最適っぽい α: ${best.alpha}° (カップ中心から ${best.dist.toFixed(3)} m)\n`;
}

// Dover を中心 ±0.5m で 5 本比較（例）
function runDover5() {
  const i = getI();
  const sims = [];
  const baseDover = i.Dover;
  const deltas = [-0.5, -0.25, 0, 0.25, 0.5];

  deltas.forEach((d, idx) => {
    const DoverVal = Math.max(0, baseDover + d);
    const sim = simulate2D(i.D, i.theta, i.S, i.alpha, DoverVal);
    sim.color = d === 0 ? "#ffdd33" : "#ffaa00";
    sims.push(sim);
  });

  drawMany(sims, i.D, baseDover + 0.5, `Dover 5本 (中心 ${baseDover} m)`);

  // カップを通過しつつ、停止距離ができるだけ小さいものを「安全な最適」とみなす
  let best = null;
  sims.forEach((sim, idx) => {
    const overDist = Math.hypot(sim.stop.x, sim.stop.y); // カップからの距離
    if (sim.holed) return; // カップインは別扱いにしたければここ調整
    if (!best || overDist < best.dist) {
      best = { sim, idx, dist: overDist, Dover: baseDover + deltas[idx] };
    }
  });

  result.textContent =
    `Dover 5本比較 (中心 ${baseDover} m)\n` +
    (best
      ? `最適っぽい Dover: ${best.Dover.toFixed(2)} m (カップ中心から ${best.dist.toFixed(3)} m)\n`
      : `有効な最適 Dover を見つけられませんでした\n`);
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

// ボタンID は HTML 側と合わせて調整してください
if (typeof alpha5 !== "undefined") alpha5.onclick = runAlpha5;
if (typeof Dover5 !== "undefined") Dover5.onclick = runDover5;
// θ 5本（傾斜比較）も同じパターンで追加可能

window.addEventListener("resize", runSingle);
runSingle();
