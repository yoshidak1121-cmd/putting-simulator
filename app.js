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

// 初速 v0 を「D + CUP/2 + Dover」から直接計算
// Dover はカップ縁（バックエッジ）からのオーバー距離
function computeInitialV0(D, Dover, aRoll, thetaDeg) {
  const L = D + CUP / 2 + Dover;
  const g = 9.80665;
  const theta = deg2rad(thetaDeg);

  const a_g = -g * Math.sin(theta);
  const aEff = aRoll + a_g;

  if (aEff <= 0) return 0.1;
  return Math.sqrt(2 * aEff * L);
}

// ================= Cup crossing (線分と円の交差判定) =================
// カップ中心が (cupX, cupY) にある円との交差判定

function segmentHitsCircle(x0, y0, x1, y1, cupX, cupY, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = dx*dx + dy*dy;
  if (a === 0) return null;

  const fx = x0 - cupX;
  const fy = y0 - cupY;
  let t = -(fx*dx + fy*dy) / a;
  t = Math.max(0, Math.min(1, t));

  const cx = x0 + t*dx;
  const cy = y0 + t*dy;
  const d2 = (cx - cupX)*(cx - cupX) + (cy - cupY)*(cy - cupY);

  if (d2 <= r*r) {
    return { t, x: cx, y: cy };
  }
  return null;
}

// ================= Simulation =================
// 座標系: 原点 (0,0) はボール位置、+Y方向がカップ方向
// カップ中心は (0, D)

function simulate2D(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const aRoll = computeARoll(stimpFt);
  const v0 = computeInitialV0(D, Dover, aRoll, thetaDeg);

  const dt = 0.01;
  const g = 9.80665;

  let x = 0;  // ボール原点
  let y = 0;

  const a = deg2rad(alphaDeg);
  let vx = v0 * Math.sin(a);  // X方向: 右が正（反時計回りで右に振れる）
  let vy = v0 * Math.cos(a);  // Y方向: カップ方向が正

  const theta = deg2rad(thetaDeg);
  const aSlopeX = g * Math.sin(theta);  // 傾斜による横方向加速度（右傾斜でプラス）

  const path = [{ x, y }];
  let holed = false;
  let vCup = null;
  let cupIndex = null;
  let tStop = 0;

  const estimatedStopTime = v0 / aRoll;
  const maxTime = Math.max(10, estimatedStopTime + 2);

  for (let t = 0; t < maxTime; t += dt) {

    const v = Math.hypot(vx, vy);
    const ax = -aRoll * (vx / v) + aSlopeX;
    const ay = -aRoll * (vy / v);

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

    // ★ 線分と円の交差判定（カップ中心: 0, D）
    if (cupIndex === null) {
      const hit = segmentHitsCircle(xPrev, yPrev, x, y, 0, D, CUP / 2);
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
// ボール原点 (0,0)、カップ (0,D)
function autoInitViewFromInputs() {
  const i = getI();
  const A = CUP / 2;

  const xMin = Math.min(-1, -5 * A);
  const xMax = Math.max(1, 5 * A);

  const yMin = -0.5;
  const yMax = Math.max(i.D + 1, i.D + i.Dover + 1);

  view.xMin = xMin;
  view.xMax = xMax;
  view.yMin = yMin;
  view.yMax = yMax;
  view.initialized = true;
}

// drawMany: view 対応版
// 座標系: ボール原点 (0,0)、カップ (0,D)
function drawMany(sims, D, Dover, title, alphaCenter35 = null) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const A = CUP / 2;

  // --- 座標変換不要（既にボール原点） ---
  sims.forEach(sim => {
    sim.path2 = sim.path;
    sim.stop2 = sim.stop;
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

  const sx = w / (view.xMax - view.xMin);
  const sy = h / (view.yMax - view.yMin);

  const tx = x => (x - view.xMin) * sx;
  const ty = y => h - (y - view.yMin) * sy;

  // 背景（薄緑色）
  ctx.fillStyle = "#d4f1d4";
  ctx.fillRect(0, 0, w, h);

  // --- グリッド（X：1m刻み） ---
  ctx.strokeStyle = "rgba(100,140,100,0.3)";
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
  ctx.strokeStyle = "rgba(100,140,100,0.3)";
  const ymStart = Math.ceil(view.yMin);
  const ymEnd = Math.floor(view.yMax);
  for (let ym = ymStart; ym <= ymEnd; ym++) {
    ctx.beginPath();
    ctx.moveTo(0, ty(ym));
    ctx.lineTo(w, ty(ym));
    ctx.stroke();
  }

  // --- 基準線（X/Y軸） ---
  ctx.strokeStyle = "rgba(80,120,80,0.6)";
  ctx.lineWidth = 2;

  // X軸 (y=0)
  if (view.yMin <= 0 && view.yMax >= 0) {
    ctx.beginPath();
    ctx.moveTo(0, ty(0));
    ctx.lineTo(w, ty(0));
    ctx.stroke();
  }

  // Y軸 (x=0)
  if (view.xMin <= 0 && view.xMax >= 0) {
    ctx.beginPath();
    ctx.moveTo(tx(0), 0);
    ctx.lineTo(tx(0), h);
    ctx.stroke();
  }

  // --- ボール（グレー・実寸） ---
  const BALL_DIAM = 0.04267;
  const BALL_R = BALL_DIAM / 2;
  const rBall = BALL_R * Math.max(sx, sy);

  ctx.fillStyle = "#888888";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), Math.max(2, rBall), 0, Math.PI * 2);
  ctx.fill();

  // --- カップ（内側白、外周黒） ---
  const rCup = A * Math.max(sx, sy);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(tx(0), ty(D), Math.max(2, rCup), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- カップ補助円（1カップ半径ごと、ビュースケールに応じて調整） ---
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  const scale = Math.max(sx, sy);
  const cx = tx(0);
  const cy = ty(D);
  const maxVisibleRadius = Math.min(
    Math.abs(cx),
    Math.abs(cy),
    Math.abs(w - cx),
    Math.abs(h - cy)
  );
  const maxHelperCount = Math.max(1, Math.min(5, Math.floor(maxVisibleRadius / (A * scale))));
  for (let i = 1; i <= maxHelperCount; i++) {
    const rHelper = (A * i) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, rHelper, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- 軌跡 ---
  sims.forEach((sim, idx) => {
    const colorBefore = sim.color || "#0066cc";
    const colorAfter = "#cc0000";

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

  // --- α_center35 ガイド線 ---
  if (alphaCenter35 !== null) {
    const alphaRad = deg2rad(alphaCenter35);
    const dirX = Math.sin(alphaRad);
    const dirY = Math.cos(alphaRad);

    // y = D との交点を求める
    if (Math.abs(dirY) > 0.001) {
      const t = D / dirY;
      const endX = t * dirX;
      const endY = D;

      ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(tx(0), ty(0));
      ctx.lineTo(tx(endX), ty(endY));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- タイトル ---
  ctx.fillStyle = "#333";
  ctx.font = "14px sans-serif";
  ctx.fillText(title, 10, 20);

  // --- 軸端ハンドル表示（視覚的に掴めるように） ---
  ctx.fillStyle = "rgba(80,120,80,0.6)";
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

// 入力値検証
function validateInputs(i) {
  if (isNaN(i.D) || isNaN(i.theta) || isNaN(i.S) || isNaN(i.alpha) || isNaN(i.Dover)) {
    return false;
  }
  if (i.D <= 0 || i.S <= 0) {
    return false;
  }
  return true;
}

// α_center35 を計算（Dover=0.35mでカップ中心を通る打ち出し角）
function computeAlphaCenter35(D, thetaDeg, stimpFt) {
  const Dover35 = 0.35;
  const targetY = D;
  const tolerance = 0.001;  // 1mm
  const maxIter = 50;

  // 与えられた alpha に対して y = D を跨ぐ点の x 座標を計算
  function getXAtD(alphaDeg) {
    const sim = simulate2D(D, thetaDeg, stimpFt, alphaDeg, Dover35);

    // y=D を跨ぐ点を見つけて線形補間
    for (let i = 1; i < sim.path.length; i++) {
      const p0 = sim.path[i - 1];
      const p1 = sim.path[i];
      if ((p0.y <= targetY && p1.y >= targetY) || (p0.y >= targetY && p1.y <= targetY)) {
        const dy = p1.y - p0.y;
        if (Math.abs(dy) < 1e-9) {
          // 連続する点のy座標が実質同じ場合、ゼロ除算を回避
          if (Math.abs(p0.y - targetY) < 1e-9 && Math.abs(p1.y - targetY) < 1e-9) {
            return (p0.x + p1.x) / 2;
          }
          // 水平な線分で補間に使えない場合はスキップ
          continue;
        }
        const t = (targetY - p0.y) / dy;
        return p0.x + t * (p1.x - p0.x);
      }
    }

    // y=D に到達しない場合
    return null;
  }

  // 二分法で解く
  let alphaLow = -45;
  let alphaHigh = 45;

  let fLow = getXAtD(alphaLow);
  let fHigh = getXAtD(alphaHigh);

  // 端点で到達しない、または符号変化が無い場合は二分法を適用できない
  if (fLow === null || fHigh === null) {
    return null;
  }

  if (Math.abs(fLow) < tolerance) {
    return alphaLow;
  }
  if (Math.abs(fHigh) < tolerance) {
    return alphaHigh;
  }

  // 符号が同じ場合はカップ中心を挟んでいない可能性がある
  if (fLow * fHigh > 0) {
    return null;
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const alphaMid = (alphaLow + alphaHigh) / 2;
    const fMid = getXAtD(alphaMid);

    if (fMid === null) {
      // y=D に到達しない場合は、最終位置の y と targetY を比較して探索範囲を調整する
      const sim = simulate2D(D, thetaDeg, stimpFt, alphaMid, Dover35);
      if (!sim.path || sim.path.length === 0) {
        return null;
      }
      const lastPoint = sim.path[sim.path.length - 1];
      const lastY = lastPoint.y;

      if (lastY < targetY) {
        // D に到達する前に止まった（ショート）場合
        // より直線的なライン（alpha を 0 に近づける）を試す
        if (alphaMid > 0) {
          alphaHigh = alphaMid;
        } else {
          alphaLow = alphaMid;
        }
      } else {
        // D を越えている（オーバーシュート）場合
        // より大きく曲げたライン（alpha を 0 から遠ざける）を試す
        if (alphaMid > 0) {
          alphaLow = alphaMid;
        } else {
          alphaHigh = alphaMid;
        }
      }
      continue;
    }

    if (Math.abs(fMid) < tolerance) {
      return alphaMid;
    }

    // 符号に応じて区間を更新（fLow と fHigh の符号は常に反対）
    if (fMid * fLow > 0) {
      alphaLow = alphaMid;
      fLow = fMid;
    } else {
      alphaHigh = alphaMid;
      // fHigh の更新は以降使用されないため不要
    }
  }

  return null;
}

function runSingle() {
  const i = getI();

  // 入力値検証
  if (!validateInputs(i)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    const w = cv.width, h = cv.height;
    ctx.fillStyle = "#d4f1d4";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // 初回は自動で view を初期化
  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sim = simulate2D(i.D, i.theta, i.S, i.alpha, i.Dover);

  // α_center35 を計算
  const alphaCenter35 = computeAlphaCenter35(i.D, i.theta, i.S);

  drawMany([sim], i.D, i.Dover, "計算して表示", alphaCenter35);

  const stopX = sim.stop.x;
  const stopY = sim.stop.y;
  const stopDist = Math.hypot(stopX, stopY);
  const cupCenterX = 0;
  const cupCenterY = i.D;
  const distFromCup = Math.hypot(stopX - cupCenterX, stopY - cupCenterY);

  const maxAbsX = Math.max(...sim.path.map(p => Math.abs(p.x)));
  const maxWidth = maxAbsX / CUP;

  let text =
    `【原点：ボール位置 (0,0)、カップ中心：(0,${i.D})】\n\n` +
    `距離 D: ${i.D} m\n` +
    `傾斜角 θ: ${i.theta}° (右＋／左−)\n` +
    `スティンプ S: ${i.S} ft\n` +
    `打ち出し角 α: ${i.alpha}° (反時計＋／時計−)\n` +
    `オーバー距離 Dover: ${i.Dover} m (カップ縁基準)\n\n` +
    `一定減速度 aRoll: ${sim.aRoll.toFixed(3)} m/s²\n` +
    `初速 v0: ${sim.v0.toFixed(3)} m/s\n` +
    `停止時間 tStop: ${sim.tStop.toFixed(2)} s\n` +
    `カップ通過速度 vCup: ${sim.vCup !== null ? sim.vCup.toFixed(3) + " m/s" : "未通過"}\n\n` +
    `停止位置 X: ${stopX.toFixed(3)} m\n` +
    `停止位置 Y: ${stopY.toFixed(3)} m\n` +
    `停止距離（原点基準）: ${stopDist.toFixed(3)} m\n` +
    `カップ中心からの距離: ${distFromCup.toFixed(3)} m\n` +
    `最大幅（左右）: ±${maxWidth.toFixed(2)} CUP\n\n` +
    `参考：縁から35cmオーバー時 Dover = 0.35 m\n`;

  if (alphaCenter35 !== null) {
    text += `縁35cmオーバー時：α_center35 = ${alphaCenter35.toFixed(1)} deg\n`;
  } else {
    text += `エラー：縁35cm条件でα_center35を算出できません\n`;
  }

  result.textContent = text;
}

// α 5本比較（打ち出し角を5条件比較）
// ステップ：1deg刻み、範囲±2deg
function runAlpha5() {
  const i = getI();

  if (!validateInputs(i)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    const w = cv.width, h = cv.height;
    ctx.fillStyle = "#d4f1d4";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const sims = [];
  const baseAlpha = i.alpha;
  const deltas = [-2, -1, 0, 1, 2];  // ±2degで5本

  deltas.forEach(d => {
    const a = baseAlpha + d;
    const sim = simulate2D(i.D, i.theta, i.S, a, i.Dover);
    sim.color = d === 0 ? "#0066cc" : "#66ccff";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `打ち出し角を5条件比較 (中心 ${baseAlpha}°)`);

  let best = null;
  sims.forEach((sim, idx) => {
    const cupCenterX = 0;
    const cupCenterY = i.D;
    const distCup = Math.hypot(sim.stop.x - cupCenterX, sim.stop.y - cupCenterY);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, alpha: baseAlpha + deltas[idx] };
    }
  });

  result.textContent =
    `打ち出し角を5条件比較\n最適 α: ${best.alpha}°（カップ中心から ${best.dist.toFixed(3)} m）`;
}

// θ 5本比較（傾斜角を5条件比較）
// ステップ：±0.5deg刻み
function runTheta5() {
  const i = getI();

  if (!validateInputs(i)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    const w = cv.width, h = cv.height;
    ctx.fillStyle = "#d4f1d4";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const sims = [];
  const baseTheta = i.theta;
  const deltas = [-1.0, -0.5, 0, 0.5, 1.0];  // ±0.5deg刻みで5本

  deltas.forEach(d => {
    const th = baseTheta + d;
    const sim = simulate2D(i.D, th, i.S, i.alpha, i.Dover);
    sim.color = d === 0 ? "#ff6600" : "#ffaa66";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `傾斜角を5条件比較 (中心 ${baseTheta}°)`);

  result.textContent = `傾斜角を5条件比較（中心 ${baseTheta}°）`;
}

// Dover 5本比較（タッチを5条件比較）
// ステップ：0.1m刻み、範囲±0.2m
function runDover5() {
  const i = getI();

  if (!validateInputs(i)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    const w = cv.width, h = cv.height;
    ctx.fillStyle = "#d4f1d4";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const sims = [];
  const baseDover = i.Dover;
  const deltas = [-0.2, -0.1, 0, 0.1, 0.2];  // ±0.1m刻みで5本

  deltas.forEach(d => {
    const DoverVal = Math.max(0, baseDover + d);
    const sim = simulate2D(i.D, i.theta, i.S, i.alpha, DoverVal);
    sim.color = d === 0 ? "#00cc00" : "#66dd66";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `タッチを5条件比較 (中心 ${baseDover} m)`);

  let best = null;
  sims.forEach((sim, idx) => {
    const cupCenterX = 0;
    const cupCenterY = i.D;
    const distCup = Math.hypot(sim.stop.x - cupCenterX, sim.stop.y - cupCenterY);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, Dover: Math.max(0, baseDover + deltas[idx]) };
    }
  });

  result.textContent =
    `タッチを5条件比較\n最適 Dover: ${best.Dover.toFixed(2)} m（カップ中心から ${best.dist.toFixed(3)} m）`;
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

btnRunAlpha5.onclick = runAlpha5;
btnRunTheta5.onclick = runTheta5;
btnRunDover5.onclick = runDover5;

window.addEventListener("resize", () => {
  // リサイズ時はキャンバスサイズを更新して再描画（view は維持）
  runSingle();
});

// 初回実行
runSingle();
