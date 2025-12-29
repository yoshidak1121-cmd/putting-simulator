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
const resetViewOnly = document.getElementById("resetViewOnly");
const btnRunAlpha5 = document.getElementById("runAlpha5");
const btnRunTheta5 = document.getElementById("runTheta5");
const btnRunDover5 = document.getElementById("runDover5");

const result    = document.getElementById("result");

// ================= Viewport (パン・ズーム・軸ドラッグ用) =================
let view = {
  xMin: -1,
  xMax: 5,
  yMin: -0.3,
  yMax: 0.3,
  initialized: false
};

let isDragging = false;
let dragMode = null;   // "pan", "xMin", "xMax", "yMin", "yMax"
let lastMouse = { x: 0, y: 0 };

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
        holed = true;
      }
    }

    path.push({ x, y });
    tStop = t;
  }

  return { path, stop: { x, y }, holed, v0, aRoll, tStop, vCup, cupIndex };
}

// ================= Drawing =================

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function setupCanvas() {
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(300, Math.floor(r.width));
  cv.height = Math.max(200, Math.floor(r.height));
}

// 逆変換（ピクセル -> 物理座標）
function tx_inv(px, w) {
  return view.xMin + px * (view.xMax - view.xMin) / w;
}
function ty_inv(py, h) {
  return view.yMin + (h - py) * (view.yMax - view.yMin) / h;
}

// 軸端ヒットテスト（px,py はキャンバス座標）
function hitTestAxis(px, py, w, h) {
  // 一時的な tx/ty を作る
  const tx_local = x => (x - view.xMin) * (w / (view.xMax - view.xMin));
  const ty_local = y => h - (y - view.yMin) * (h / (view.yMax - view.yMin));

  const xMinPx = tx_local(view.xMin);
  const xMaxPx = tx_local(view.xMax);
  const yMinPx = ty_local(view.yMin);
  const yMaxPx = ty_local(view.yMax);

  const margin = 8; // ピクセル

  if (Math.abs(px - xMinPx) < margin) return "xMin";
  if (Math.abs(px - xMaxPx) < margin) return "xMax";
  if (Math.abs(py - yMinPx) < margin) return "yMin";
  if (Math.abs(py - yMaxPx) < margin) return "yMax";

  return null;
}

// 自動初期ビュー（最初の一回だけ）
function autoInitViewFromInputs() {
  const i = getI();
  const A = CUP / 2;

  const xMin = -1;
  const xMaxCandidate = Math.max(1, i.Dover + 1, i.D + i.Dover + 1);
  const xMax = Math.ceil(xMaxCandidate);

  const yMax = Math.max(5 * A, 0 + A);
  const yMin = Math.min(-5 * A, 0 - A);

  view.xMin = xMin;
  view.xMax = xMax;
  view.yMin = yMin;
  view.yMax = yMax;
  view.initialized = true;
}

// drawMany: view 対応版
function drawMany(sims, D, Dover, title, showLegend = false) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const A = CUP / 2;

  // --- 座標変換（ボールを原点に） ---
  sims.forEach(sim => {
    sim.path2 = sim.path.map(p => ({
      x: p.x + D,
      y: p.y
    }));
    sim.stop2 = {
      x: sim.stop.x + D,
      y: sim.stop.y
    };
  });

  // --- view をそのまま使用 ---
  const xMin = view.xMin;
  const xMax = view.xMax;
  const yMin = view.yMin;
  const yMax = view.yMax;

  // 防御: view が逆転していたら修正
  if (xMax <= xMin + 1e-6) {
    view.xMax = view.xMin + 1;
  }
  if (yMax <= yMin + 1e-6) {
    view.yMax = view.yMin + 1;
  }

  // 等倍スケール（XとYで同じm/pixel比）
  const rangeX = view.xMax - view.xMin;
  const rangeY = view.yMax - view.yMin;
  const scale = Math.min(w / rangeX, h / rangeY);
  
  const sx = scale;
  const sy = scale;

  const tx = x => (x - view.xMin) * sx;
  const ty = y => h - (y - view.yMin) * sy;

  // 背景クリア（必要なら色を変える）
  ctx.clearRect(0, 0, w, h);

  // --- グリッド（X：1m刻み） ---
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  const xmStart = Math.ceil(view.xMin);
  const xmEnd = Math.floor(view.xMax);
  for (let xm = xmStart; xm <= xmEnd; xm++) {
    ctx.beginPath();
    ctx.moveTo(tx(xm), 0);
    ctx.lineTo(tx(xm), h);
    ctx.stroke();
  }

  // --- グリッド（Y：1m刻み） ---
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  const ymStart = Math.ceil(view.yMin);
  const ymEnd = Math.floor(view.yMax);
  for (let ym = ymStart; ym <= ymEnd; ym++) {
    ctx.beginPath();
    ctx.moveTo(0, ty(ym));
    ctx.lineTo(w, ty(ym));
    ctx.stroke();
  }

  // --- 基準線（X/Y軸） ---
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;

  // X軸 (y=0)
  ctx.beginPath();
  ctx.moveTo(0, ty(0));
  ctx.lineTo(w, ty(0));
  ctx.stroke();

  // Y軸 (x=0)
  ctx.beginPath();
  ctx.moveTo(tx(0), 0);
  ctx.lineTo(tx(0), h);
  ctx.stroke();

  // --- ボール（ゴルフボール風・実寸） ---
  const BALL_DIAM = 0.04267;
  const BALL_R = BALL_DIAM / 2;
  const rBall = BALL_R * sy;

  // ゴルフボールのベース
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), Math.max(2, rBall), 0, Math.PI * 2);
  ctx.fill();
  
  // ゴルフボールのディンプル（くぼみ）パターン
  if (rBall >= 3) {
    ctx.fillStyle = "rgba(200,200,200,0.3)";
    const dimpleR = rBall / 5;
    const dimples = [
      [0, -rBall * 0.4],
      [-rBall * 0.35, -rBall * 0.2],
      [rBall * 0.35, -rBall * 0.2],
      [-rBall * 0.35, rBall * 0.2],
      [rBall * 0.35, rBall * 0.2],
      [0, rBall * 0.4]
    ];
    dimples.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(tx(0) + dx, ty(0) + dy, Math.max(1, dimpleR), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  // ボールの輪郭
  ctx.strokeStyle = "rgba(150,150,150,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), Math.max(2, rBall), 0, Math.PI * 2);
  ctx.stroke();

  // --- カップ（ゴルフカップ風・実寸） ---
  const rCup = A * sy;
  
  // カップの外側（縁）
  ctx.fillStyle = "#888888";
  ctx.beginPath();
  ctx.arc(tx(D), ty(0), Math.max(2, rCup * 1.05), 0, Math.PI * 2);
  ctx.fill();
  
  // カップの内側（黒い穴）
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(tx(D), ty(0), Math.max(2, rCup), 0, Math.PI * 2);
  ctx.fill();
  
  // カップの影（深さの表現）
  const gradient = ctx.createRadialGradient(tx(D), ty(0), 0, tx(D), ty(0), rCup);
  gradient.addColorStop(0, "rgba(0,0,0,0.9)");
  gradient.addColorStop(0.7, "rgba(0,0,0,0.6)");
  gradient.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(tx(D), ty(0), Math.max(2, rCup), 0, Math.PI * 2);
  ctx.fill();

  // --- 軌跡 ---
  sims.forEach((sim, idx) => {
    const colorBefore = sim.color || "#ffffff";
    const colorAfter = "#00ff66";

    ctx.lineWidth = idx === 0 ? 3 : 2;

    // カップ前
    ctx.strokeStyle = colorBefore;
    ctx.beginPath();
    sim.path2.forEach((p, i) => {
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
      sim.path2.forEach((p, i) => {
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
    ctx.arc(tx(sim.stop2.x), ty(sim.stop2.y), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- タイトル ---
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.fillText(title, 10, 14);

  // --- Legend (凡例) ---
  if (showLegend && sims.length > 1) {
    const legendX = 10;
    const legendY = 30;
    const lineLen = 30;
    const lineSpacing = 20;
    
    ctx.font = "11px sans-serif";
    
    // Center line
    ctx.strokeStyle = sims[0].color || "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY);
    ctx.lineTo(legendX + lineLen, legendY);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText("中心線", legendX + lineLen + 6, legendY + 4);
    
    // Difference lines
    if (sims.length > 1) {
      const diffColor = sims[1].color || "#66ccff";
      ctx.strokeStyle = diffColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(legendX, legendY + lineSpacing);
      ctx.lineTo(legendX + lineLen, legendY + lineSpacing);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText("±差分", legendX + lineLen + 6, legendY + lineSpacing + 4);
    }
  }

  // --- 軸端ハンドル表示（視覚的に掴めるように） ---
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const handleSize = 6;
  // xMin handle
  ctx.fillRect(tx(view.xMin) - handleSize/2, h - 18, handleSize, 12);
  // xMax handle
  ctx.fillRect(tx(view.xMax) - handleSize/2, h - 18, handleSize, 12);
  // yMin handle
  ctx.fillRect(4, ty(view.yMin) - handleSize/2, 12, handleSize);
  // yMax handle
  ctx.fillRect(4, ty(view.yMax) - handleSize/2, 12, handleSize);
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

  // 初回は自動で view を初期化
  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sim = simulate2D(i.D, i.theta, i.S, i.alpha, i.Dover);

  drawMany([sim], i.D, i.Dover, "単発", false);

  // ボール原点座標系に変換して表示
  const stopX_display = sim.stop.x + i.D;
  const stopY_display = sim.stop.y;
  const stopDist = Math.hypot(sim.stop.x, sim.stop.y);

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
    `停止位置 X（ボール原点）: ${stopX_display.toFixed(3)} m\n` +
    `停止位置 Y（ボール原点）: ${stopY_display.toFixed(3)} m\n` +
    `停止距離（カップ中心から）: ${stopDist.toFixed(3)} m\n` +
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
    sim.alphaValue = a;
    sim.delta = d;
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `α 5本 (中心 ${baseAlpha}°)`, true);

  // テーブル形式で結果を表示
  let html = `<strong>α 5本比較（中心 ${baseAlpha}°）</strong>\n\n`;
  html += `<table>`;
  html += `<tr><th>α [°]</th><th>Δα</th><th>入った</th><th>vCup [m/s]</th><th>停止X [m]</th><th>停止Y [m]</th><th>カップ中心距離 [m]</th></tr>`;
  
  sims.forEach((sim) => {
    const stopX = sim.stop.x + i.D;
    const stopY = sim.stop.y;
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    const holedText = sim.holed ? "○" : "×";
    const vCupText = sim.vCup !== null ? sim.vCup.toFixed(3) : "-";
    
    html += `<tr>`;
    html += `<td>${sim.alphaValue.toFixed(1)}</td>`;
    html += `<td>${sim.delta > 0 ? '+' : ''}${sim.delta.toFixed(1)}</td>`;
    html += `<td>${holedText}</td>`;
    html += `<td>${vCupText}</td>`;
    html += `<td>${stopX.toFixed(3)}</td>`;
    html += `<td>${stopY.toFixed(3)}</td>`;
    html += `<td>${distCup.toFixed(3)}</td>`;
    html += `</tr>`;
  });
  
  html += `</table>`;
  result.innerHTML = html;
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
    sim.thetaValue = th;
    sim.delta = d;
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `θ 5本 (中心 ${baseTheta}°)`, true);

  // テーブル形式で結果を表示
  let html = `<strong>θ 5本比較（中心 ${baseTheta}°）</strong>\n\n`;
  html += `<table>`;
  html += `<tr><th>θ [°]</th><th>Δθ</th><th>入った</th><th>vCup [m/s]</th><th>停止X [m]</th><th>停止Y [m]</th><th>カップ中心距離 [m]</th></tr>`;
  
  sims.forEach((sim) => {
    const stopX = sim.stop.x + i.D;
    const stopY = sim.stop.y;
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    const holedText = sim.holed ? "○" : "×";
    const vCupText = sim.vCup !== null ? sim.vCup.toFixed(3) : "-";
    
    html += `<tr>`;
    html += `<td>${sim.thetaValue.toFixed(1)}</td>`;
    html += `<td>${sim.delta > 0 ? '+' : ''}${sim.delta.toFixed(1)}</td>`;
    html += `<td>${holedText}</td>`;
    html += `<td>${vCupText}</td>`;
    html += `<td>${stopX.toFixed(3)}</td>`;
    html += `<td>${stopY.toFixed(3)}</td>`;
    html += `<td>${distCup.toFixed(3)}</td>`;
    html += `</tr>`;
  });
  
  html += `</table>`;
  result.innerHTML = html;
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
    sim.doverValue = DoverVal;
    sim.delta = d;
    sims.push(sim);
  });

  drawMany(sims, i.D, baseDover + 0.5, `Dover 5本 (中心 ${baseDover} m)`, true);

  // テーブル形式で結果を表示
  let html = `<strong>Dover 5本比較（中心 ${baseDover} m）</strong>\n\n`;
  html += `<table>`;
  html += `<tr><th>Dover [m]</th><th>ΔDover</th><th>入った</th><th>vCup [m/s]</th><th>停止X [m]</th><th>停止Y [m]</th><th>カップ中心距離 [m]</th></tr>`;
  
  sims.forEach((sim) => {
    const stopX = sim.stop.x + i.D;
    const stopY = sim.stop.y;
    const distCup = Math.hypot(sim.stop.x, sim.stop.y);
    const holedText = sim.holed ? "○" : "×";
    const vCupText = sim.vCup !== null ? sim.vCup.toFixed(3) : "-";
    
    html += `<tr>`;
    html += `<td>${sim.doverValue.toFixed(2)}</td>`;
    html += `<td>${sim.delta > 0 ? '+' : ''}${sim.delta.toFixed(2)}</td>`;
    html += `<td>${holedText}</td>`;
    html += `<td>${vCupText}</td>`;
    html += `<td>${stopX.toFixed(3)}</td>`;
    html += `<td>${stopY.toFixed(3)}</td>`;
    html += `<td>${distCup.toFixed(3)}</td>`;
    html += `</tr>`;
  });
  
  html += `</table>`;
  result.innerHTML = html;
}

// ================= Mouse / Interaction =================

// mousedown
cv.addEventListener("mousedown", e => {
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const hit = hitTestAxis(px, py, cv.width, cv.height);

  if (hit) {
    dragMode = hit;   // 軸端ドラッグ
  } else {
    dragMode = "pan"; // パン
  }

  isDragging = true;
  lastMouse.x = px;
  lastMouse.y = py;

  // 視覚的ヒント: カーソル変更
  if (dragMode === "pan") cv.style.cursor = "grabbing";
  else cv.style.cursor = "ew-resize";
});

// mousemove
cv.addEventListener("mousemove", e => {
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  // ホバー時のカーソル変更（軸端に近ければハンドル）
  if (!isDragging) {
    const hit = hitTestAxis(px, py, cv.width, cv.height);
    if (hit === "xMin" || hit === "xMax") cv.style.cursor = "ew-resize";
    else if (hit === "yMin" || hit === "yMax") cv.style.cursor = "ns-resize";
    else cv.style.cursor = "default";
    return;
  }

  if (!isDragging) return;

  const dx = px - lastMouse.x;
  const dy = py - lastMouse.y;

  const scaleX = (view.xMax - view.xMin) / cv.width;
  const scaleY = (view.yMax - view.yMin) / cv.height;

  if (dragMode === "pan") {
    view.xMin -= dx * scaleX;
    view.xMax -= dx * scaleX;
    view.yMin += dy * scaleY;
    view.yMax += dy * scaleY;
  } else if (dragMode === "xMin") {
    view.xMin = tx_inv(px, cv.width);
    // 最低幅を確保
    if (view.xMax - view.xMin < 0.1) view.xMin = view.xMax - 0.1;
  } else if (dragMode === "xMax") {
    view.xMax = tx_inv(px, cv.width);
    if (view.xMax - view.xMin < 0.1) view.xMax = view.xMin + 0.1;
  } else if (dragMode === "yMin") {
    view.yMin = ty_inv(py, cv.height);
    if (view.yMax - view.yMin < 0.01) view.yMin = view.yMax - 0.01;
  } else if (dragMode === "yMax") {
    view.yMax = ty_inv(py, cv.height);
    if (view.yMax - view.yMin < 0.01) view.yMax = view.yMin + 0.01;
  }

  lastMouse.x = px;
  lastMouse.y = py;

  runSingle(); // 再描画
});

// mouseup / mouseleave
const endDrag = () => {
  isDragging = false;
  dragMode = null;
  cv.style.cursor = "default";
};
cv.addEventListener("mouseup", endDrag);
cv.addEventListener("mouseleave", endDrag);

// wheel (ズーム)
cv.addEventListener("wheel", e => {
  e.preventDefault();

  // ズーム係数（微調整可能）
  const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;

  // マウス位置を中心にズーム
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const mx = tx_inv(px, cv.width);
  const my = ty_inv(py, cv.height);

  view.xMin = mx + (view.xMin - mx) * zoomFactor;
  view.xMax = mx + (view.xMax - mx) * zoomFactor;
  view.yMin = my + (view.yMin - my) * zoomFactor;
  view.yMax = my + (view.yMax - my) * zoomFactor;

  runSingle();
}, { passive: false });

// ================= Wiring UI =================

run.onclick = runSingle;
reset.onclick = () => {
  D.value = 3;
  theta.value = 0;
  S.value = 9;
  alpha.value = 0;
  Dover.value = 0.5;
  // リセット時は view を自動初期化する
  view.initialized = false;
  runSingle();
};

resetViewOnly.onclick = () => {
  // 入力値はそのまま、view だけリセット
  view.initialized = false;
  autoInitViewFromInputs();
  runSingle();
};

btnRunAlpha5.onclick = runAlpha5;
btnRunTheta5.onclick = runTheta5;
btnRunDover5.onclick = runDover5;

window.addEventListener("resize", () => {
  // リサイズ時はキャンバスサイズを更新して再描画（view は維持）
  runSingle();
});

// 初回実行
runSingle();
