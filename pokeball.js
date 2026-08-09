(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const ammoPipsEl = document.getElementById("ammo-pips");
  const introEl = document.getElementById("intro");
  const toastLayer = document.getElementById("toast-layer");

  const BEST_KEY = "slapball-best";

  let W = 0, H = 0;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- audio (tiny synthesized blips, no assets) ----------
  let audioCtx = null;
  function beep(freq, duration, type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      /* audio not available */
    }
  }

  // ---------- state ----------
  const MAX_AMMO = 5;
  const AMMO_REGEN_MS = 1100;
  const THROW_SPEED = 620; // px/s
  const HIT_RADIUS = 42;
  const REACT_RADIUS = 150;
  const REACT_DELAY_MS = 130;

  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = String(best);

  let ammo = MAX_AMMO;
  let ammoTimer = 0;
  let started = false;

  const pikachu = {
    x: W / 2,
    y: H * 0.42,
    targetX: W / 2,
    r: 46,
    nextWanderAt: 0,
    slapTimer: 0,
    slapDir: { x: 0, y: -1 },
    hitTimer: 0,
    bobPhase: 0,
  };

  const balls = []; // {x,y,vx,vy,state:'flying'|'deflected',reacted}
  const toasts = []; // dom-based, tracked for cleanup only

  function difficulty() {
    // slap chance goes from 0.88 down to 0.55 as score climbs
    return Math.max(0.55, 0.88 - score * 0.012);
  }

  function pickWanderTarget() {
    const margin = W * 0.18;
    pikachu.targetX = margin + Math.random() * (W - margin * 2);
    pikachu.nextWanderAt = performance.now() + 1200 + Math.random() * 1800;
  }
  pickWanderTarget();

  function throwOrigin() {
    return { x: W / 2, y: H - 30 };
  }

  function spawnBall(targetX, targetY) {
    const origin = throwOrigin();
    const dx = targetX - origin.x;
    const dy = targetY - origin.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    balls.push({
      x: origin.x,
      y: origin.y,
      vx: (dx / len) * THROW_SPEED,
      vy: (dy / len) * THROW_SPEED,
      state: "flying",
      reacted: false,
      rot: 0,
    });
  }

  function showToast(text, x, y, cls) {
    const el = document.createElement("div");
    el.className = "toast " + cls;
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    toastLayer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  function onHit(ball) {
    score++;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = String(best);
    }
    pikachu.hitTimer = 260;
    showToast("HIT!", pikachu.x, pikachu.y - pikachu.r, "hit");
    beep(880, 0.12, "square");
    pickWanderTarget();
  }

  function onParry(ball) {
    pikachu.hitTimer = 0;
    showToast("PARRIED", ball.x, ball.y, "parry");
    beep(220, 0.08, "sawtooth");
  }

  function triggerSlap(ball) {
    pikachu.slapTimer = 180;
    const dx = ball.x - pikachu.x;
    const dy = ball.y - pikachu.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    pikachu.slapDir = { x: dx / len, y: dy / len };

    // deflect the ball outward, roughly away from pikachu, with extra speed
    const speed = Math.hypot(ball.vx, ball.vy) * 1.35;
    const spread = (Math.random() - 0.5) * 1.1;
    const angle = Math.atan2(dy, dx) + spread;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.state = "deflected";
    onParry(ball);
  }

  // ---------- input ----------
  function handlePointer(clientX, clientY) {
    if (!started) {
      started = true;
      introEl.classList.add("hidden");
      return;
    }
    if (ammo <= 0) return;
    ammo--;
    spawnBall(clientX, clientY);
  }

  canvas.addEventListener("pointerdown", (e) => {
    handlePointer(e.clientX, e.clientY);
  });

  // ---------- drawing ----------
  function drawGround() {
    const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
    grad.addColorStop(0, "#bfe8a0");
    grad.addColorStop(1, "#8fc86a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
  }

  function drawPokeball(ball) {
    const r = 13;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rot);

    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.fillStyle = "#e3350d";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.fillStyle = "#f5f5f5";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#10202b";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.strokeStyle = "#10202b";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f5f5f5";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawPikachu(t) {
    const flinch = pikachu.hitTimer > 0;
    const shake = flinch ? (Math.random() - 0.5) * 6 : 0;
    const bob = Math.sin(t / 260) * 4;
    const cx = pikachu.x + shake;
    const cy = pikachu.y + bob;
    const r = pikachu.r;

    ctx.save();
    ctx.translate(cx, cy);
    if (flinch) ctx.filter = "saturate(1) brightness(1.25)";

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, r + 18, r * 0.9, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fill();

    // ears
    ctx.fillStyle = "#f4c542";
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.75);
    ctx.lineTo(-r * 0.95, -r * 1.8);
    ctx.lineTo(-r * 0.25, -r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * 0.75);
    ctx.lineTo(r * 0.95, -r * 1.8);
    ctx.lineTo(r * 0.25, -r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(-r * 0.78, -r * 1.45);
    ctx.lineTo(-r * 0.95, -r * 1.8);
    ctx.lineTo(-r * 0.62, -r * 1.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.78, -r * 1.45);
    ctx.lineTo(r * 0.95, -r * 1.8);
    ctx.lineTo(r * 0.62, -r * 1.35);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f4c542";
    ctx.fill();

    // cheeks
    ctx.fillStyle = "#e6533c";
    ctx.beginPath();
    ctx.arc(-r * 0.62, r * 0.12, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.62, r * 0.12, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = "#111";
    const eyeY = -r * 0.08;
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, eyeY, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.32, eyeY, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // arms / paws (slap animation)
    const slapping = pikachu.slapTimer > 0;
    const slapT = slapping ? 1 - pikachu.slapTimer / 180 : 0;
    const extend = slapping ? Math.sin(slapT * Math.PI) : 0;

    [-1, 1].forEach((side) => {
      const baseX = side * r * 0.85;
      const baseY = r * 0.15;
      let armX = baseX;
      let armY = baseY;
      if (slapping) {
        armX = baseX + pikachu.slapDir.x * extend * r * 1.3;
        armY = baseY + pikachu.slapDir.y * extend * r * 1.3;
      }
      ctx.strokeStyle = "#f4c542";
      ctx.lineWidth = r * 0.28;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(baseX * 0.5, baseY * 0.3);
      ctx.lineTo(armX, armY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(armX, armY, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = "#f4c542";
      ctx.fill();
    });

    ctx.restore();
  }

  function drawTrainerHand() {
    const o = throwOrigin();
    ctx.beginPath();
    ctx.arc(o.x, o.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#3a4a52";
    ctx.fill();
  }

  function updateAmmoUI() {
    ammoPipsEl.innerHTML = "";
    for (let i = 0; i < MAX_AMMO; i++) {
      const pip = document.createElement("div");
      pip.className = "ammo-pip" + (i < ammo ? " filled" : "");
      ammoPipsEl.appendChild(pip);
    }
  }
  updateAmmoUI();

  // ---------- main loop ----------
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(40, t - lastT);
    lastT = t;
    const dtS = dt / 1000;

    // ammo regen
    if (started && ammo < MAX_AMMO) {
      ammoTimer += dt;
      if (ammoTimer >= AMMO_REGEN_MS) {
        ammoTimer = 0;
        ammo++;
        updateAmmoUI();
      }
    }

    // pikachu wander
    if (t > pikachu.nextWanderAt) pickWanderTarget();
    pikachu.x += (pikachu.targetX - pikachu.x) * Math.min(1, dtS * 1.5);
    if (pikachu.slapTimer > 0) pikachu.slapTimer -= dt;
    if (pikachu.hitTimer > 0) pikachu.hitTimer -= dt;

    // balls
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.x += b.vx * dtS;
      b.y += b.vy * dtS;
      b.rot += dtS * 12;

      if (b.state === "flying" && !b.reacted) {
        const dist = Math.hypot(b.x - pikachu.x, b.y - pikachu.y);
        if (dist <= REACT_RADIUS) {
          b.reacted = true;
          if (Math.random() < difficulty()) {
            setTimeout(() => {
              if (balls.includes(b) && b.state === "flying") triggerSlap(b);
            }, REACT_DELAY_MS);
          }
        }
      }

      if (b.state === "flying") {
        const dist = Math.hypot(b.x - pikachu.x, b.y - pikachu.y);
        if (dist <= HIT_RADIUS) {
          onHit(b);
          balls.splice(i, 1);
          continue;
        }
      }

      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
        balls.splice(i, 1);
      }
    }

    // draw
    ctx.clearRect(0, 0, W, H);
    drawGround();
    drawTrainerHand();
    drawPikachu(t);
    balls.forEach(drawPokeball);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
