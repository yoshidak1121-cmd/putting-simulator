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

// ================= Viewport（パン・ズーム・軸ドラッグ用）=================
let view = {
  xMin: -1,
  xMax: 5,
  yMin: -0.3,
  yMax: 0.3,
  initialized: false
};

let isDragging = false;
let dragMode = null;   // "pan"、"xMin"、"xMax"、"yMin"、"yMax"
let lastMouse = { x: 0, y: 0 };

// ================= 35cm Over Guide Line Calculation =================

// Dover35：固定参考条件（縁から35cmオーバー）
const Dover35 = 0.35;

// α_center35を数値的に求める（二分法）
// 目的：Dover35の強さで打ったとき、カップ中心 (0,D) を通る打ち出し角を求める
function computeAlphaCenter35(D, thetaDeg, stimpFt) {
  const cupCenterX = 0;
  const cupCenterY = D;
  
  // まず、Dover35 でカップ中心まで到達可能かチェック
  // α=0で試してみる
  const testSim = simulate2D(D, thetaDeg, stimpFt, 0, Dover35);
  const maxY = Math.max(...testSim.path.map(p => p.y));
  
  if (maxY < D * 0.8) {
    // Dover35ではDの80%にも到達しない → 計算不可
    return null;
  }
  
  // 二分法の範囲設定（傾斜がある場合は範囲を広げる）
  let alphaMin = -89;  // deg（ほぼ真横）
  let alphaMax = 89;   // deg
  const maxIterations = 60;
  const tolerance = 0.001;  // 1mm
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const alphaMid = (alphaMin + alphaMax) / 2;
    
    // Dover35で軌道をシミュレーション
    const sim = simulate2D(D, thetaDeg, stimpFt, alphaMid, Dover35);
    
    // y=D に到達した時点の x 座標を求める（線形補間）
    let xAtD = null;
    for (let i = 1; i < sim.path.length; i++) {
      const p0 = sim.path[i - 1];
      const p1 = sim.path[i];
      
      if ((p0.y <= D && D <= p1.y) || (p1.y <= D && D <= p0.y)) {
        // 線形補間
        if (Math.abs(p1.y - p0.y) > 1e-9) {
          const t = (D - p0.y) / (p1.y - p0.y);
          xAtD = p0.x + t * (p1.x - p0.x);
        } else {
          xAtD = (p0.x + p1.x) / 2;
        }
        break;
      }
    }
    
    if (xAtD === null) {
      // y=D に到達しなかった場合
      // 最終位置が D より手前なら、より左向き（負のα）が必要
      const lastY = sim.path[sim.path.length - 1].y;
      if (lastY < D) {
        // 到達せず → より左向き（αを小さく）
        alphaMax = alphaMid;
      } else {
        // 通り過ぎ（想定外だが念のため）
        alphaMin = alphaMid;
      }
      continue;
    }
    
    // 収束判定
    if (Math.abs(xAtD - cupCenterX) < tolerance) {
      return alphaMid;
    }
    
    // 二分探索の更新
    if (xAtD < cupCenterX) {
      // カップより左 → αを大きくする（右に向ける）
      alphaMin = alphaMid;
    } else {
      // カップより右 → αを小さくする（左に向ける）
      alphaMax = alphaMid;
    }
  }
  
  // 収束しなかった
  return null;
}

// ================= Physics =================

// スティンプから一定減速度 aRoll を計算
function computeARoll(stimpFt) {
  const v_stimp = 1.83;
  const s = stimpFt * 0.3048;
  return (v_stimp ** 2) / (2 * s);
}

// 初速 v0 を「D + カップ半径 + Dover」から計算
// Dover はカップの縁（バックエッジ）からの距離として定義
function computeInitialV0(D, Dover, aRoll, thetaDeg) {
  const cupRadius = CUP / 2;
  const L = D + cupRadius + Dover;  // 停止目標位置
  const g = 9.80665;
  const theta = deg2rad(thetaDeg);

  const a_g = -g * Math.sin(theta);
  const aEff = aRoll + a_g;

  if (aEff <= 0) return 0.1;
  return Math.sqrt(2 * aEff * L);
}

// ================= Cup crossing（線分と円の交差判定）=================

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
// 座標系：原点(0,0)はボール位置、+Y方向がカップ方向

function simulate2D(D, thetaDeg, stimpFt, alphaDeg, Dover) {

  const aRoll = computeARoll(stimpFt);
  const v0 = computeInitialV0(D, Dover, aRoll, thetaDeg);

  const dt = 0.01;
  const g = 9.80665;

  // 原点をボール位置に変更（ボール原点基準）
  // カップは (0, D) の位置
  // α=0 のとき、Y方向（カップ方向）に打ち出す
  // αは Y軸からの反時計回りの角度
  let x = 0;
  let y = 0;

  const a = deg2rad(alphaDeg);
  // Y軸正方向（カップ方向）を基準にαを定義
  // α=0 → Y方向、α=90 → -X方向、α=-90 → +X方向
  let vx = v0 * Math.sin(a);   // X成分（反時計回り正）
  let vy = v0 * Math.cos(a);   // Y成分（カップ方向）

  const theta = deg2rad(thetaDeg);
  // 傾斜による加速度（X方向）：右傾斜（+θ）で右（+X）に加速
  const aSlopeX = g * Math.sin(theta);

  const path = [{ x, y }];
  let holed = false;
  let vCup = null;
  let cupIndex = null;
  let tStop = 0;

  const estimatedStopTime = v0 / aRoll;
  const maxTime = Math.max(10, estimatedStopTime + 2);

  for (let t = 0; t < maxTime; t += dt) {

    const v = Math.hypot(vx, vy);
    if (v < 0.01) {
      tStop = t;
      break;
    }
    
    // 減速度（速度方向と逆向き）
    const ax = -aRoll * (vx / v) + aSlopeX;
    const ay = -aRoll * (vy / v);

    const xPrev = x;
    const yPrev = y;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    // ★ 線分と円の交差判定（カップ中心は (0, D)）
    if (cupIndex === null) {
      const cupCenterX = 0;
      const cupCenterY = D;
      const hit = segmentHitsCircle(
        xPrev - cupCenterX, yPrev - cupCenterY,
        x - cupCenterX, y - cupCenterY,
        CUP / 2
      );
      if (hit) {
        path.push({ x: hit.x + cupCenterX, y: hit.y + cupCenterY });
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

// 逆変換（ピクセル→物理座標）
function tx_inv(px, w) {
  return view.xMin + px * (view.xMax - view.xMin) / w;
}
function ty_inv(py, h) {
  return view.yMin + (h - py) * (view.yMax - view.yMin) / h;
}

// 軸端ヒットテスト（px、py はキャンバス座標）
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
// ボール原点基準に更新
function autoInitViewFromInputs() {
  const i = getI();
  const A = CUP / 2;

  const xMin = -1;
  const xMaxCandidate = Math.max(1, i.D + A + i.Dover + 1);
  const xMax = Math.ceil(xMaxCandidate);

  const yMin = -1;
  const yMax = Math.max(i.D + 1, 5);

  view.xMin = xMin;
  view.xMax = xMax;
  view.yMin = yMin;
  view.yMax = yMax;
  view.initialized = true;
}

// drawMany：ボール原点基準の描画
function drawMany(sims, D, Dover, title, alphaCenter35 = null) {

  setupCanvas();
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const A = CUP / 2;

  // 座標変換は不要（既にボール原点基準）
  sims.forEach(sim => {
    sim.path2 = sim.path;
    sim.stop2 = sim.stop;
  });

  // --- view をそのまま使用 ---
  const xMin = view.xMin;
  const xMax = view.xMax;
  const yMin = view.yMin;
  const yMax = view.yMax;

  // 防御：viewが逆転していたら修正
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

  // 背景：グリーンに近い薄緑色
  ctx.fillStyle = "#b8d4a8";
  ctx.fillRect(0, 0, w, h);

  // --- グリッド（X, Y：1m間隔） ---
  ctx.strokeStyle = "rgba(100,120,80,0.3)";
  ctx.lineWidth = 1;
  const xmStart = Math.ceil(view.xMin);
  const xmEnd = Math.floor(view.xMax);
  for (let xm = xmStart; xm <= xmEnd; xm++) {
    ctx.beginPath();
    ctx.moveTo(tx(xm), 0);
    ctx.lineTo(tx(xm), h);
    ctx.stroke();
  }

  const ymStart = Math.ceil(view.yMin);
  const ymEnd = Math.floor(view.yMax);
  for (let ym = ymStart; ym <= ymEnd; ym++) {
    ctx.beginPath();
    ctx.moveTo(0, ty(ym));
    ctx.lineTo(w, ty(ym));
    ctx.stroke();
  }

  // --- 基準線（X/Y軸） ---
  ctx.strokeStyle = "rgba(60,60,60,0.6)";
  ctx.lineWidth = 1.5;

  // X軸 (y=0)
  if (view.yMin <= 0 && 0 <= view.yMax) {
    ctx.beginPath();
    ctx.moveTo(0, ty(0));
    ctx.lineTo(w, ty(0));
    ctx.stroke();
  }

  // Y軸 (x=0)
  if (view.xMin <= 0 && 0 <= view.xMax) {
    ctx.beginPath();
    ctx.moveTo(tx(0), 0);
    ctx.lineTo(tx(0), h);
    ctx.stroke();
  }

  // --- ボール（グレーの円・実寸、原点 (0,0)） ---
  const BALL_DIAM = 0.04267;
  const BALL_R = BALL_DIAM / 2;
  const rBall = BALL_R * sy;

  ctx.fillStyle = "#888888";
  ctx.beginPath();
  ctx.arc(tx(0), ty(0), Math.max(2, rBall), 0, Math.PI * 2);
  ctx.fill();

  // --- カップ（白塗り・黒枠、位置 (0, D)） ---
  const rCup = A * sy;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(tx(0), ty(D), Math.max(1, rCup), 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tx(0), ty(D), Math.max(1, rCup), 0, Math.PI * 2);
  ctx.stroke();

  // --- カップ中心からの同心円（1カップ半径ごと） ---
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const radius = i * A;
    const r = radius * sy;
    if (r > 0.5) {
      ctx.beginPath();
      ctx.arc(tx(0), ty(D), r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- 軌跡 ---
  sims.forEach((sim, idx) => {
    const colorBefore = sim.color || "#0066cc";
    const colorAfter = "#00aa00";

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
    ctx.fillStyle = "#ff6600";
    ctx.beginPath();
    ctx.arc(tx(sim.stop2.x), ty(sim.stop2.y), 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- 35cm オーバー時のガイド線 ---
  if (alphaCenter35 !== null) {
    const a = deg2rad(alphaCenter35);
    // ボール原点から角度αで y=D まで伸ばす
    // x = y * tan(a) の関係
    const xEnd = D * Math.tan(a);
    const yEnd = D;
    
    ctx.strokeStyle = "rgba(255,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);  // 破線
    ctx.beginPath();
    ctx.moveTo(tx(0), ty(0));
    ctx.lineTo(tx(xEnd), ty(yEnd));
    ctx.stroke();
    ctx.setLineDash([]);  // 破線をリセット
  }

  // --- タイトル ---
  ctx.fillStyle = "#000";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(title, 10, 20);

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

  // 入力検証
  if (isNaN(i.D) || isNaN(i.theta) || isNaN(i.S) || isNaN(i.alpha) || isNaN(i.Dover)) {
    result.textContent = "エラー\n入力値を確認してください";
    // キャンバスをクリア
    setupCanvas();
    ctx.fillStyle = "#b8d4a8";
    ctx.fillRect(0, 0, cv.width, cv.height);
    return;
  }

  // 初回は自動で view を初期化
  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sim = simulate2D(i.D, i.theta, i.S, i.alpha, i.Dover);

  // α_center35 を計算
  const alphaCenter35 = computeAlphaCenter35(i.D, i.theta, i.S);

  drawMany([sim], i.D, i.Dover, "計算結果", alphaCenter35);

  const stopX = sim.stop.x;
  const stopY = sim.stop.y;
  const stopDist = Math.hypot(stopX, stopY);

  // カップ中心からの距離
  const cupCenterX = 0;
  const cupCenterY = i.D;
  const distFromCup = Math.hypot(stopX - cupCenterX, stopY - cupCenterY);

  const maxX = Math.max(...sim.path.map(p => Math.abs(p.x)));

  let text =
    `【入力パラメータ】（原点：ボール位置）\n` +
    `距離 D: ${i.D} m\n` +
    `傾斜 θ: ${i.theta}° (右+/左-)\n` +
    `スティンプ S: ${i.S} ft\n` +
    `打ち出し角 α: ${i.alpha}° (反時計+/時計-)\n` +
    `オーバー距離 Dover: ${i.Dover} m (縁基準)\n\n` +
    `【計算結果】\n` +
    `一定減速度 aRoll: ${sim.aRoll.toFixed(3)} m/s²\n` +
    `初速 v0: ${sim.v0.toFixed(3)} m/s\n` +
    `停止時間 tStop: ${sim.tStop.toFixed(2)} s\n` +
    `カップ通過速度 vCup: ${sim.vCup !== null ? sim.vCup.toFixed(3) + " m/s" : "未通過"}\n\n` +
    `【停止位置】（ボール原点基準）\n` +
    `停止位置 X: ${stopX.toFixed(3)} m\n` +
    `停止位置 Y: ${stopY.toFixed(3)} m\n` +
    `停止距離（原点から）: ${stopDist.toFixed(3)} m\n` +
    `カップ中心からの距離: ${distFromCup.toFixed(3)} m\n` +
    `最大横ズレ: ${maxX.toFixed(3)} m\n\n` +
    `【参考】\n` +
    `縁から35cmオーバー時 Dover = 0.35 m\n`;

  if (alphaCenter35 !== null) {
    text += `縁35cmオーバー時：α_center35 = ${alphaCenter35.toFixed(1)}°`;
  } else {
    text += `エラー：縁35cm条件でα_center35を算出できません`;
  }

  result.textContent = text;
}

// α 5条件比較（打ち出し角を5条件比較）
// 中心±2degずつ、計5条件
function runAlpha5() {
  const i = getI();

  // 入力検証
  if (isNaN(i.D) || isNaN(i.theta) || isNaN(i.S) || isNaN(i.alpha) || isNaN(i.Dover)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    ctx.fillStyle = "#b8d4a8";
    ctx.fillRect(0, 0, cv.width, cv.height);
    return;
  }

  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sims = [];
  const baseAlpha = i.alpha;
  const deltas = [-2, -1, 0, 1, 2];  // α：±2deg刻み

  deltas.forEach(d => {
    const a = baseAlpha + d;
    const sim = simulate2D(i.D, i.theta, i.S, a, i.Dover);
    sim.color = d === 0 ? "#ff0000" : "#0066cc";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `打ち出し角を5条件比較 (中心 ${baseAlpha}°)`);

  let best = null;
  const cupCenterX = 0;
  const cupCenterY = i.D;
  
  sims.forEach((sim, idx) => {
    const distCup = Math.hypot(sim.stop.x - cupCenterX, sim.stop.y - cupCenterY);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, alpha: baseAlpha + deltas[idx] };
    }
  });

  result.textContent =
    `打ち出し角を5条件比較\n` +
    `中心値: α = ${baseAlpha}°\n` +
    `範囲: ${baseAlpha-2}° ~ ${baseAlpha+2}° (1°刻み)\n\n` +
    `最適 α: ${best.alpha}°\n` +
    `カップ中心からの距離: ${best.dist.toFixed(3)} m`;
}

// θ 5条件比較（傾斜角を5条件比較）
// 中心±{1.0、0.5}deg、計5条件
function runTheta5() {
  const i = getI();

  // 入力検証
  if (isNaN(i.D) || isNaN(i.theta) || isNaN(i.S) || isNaN(i.alpha) || isNaN(i.Dover)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    ctx.fillStyle = "#b8d4a8";
    ctx.fillRect(0, 0, cv.width, cv.height);
    return;
  }

  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sims = [];
  const baseTheta = i.theta;
  const deltas = [-1.0, -0.5, 0, 0.5, 1.0];  // θ：±0.5deg刻み

  deltas.forEach(d => {
    const th = baseTheta + d;
    const sim = simulate2D(i.D, th, i.S, i.alpha, i.Dover);
    sim.color = d === 0 ? "#ff0000" : "#cc66ff";
    sims.push(sim);
  });

  drawMany(sims, i.D, i.Dover, `傾斜角を5条件比較 (中心 ${baseTheta}°)`);

  result.textContent = 
    `傾斜角を5条件比較\n` +
    `中心値: θ = ${baseTheta}°\n` +
    `範囲: ${(baseTheta-1.0).toFixed(1)}° ~ ${(baseTheta+1.0).toFixed(1)}° (0.5°刻み)`;
}

// Dover 5条件比較（タッチを5条件比較）
// 中心±{0.20、0.10}m、計5条件
function runDover5() {
  const i = getI();

  // 入力検証
  if (isNaN(i.D) || isNaN(i.theta) || isNaN(i.S) || isNaN(i.alpha) || isNaN(i.Dover)) {
    result.textContent = "エラー\n入力値を確認してください";
    setupCanvas();
    ctx.fillStyle = "#b8d4a8";
    ctx.fillRect(0, 0, cv.width, cv.height);
    return;
  }

  if (!view.initialized) {
    autoInitViewFromInputs();
  }

  const sims = [];
  const baseDover = i.Dover;
  const deltas = [-0.20, -0.10, 0, 0.10, 0.20];  // Dover：±0.10m刻み

  deltas.forEach(d => {
    const DoverVal = Math.max(0, baseDover + d);
    const sim = simulate2D(i.D, i.theta, i.S, i.alpha, DoverVal);
    sim.color = d === 0 ? "#ff0000" : "#ffaa44";
    sims.push(sim);
  });

  drawMany(sims, i.D, baseDover + 0.5, `タッチを5条件比較 (中心 ${baseDover} m)`);

  let best = null;
  const cupCenterX = 0;
  const cupCenterY = i.D;
  
  sims.forEach((sim, idx) => {
    const distCup = Math.hypot(sim.stop.x - cupCenterX, sim.stop.y - cupCenterY);
    if (!best || distCup < best.dist) {
      best = { sim, idx, dist: distCup, Dover: Math.max(0, baseDover + deltas[idx]) };
    }
  });

  result.textContent =
    `タッチを5条件比較\n` +
    `中心値: Dover = ${baseDover} m\n` +
    `範囲: ${Math.max(0, baseDover-0.20).toFixed(2)} ~ ${(baseDover+0.20).toFixed(2)} m (0.10m刻み)\n\n` +
    `最適 Dover: ${best.Dover.toFixed(2)} m\n` +
    `カップ中心からの距離: ${best.dist.toFixed(3)} m`;
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

  // 視覚的ヒント：カーソル変更
  if (dragMode === "pan") cv.style.cursor = "grabbing";
  else cv.style.cursor = "ew-resize";
});

// mousemove
cv.addEventListener("mousemove", e => {
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  // ホバー時のカーソル変更（軸端に近い場合はハンドル）
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

// wheel（ズーム）
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
  // リサイズ時はキャンバスサイズを更新して再描画（viewは維持）
  runSingle();
});

// 初回実行
runSingle();

// ================= フィードバック機能 =================

const feedbackBtn = document.getElementById("feedbackBtn");
const feedbackModal = document.getElementById("feedbackModal");
const closeFeedback = document.getElementById("closeFeedback");
const cancelFeedback = document.getElementById("cancelFeedback");
const submitFeedback = document.getElementById("submitFeedback");
const feedbackSuccess = document.getElementById("feedbackSuccess");
const feedbackForm = document.querySelector(".feedback-form");
const stars = document.querySelectorAll(".star");

let selectedRating = 0;

// Constants
const SUCCESS_MESSAGE_TIMEOUT = 2000; // 2 seconds

// フィードバックボタンクリック
feedbackBtn.onclick = () => {
  feedbackModal.style.display = "block";
  feedbackSuccess.style.display = "none";
  feedbackForm.style.display = "block";
};

// モーダルを閉じる
closeFeedback.onclick = () => {
  feedbackModal.style.display = "none";
  resetFeedbackForm();
};

cancelFeedback.onclick = () => {
  feedbackModal.style.display = "none";
  resetFeedbackForm();
};

// モーダル外クリックで閉じる
window.addEventListener("click", (e) => {
  if (e.target === feedbackModal) {
    feedbackModal.style.display = "none";
    resetFeedbackForm();
  }
});

// 星評価
stars.forEach(star => {
  star.onclick = () => {
    selectedRating = parseInt(star.dataset.rating);
    updateStars();
  };
  
  star.onmouseenter = () => {
    const rating = parseInt(star.dataset.rating);
    stars.forEach((s, idx) => {
      if (idx < rating) {
        s.textContent = "★";
        s.style.color = "#ffd700";
      } else {
        s.textContent = "☆";
        s.style.color = "#555";
      }
    });
  };
});

document.querySelector(".star-rating").onmouseleave = () => {
  updateStars();
};

function updateStars() {
  stars.forEach((star, idx) => {
    if (idx < selectedRating) {
      star.textContent = "★";
      star.classList.add("active");
    } else {
      star.textContent = "☆";
      star.classList.remove("active");
    }
  });
}

// フィードバック送信
submitFeedback.onclick = () => {
  const name = document.getElementById("feedbackName").value.trim();
  const email = document.getElementById("feedbackEmail").value.trim();
  const message = document.getElementById("feedbackMessage").value.trim();
  
  // 基本バリデーション
  if (message === "") {
    alert("コメントを入力してください。");
    return;
  }
  
  // メールアドレスの簡易バリデーション
  if (email !== "" && !isValidEmail(email)) {
    alert("有効なメールアドレスを入力してください。");
    return;
  }
  
  // フィードバックデータ
  const feedbackData = {
    rating: selectedRating,
    name: name || "匿名",
    email: email,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  // 実際のアプリケーションではサーバーに送信
  // Note：本番環境では個人情報をコンソールにログ出力しないこと
  console.log("フィードバック送信: 評価=" + feedbackData.rating + "点");
  
  // ローカルストレージに保存（デモ用）
  saveFeedbackToLocalStorage(feedbackData);
  
  // 成功メッセージ表示
  feedbackForm.style.display = "none";
  feedbackSuccess.style.display = "block";
  
  // 指定秒数後にモーダルを閉じる
  setTimeout(() => {
    feedbackModal.style.display = "none";
    resetFeedbackForm();
  }, SUCCESS_MESSAGE_TIMEOUT);
};

// メールアドレスバリデーション
function isValidEmail(email) {
  // HTML5 standard email validation pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

// ローカルストレージに保存
function saveFeedbackToLocalStorage(feedbackData) {
  try {
    let feedbacks = JSON.parse(localStorage.getItem("puttingSimulatorFeedbacks")) || [];
    feedbacks.push(feedbackData);
    localStorage.setItem("puttingSimulatorFeedbacks", JSON.stringify(feedbacks));
  } catch (e) {
    console.error("フィードバックの保存に失敗しました:", e);
  }
}

// フォームリセット
function resetFeedbackForm() {
  document.getElementById("feedbackName").value = "";
  document.getElementById("feedbackEmail").value = "";
  document.getElementById("feedbackMessage").value = "";
  selectedRating = 0;
  updateStars();
  feedbackSuccess.style.display = "none";
  feedbackForm.style.display = "block";
}

