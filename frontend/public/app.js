// ── Theme init (before first paint) ──────────────────────────────────────
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

// ── State ─────────────────────────────────────────────────────────────────
const API = "";
let token          = localStorage.getItem("token") || null;
let currentTab     = "home";
let profile        = null;
let lastFeedback   = null;
let isTrainingDay  = localStorage.getItem("trainingDay") !== "false";
let editingEntryId = null;
let cachedHomeData = null;
let _notifTimer1   = null;
let _notifTimer2   = null;

const appEl = document.getElementById("app");

// ── API helper ────────────────────────────────────────────────────────────
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Router ────────────────────────────────────────────────────────────────
async function render() {
  if (!token) return renderAuth();
  try { profile = await api("/api/profile"); }
  catch (e) { token = null; localStorage.removeItem("token"); return renderAuth(); }
  if (!profile.target) return renderOnboarding();
  if (currentTab === "home")     return renderHome();
  if (currentTab === "why")      return renderWhy();
  if (currentTab === "trends")   return renderTrends();
  if (currentTab === "settings") return renderSettings();
}

// ── Nav ───────────────────────────────────────────────────────────────────
function nav() {
  return `<nav class="tabs">
    ${[["home","Today"],["trends","Trends"],["why","Why"]].map(([id,label]) =>
      `<button data-tab="${id}" class="${currentTab===id?"active":""}">${label}</button>`
    ).join("")}
  </nav>`;
}

function bindNav() {
  document.querySelectorAll("nav.tabs button").forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      if (currentTab !== "home") lastFeedback = null;
      render();
    };
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }

function toDatetimeLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function showToast(msg) {
  document.getElementById("toast")?.remove();
  const el = document.createElement("div");
  el.id = "toast"; el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.offsetHeight; el.classList.add("visible"); });
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// ── Notifications ─────────────────────────────────────────────────────────
function scheduleNextDoseNotification(logTimestamp) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  clearTimeout(_notifTimer1);
  clearTimeout(_notifTimer2);
  const now = Date.now();
  const base = Math.max(logTimestamp, now - 60000);
  const delay1 = (base + 2.5 * 3600000) - now;
  const delay2 = (base + 5.0 * 3600000) - now;
  if (delay1 > 0) {
    _notifTimer1 = setTimeout(() => showSystemNotification(
      "Time for your next protein dose",
      "Your 3-hour window is open. Log now to keep the anabolic signal going."
    ), delay1);
  }
  if (delay2 > 0) {
    _notifTimer2 = setTimeout(() => showSystemNotification(
      "Protein dose overdue",
      "5 hours since your last dose — the anabolic signal is fading. Log now."
    ), delay2);
  }
}

async function showSystemNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, tag: "protein-dose", renotify: true });
      return;
    } catch {}
  }
  new Notification(title, { body });
}

// ── Auth ──────────────────────────────────────────────────────────────────
function renderAuth() {
  appEl.innerHTML = `
    <div class="landing-hero">
      <div class="brand-name">Synth</div>
      <div class="brand-tagline">Time your protein.<br>Build more muscle.</div>
    </div>

    <div class="science-card">
      <span class="science-icon">📊</span>
      <div class="science-title">Same food. Significantly more muscle.</div>
      <div class="science-body">Research shows splitting your daily protein into 3–4 evenly-spaced doses can produce up to 25% more muscle protein synthesis than eating the same total in 1–2 large meals — without changing a single thing you eat.</div>
      <div class="science-source">Areta et al., 2013 — Journal of Physiology</div>
    </div>

    <div class="science-card">
      <span class="science-icon">⏱</span>
      <div class="science-title">The 3-hour rule.</div>
      <div class="science-body">Doses spaced roughly 3 hours apart hit the sweet spot for muscle growth. Too close and protein gets wasted. Too far apart and you leave a gap in the anabolic signal your muscles need to recover and grow.</div>
      <div class="science-source">Mamerow et al., 2014 — Journal of Nutrition</div>
    </div>

    <div class="science-card">
      <span class="science-icon">❌</span>
      <div class="science-title">The 30-min post-workout window is a myth.</div>
      <div class="science-body">Muscle protein synthesis stays elevated for hours after training — not 30 minutes. What drives results is your protein pattern across the whole day. Synth tracks that, so you don't have to think about it.</div>
    </div>

    <div class="auth-divider">Get started</div>

    <div class="card">
      <h2 id="authTitle">Log in</h2>
      <div id="authError" class="error"></div>
      <input id="username" placeholder="Username" autocomplete="username" />
      <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
      <button id="authSubmit">Log in</button>
      <button class="secondary" id="authSwitch">Need an account? Sign up</button>
    </div>
  `;
  let mode = "login";
  document.getElementById("authSwitch").onclick = () => {
    mode = mode === "login" ? "signup" : "login";
    document.getElementById("authTitle").textContent = mode === "login" ? "Log in" : "Sign up";
    document.getElementById("authSubmit").textContent = mode === "login" ? "Log in" : "Sign up";
    document.getElementById("authSwitch").textContent = mode === "login"
      ? "Need an account? Sign up" : "Already have an account? Log in";
  };
  document.getElementById("authSubmit").onclick = async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errEl = document.getElementById("authError");
    errEl.textContent = "";
    if (!username || !password) { errEl.textContent = "Enter a username and password."; return; }
    try {
      const { token: t } = await api(mode === "login" ? "/api/login" : "/api/signup", {
        method: "POST", body: { username, password }
      });
      token = t; localStorage.setItem("token", token); render();
    } catch (e) { errEl.textContent = e.message; }
  };
}

// ── Onboarding ────────────────────────────────────────────────────────────
function renderOnboarding() {
  appEl.innerHTML = `
    <div class="onb-header">
      <div class="app-logo" style="margin-bottom:12px">Synth</div>
      <h1 style="margin-bottom:6px">Quick setup</h1>
      <p class="muted">Takes 20 seconds. Just enough to calculate your daily target.</p>
    </div>
    <div class="card">
      <h2>Your details</h2>
      <label class="field-label">Body weight (kg)</label>
      <input id="weight" type="number" placeholder="e.g. 80" />
      <label class="field-label">Activity level</label>
      <select id="activity">
        <option value="sedentary">Mostly sedentary</option>
        <option value="active">Active a few times a week</option>
        <option value="training" selected>Regular resistance training</option>
        <option value="serious">Serious / competitive training</option>
      </select>
      <div id="onbError" class="error"></div>
      <button id="onbSubmit" style="margin-top:4px">Calculate my target</button>
    </div>
  `;
  document.getElementById("onbSubmit").onclick = async () => {
    const weightKg    = parseFloat(document.getElementById("weight").value);
    const activityLevel = document.getElementById("activity").value;
    const errEl       = document.getElementById("onbError");
    if (!weightKg || weightKg <= 0) { errEl.textContent = "Enter a valid weight."; return; }
    const result = await api("/api/profile", { method: "POST", body: { weightKg, activityLevel } });
    profile = result;
    renderOnboardingPlan(result, weightKg, activityLevel);
  };
}

// ── Onboarding completion plan screen ─────────────────────────────────────
function renderOnboardingPlan(prof, weightKg, activityLevel) {
  const activityFactors = { sedentary: 1.4, active: 1.6, training: 1.9, serious: 2.2 };
  const factor = activityFactors[activityLevel] || 1.9;
  const activityLabel = {
    sedentary: "mostly sedentary",
    active:    "active a few times a week",
    training:  "regular training",
    serious:   "serious training"
  }[activityLevel] || activityLevel;

  const idealDoses = Math.max(3, Math.min(6, Math.round(prof.target / 35)));
  const perDose    = Math.round(prof.target / idealDoses);

  const times = [];
  for (let i = 0; i < idealDoses; i++) {
    const h = 8 + i * 3;
    const suffix = h >= 12 ? "pm" : "am";
    const display = h > 12 ? h - 12 : h;
    times.push(`${display}${suffix}`);
  }

  appEl.innerHTML = `
    <div class="onb-plan-header">
      <div class="app-logo" style="margin-bottom:12px">Synth</div>
      <h1>Your plan</h1>
    </div>

    <div class="card">
      <div class="plan-target">
        <div class="plan-target-num">${prof.target}g</div>
        <div class="plan-target-label">daily protein target</div>
      </div>
      <div class="plan-calc">${weightKg}kg × ${factor} (${activityLabel}) = ${prof.target}g / day</div>
    </div>

    <div class="card">
      <h2>How to hit it</h2>
      <div class="plan-dose-row">
        <span class="plan-dose-num">${idealDoses} doses</span>
        <span class="plan-dose-of">of ~${perDose}g each</span>
      </div>
      <div class="plan-spacing">Spaced every 3 hours for optimal muscle protein synthesis</div>
      <div class="plan-example">
        <div class="plan-example-label">Example schedule</div>
        <div class="plan-times">
          ${times.map(t => `
            <div class="plan-time-item">
              <div class="plan-time-dot"></div>
              <div class="plan-time-text">${t} — ${perDose}g</div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <button id="startTracking">Start tracking</button>
  `;
  document.getElementById("startTracking").onclick = () => render();
}

// ── Ring progress ─────────────────────────────────────────────────────────
function ringHtml(pct, totalGrams, target, streak) {
  const R = 54, cx = 66, cy = 66;
  const C      = +(2 * Math.PI * R).toFixed(2);
  const offset = +(C - Math.min(pct, 100) / 100 * C).toFixed(2);
  const fillCls = pct < 50 ? "ring-fill-warn" : "ring-fill-good";
  const streakEl = streak > 0
    ? `<div class="ring-streak">🔥 ${streak} day${streak !== 1 ? "s" : ""}</div>`
    : "";
  return `
    <div class="ring-wrap">
      <svg viewBox="0 0 132 132" class="ring-svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" class="ring-track-el" stroke-width="11"/>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" class="${fillCls}" stroke-width="11"
          stroke-dasharray="${C}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)"/>
      </svg>
      <div class="ring-center">
        <div class="ring-grams">${totalGrams}<span class="ring-g">g</span></div>
        <div class="ring-of">of ${target}g</div>
        ${streakEl}
      </div>
    </div>`;
}

// ── Daily grade ───────────────────────────────────────────────────────────
function calcGrade(today) {
  const pct = today.totalGrams / (today.target || 1) * 100;
  const sp  = today.spacingQuality;
  if (pct >= 90 && sp === "good")  return { g: "A", cls: "grade-a" };
  if (pct >= 90 && sp === "mixed") return { g: "B", cls: "grade-b" };
  if (pct >= 75 && sp === "good")  return { g: "B", cls: "grade-b" };
  if (pct >= 60)                   return { g: "C", cls: "grade-c" };
  return { g: "D", cls: "grade-d" };
}

// ── Smart status message ──────────────────────────────────────────────────
function buildSmartStatus(today, streak) {
  const sorted    = [...today.entries].sort((a, b) => a.timestamp - b.timestamp);
  const pct       = today.totalGrams / (today.target || 1) * 100;
  const remaining = Math.max(0, (today.target || 0) - today.totalGrams);
  const h         = new Date().getHours();
  const openGapH  = today.openGapHours || 0;

  if (pct > 110) {
    return { level: "warn", message: `${Math.round(pct)}% of target — you've gone over. Extra protein won't build extra muscle.` };
  }
  if (pct >= 90 && today.spacingQuality === "good") {
    if (streak >= 3) return { level: "good", message: `Target hit, great spacing — ${streak} days in a row. Habit locked in.` };
    return { level: "good", message: `Target hit with great spacing. Exactly what you want.` };
  }
  if (pct >= 90) {
    return { level: "warn", message: `Target hit but spacing was off. Same total tomorrow — spread it better.` };
  }
  if (sorted.length === 0) {
    if (h < 10) return { level: "warn", message: `Good morning — nothing logged yet. Start strong with 25–35g.` };
    if (h < 14) return { level: "warn", message: `${remaining}g to go. Log your first dose to get started.` };
    return { level: "bad", message: `Nothing logged yet and it's ${h < 18 ? "afternoon" : "evening"} — log now.` };
  }
  if (openGapH > 5) {
    return { level: "bad", message: `${Math.round(openGapH)}h since your last dose — anabolic signal fading. Log now.` };
  }
  if (openGapH > 3.5) {
    return { level: "warn", message: `${(openGapH).toFixed(1)}h since your last dose — top up soon.` };
  }
  if (h >= 18 && remaining > (today.target || 0) * 0.4) {
    return { level: "bad", message: `${remaining}g still needed and it's evening. Push to get your last doses in.` };
  }
  if (pct >= 50 && today.spacingQuality === "good" && sorted.length > 0) {
    const nextAt = new Date(sorted[sorted.length - 1].timestamp + 3 * 3600000)
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { level: "good", message: `Good pacing — ${remaining}g left. Next window opens around ${nextAt}.` };
  }
  return today.status;
}

// ── Weekly summary ─────────────────────────────────────────────────────────
function weekSummaryHtml(trends, target) {
  if (!trends || trends.length === 0) return "";
  const weekAvg     = Math.round(trends.reduce((s, d) => s + d.totalGrams, 0) / trends.length);
  const daysOnTarget = trends.filter(d => {
    const p = d.totalGrams / (target || 1) * 100;
    return p >= 90 && p <= 110;
  }).length;
  const avgPct = Math.round(weekAvg / (target || 1) * 100);
  const pctCls = avgPct >= 90 && avgPct <= 110 ? "good" : "";
  return `
    <div class="card weekly-card">
      <h2>This week</h2>
      <div class="weekly-stats">
        <div class="weekly-stat">
          <div class="wstat-val">${weekAvg}g</div>
          <div class="wstat-label">avg per day</div>
        </div>
        <div class="weekly-stat">
          <div class="wstat-val">${daysOnTarget}/${trends.length}</div>
          <div class="wstat-label">days on target</div>
        </div>
        <div class="weekly-stat">
          <div class="wstat-val ${pctCls}">${avgPct}%</div>
          <div class="wstat-label">of target avg</div>
        </div>
      </div>
    </div>`;
}

// ── Share today ───────────────────────────────────────────────────────────
async function shareToday(today, grade, streak) {
  const pct  = Math.round(today.totalGrams / (today.target || 1) * 100);
  const text = [
    "Synth — Protein Timing",
    "",
    `Today: ${today.totalGrams}g / ${today.target}g  (${pct}%)`,
    `Grade: ${grade.g}  ·  Spacing: ${today.spacingQuality}`,
    streak > 0 ? `🔥 ${streak}-day streak` : null,
    "",
    "Time your protein. Build more muscle."
  ].filter(l => l !== null).join("\n");

  if (navigator.share) {
    try { await navigator.share({ title: "My protein day — Synth", text }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    showToast("Couldn't share");
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────
function renderTimeline(entries) {
  const START_H = 6, END_H = 23;
  const RANGE_MS = (END_H - START_H) * 3600000;
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(START_H, 0, 0, 0);
  function toPct(ts) { return +(Math.min(100, Math.max(0, (ts - dayStart.getTime()) / RANGE_MS * 100)).toFixed(2)); }

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const nowPct = toPct(now.getTime());

  const segments = sorted.slice(1).map((e, i) => {
    const p1 = toPct(sorted[i].timestamp), p2 = toPct(e.timestamp);
    const color = e.gapFlag === "gap" ? "var(--bad)" : e.gapFlag === "too_close" ? "var(--warn)" : "var(--green)";
    return `<div class="tl-segment" style="left:${p1}%;width:${p2-p1}%;background:${color}"></div>`;
  }).join("");

  const dots = sorted.map(e => {
    const pct = toPct(e.timestamp);
    let cls = "tl-dot-good";
    if (e.gapFlag === "gap") cls = "tl-dot-bad";
    else if (e.doseType === "small" || e.gapFlag === "too_close") cls = "tl-dot-warn";
    const t = new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `<div class="tl-dot ${cls}" style="left:${pct}%"><div class="tl-label">${e.grams}g</div><div class="tl-time">${t}</div></div>`;
  }).join("");

  return `
    <div class="timeline-outer">
      <div class="tl-track">
        ${segments}${dots}
        <div class="tl-now-line" style="left:${nowPct}%"></div>
      </div>
      <div class="tl-hours">${["6am","9am","12pm","3pm","6pm","9pm"].map(l=>`<div class="tl-hour-label">${l}</div>`).join("")}</div>
      ${entries.length === 0 ? `<div class="tl-empty">No doses yet — add your first one below.</div>` : ""}
      <div class="tl-legend">
        <div class="tl-legend-item"><div class="tl-legend-pip pip-good"></div>Well timed</div>
        <div class="tl-legend-item"><div class="tl-legend-pip pip-warn"></div>Close / small</div>
        <div class="tl-legend-item"><div class="tl-legend-pip pip-bad"></div>Long gap</div>
        <div class="tl-legend-item"><div class="tl-legend-pip pip-now"></div>Now</div>
      </div>
    </div>`;
}

// ── Post-log feedback ─────────────────────────────────────────────────────
function buildFeedback(entry, today) {
  const sorted = [...today.entries].sort((a, b) => a.timestamp - b.timestamp);
  const isFirst = sorted.length === 1 || sorted[0].timestamp === entry.timestamp;
  const items = [];

  if (entry.doseType === "small") {
    items.push({ type: "warn", text: "Under 20g — likely not enough to strongly trigger muscle protein synthesis. Aim for 25–35g next time." });
  } else if (entry.doseType === "large") {
    items.push({ type: "warn", text: "Above ~40g, extra protein doesn't add proportionally more stimulus. Consider splitting large doses next time." });
  } else {
    items.push({ type: "good", text: "Solid dose — right in the 20–40g sweet spot. Your muscles will respond well to this." });
  }

  if (isFirst) {
    items.push({ type: "info", text: "First dose of the day — good start. Next one at least 3 hours from now." });
  } else if (entry.gapFlag === "too_close") {
    const mins = Math.round((entry.gapHours || 0) * 60);
    items.push({ type: "warn", text: `Only ${mins} min since your last dose. Stacked doses compete — space at least 3 hours apart.` });
  } else if (entry.gapFlag === "gap") {
    const hrs = Math.floor(entry.gapHours || 0);
    const mins = Math.round(((entry.gapHours || 0) - hrs) * 60);
    items.push({ type: "warn", text: `${mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`} gap since last dose. Gaps over 5 hours let the anabolic signal fade.` });
  } else {
    const hrs = Math.floor(entry.gapHours || 0);
    const mins = Math.round(((entry.gapHours || 0) - hrs) * 60);
    items.push({ type: "good", text: `Well timed — ${mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`} since last dose. That spacing is exactly what you want.` });
  }

  const remaining = Math.max(0, (today.target || 0) - today.totalGrams);
  const nextTime  = new Date(entry.timestamp + 3 * 3600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (remaining <= 0) {
    items.push({ type: "good", text: `Daily target hit — ${today.target}g reached. Focus on recovery and sleep.` });
  } else {
    const dosesLeft = Math.max(1, Math.ceil(remaining / 32));
    items.push({ type: "info", text: `${remaining}g left — ~${dosesLeft} more dose${dosesLeft !== 1 ? "s" : ""} to hit ${today.target}g. Next window opens after ${nextTime}.` });
  }

  return { grams: entry.grams, timestamp: entry.timestamp, items };
}

function renderFeedbackCard(fb) {
  if (!fb) return "";
  const t = new Date(fb.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const icon = { good: "✓", warn: "!", info: "→" };
  const cls  = { good: "fb-good", warn: "fb-warn", info: "fb-info" };
  return `
    <div class="feedback-card" id="feedbackCard">
      <div class="feedback-header">
        <div>
          <div class="feedback-title">Last entry</div>
          <div class="feedback-logged">${fb.grams}g logged at ${t}</div>
        </div>
        <button class="feedback-dismiss" id="fbDismiss">✕</button>
      </div>
      <div class="feedback-items">
        ${fb.items.map(i => `
          <div class="feedback-item ${cls[i.type]}">
            <div class="fb-icon">${icon[i.type]}</div>
            <span>${i.text}</span>
          </div>`).join("")}
      </div>
    </div>`;
}

// ── Home ──────────────────────────────────────────────────────────────────
async function renderHome(prefetched = null) {
  let today, streak, trends;
  if (prefetched) {
    today  = prefetched.today;
    streak = prefetched.streak ?? 0;
    trends = prefetched.trends ?? [];
  } else {
    const [t, s, tr] = await Promise.all([api("/api/today"), api("/api/streak"), api("/api/trends")]);
    today = t; streak = s.streak || 0; trends = tr;
  }
  cachedHomeData = { today, streak, trends };

  const pct       = Math.min(100, Math.round(today.totalGrams / (today.target || 1) * 100));
  const remaining = Math.max(0, (today.target || 0) - today.totalGrams);
  const idealDoses = Math.max(3, Math.min(6, Math.round((today.target || 0) / 35)));
  const sorted    = [...today.entries].sort((a, b) => a.timestamp - b.timestamp);
  const grade     = calcGrade(today);
  const status    = buildSmartStatus(today, streak);
  const statusIcon = { good: "✓", warn: "◎", bad: "↓" }[status.level];

  // Log tip
  let logTip = "", logTipCls = "";
  const restPrefix = !isTrainingDay ? "Rest day: " : "";
  if (sorted.length === 0) {
    logTip = isTrainingDay
      ? "Start with 25–35g for your first dose of the day."
      : "Rest day — protein is still critical for recovery. Aim for your full target.";
  } else {
    const last    = sorted[sorted.length - 1];
    const minNext = last.timestamp + 2.5 * 3600000;
    const idealNext = last.timestamp + 3.0 * 3600000;
    const now     = Date.now();
    if (now < minNext) {
      const mins = Math.round((minNext - now) / 60000);
      logTip = `${restPrefix}⏱ Next window opens in ~${mins} min. Logging now? Doses this close are less effective.`;
      logTipCls = "warn";
    } else if (now < idealNext) {
      logTip = `${restPrefix}✓ Good window — right time for your next dose. Aim for 25–35g.`;
    } else {
      logTip = `${restPrefix}↑ Overdue — time to top up. Aim for 25–35g to get back on track.`;
    }
  }

  // Entry list with edit + delete buttons
  const logListHtml = sorted.length === 0
    ? `<p class="muted" style="text-align:center;padding:8px 0">Nothing logged yet today.</p>`
    : sorted.map(e => {
        if (e.id === editingEntryId) {
          return `
            <div class="entry-edit-wrap" id="editForm">
              <div class="entry-edit-row">
                <input id="editGrams" type="number" value="${e.grams}" placeholder="Grams" min="1" max="300"/>
                <input id="editTime" type="datetime-local" value="${toDatetimeLocal(e.timestamp)}"/>
              </div>
              <div class="entry-edit-actions">
                <button class="edit-save-btn" id="editSave">Save</button>
                <button class="edit-cancel-btn secondary" id="editCancel">Cancel</button>
              </div>
            </div>`;
        }
        let tag = "Good", tagCls = "tag-good", dotColor = "var(--green)";
        if (e.gapFlag === "gap")            { tag = "Long gap";  tagCls = "tag-bad";  dotColor = "var(--bad)"; }
        else if (e.gapFlag === "too_close") { tag = "Too close"; tagCls = "tag-warn"; dotColor = "var(--warn)"; }
        else if (e.doseType === "small")    { tag = "Small";     tagCls = "tag-warn"; dotColor = "var(--warn)"; }
        const t = new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `
          <div class="entry-row">
            <div class="entry-left">
              <div class="entry-dot" style="background:${dotColor}"></div>
              <div class="entry-main">
                <div class="entry-grams">${e.grams}g</div>
                <div class="entry-time">${t}</div>
              </div>
            </div>
            <div class="entry-right">
              <span class="entry-tag ${tagCls}">${tag}</span>
              <button class="edit-btn" data-id="${e.id}" title="Edit">✎</button>
              <button class="delete-btn" data-id="${e.id}" title="Delete">×</button>
            </div>
          </div>`;
      }).join("");

  appEl.innerHTML = `
    <header class="app-header">
      <div class="app-logo">Synth</div>
      <div class="header-actions">
        <button class="icon-btn" id="settingsBtn" title="Settings">⚙</button>
        <button class="logout-btn" id="logoutBtn">Log out</button>
      </div>
    </header>

    <div class="mode-toggle">
      <button id="modeTraining" class="${isTrainingDay ? "mode-active" : ""}">🏋️ Training day</button>
      <button id="modeRest"     class="${!isTrainingDay ? "mode-active" : ""}">😴 Rest day</button>
    </div>

    <div class="hero-card">
      ${ringHtml(pct, today.totalGrams, today.target, streak)}
      <div class="status-chip ${status.level}">${statusIcon} ${status.message}</div>
      <div class="hero-stats">
        <div class="hero-stat">
          <div class="hstat-val ${remaining === 0 ? "good" : ""}">${remaining}g</div>
          <div class="hstat-label">remaining</div>
        </div>
        <div class="hero-stat">
          <div class="hstat-val">${sorted.length}<span style="font-size:12px;font-weight:500;color:var(--muted)">/${idealDoses}</span></div>
          <div class="hstat-label">doses</div>
        </div>
        <div class="hero-stat">
          <div class="hstat-val ${grade.cls}">${grade.g}</div>
          <div class="hstat-label">today's grade</div>
        </div>
      </div>
      <button class="share-btn" id="shareBtn">Share today ↗</button>
    </div>

    ${weekSummaryHtml(trends, today.target)}

    <div class="card">
      <h2>Timing today</h2>
      ${renderTimeline(today.entries)}
    </div>

    ${renderFeedbackCard(lastFeedback)}

    <div class="card">
      <h2>Log protein</h2>
      <div class="log-tip ${logTipCls}">${logTip}</div>
      <div class="grams-row">
        <input id="logGrams" class="grams-input" type="number" placeholder="30" min="1" max="300" />
        <span class="grams-unit">g</span>
      </div>
      <div id="gramsQuality" class="grams-quality gq-empty"></div>
      <label class="time-label">Time</label>
      <input id="logTime" type="datetime-local" />
      <button id="logSubmit" class="log-btn">Log protein</button>
    </div>

    <div class="card">
      <h2>Today's log</h2>
      ${logListHtml}
    </div>

    ${nav()}
  `;

  document.getElementById("logTime").value = toDatetimeLocal(Date.now());

  document.getElementById("logGrams").addEventListener("input", function () {
    const g  = parseInt(this.value) || 0;
    const el = document.getElementById("gramsQuality");
    if (g === 0)      { el.textContent = ""; el.className = "grams-quality gq-empty"; return; }
    if (g < 20)       { el.textContent = "Under 20g — may not strongly trigger muscle growth";  el.className = "grams-quality gq-warn"; }
    else if (g <= 40) { el.textContent = "Ideal — sweet spot for muscle protein synthesis";      el.className = "grams-quality gq-good"; }
    else              { el.textContent = "Above sweet spot — consider splitting across doses";   el.className = "grams-quality gq-warn"; }
  });

  document.getElementById("logSubmit").onclick = async () => {
    const grams   = parseInt(document.getElementById("logGrams").value);
    const timeVal = document.getElementById("logTime").value;
    if (!grams || grams <= 0) return;
    const btn = document.getElementById("logSubmit");
    btn.textContent = "Logging…"; btn.disabled = true;
    await logEntry(grams, timeVal ? new Date(timeVal).getTime() : Date.now());
  };

  document.getElementById("fbDismiss")?.addEventListener("click", () => {
    lastFeedback = null;
    document.getElementById("feedbackCard")?.remove();
  });

  document.getElementById("logoutBtn").onclick = () => {
    token = null; localStorage.removeItem("token"); lastFeedback = null; cachedHomeData = null; render();
  };

  document.getElementById("settingsBtn").onclick = () => {
    currentTab = "settings";
    renderSettings();
  };

  document.getElementById("shareBtn").onclick = () => shareToday(today, grade, streak);

  document.getElementById("modeTraining").onclick = () => {
    isTrainingDay = true; localStorage.setItem("trainingDay", "true"); renderHome();
  };
  document.getElementById("modeRest").onclick = () => {
    isTrainingDay = false; localStorage.setItem("trainingDay", "false"); renderHome();
  };

  // Edit buttons
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.onclick = () => {
      editingEntryId = btn.dataset.id;
      renderHome(cachedHomeData);
    };
  });

  // Edit form save/cancel
  document.getElementById("editSave")?.addEventListener("click", async () => {
    const grams   = parseInt(document.getElementById("editGrams").value);
    const timeVal = document.getElementById("editTime").value;
    if (!grams || grams <= 0) return;
    await api(`/api/log/${editingEntryId}`, {
      method: "PUT",
      body: { grams, timestamp: timeVal ? new Date(timeVal).getTime() : Date.now() }
    });
    editingEntryId = null;
    renderHome();
  });
  document.getElementById("editCancel")?.addEventListener("click", () => {
    editingEntryId = null;
    renderHome(cachedHomeData);
  });

  // Delete buttons
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "…";
      await api(`/api/log/${btn.dataset.id}`, { method: "DELETE" });
      lastFeedback = null;
      editingEntryId = null;
      renderHome();
    };
  });

  bindNav();
}

async function logEntry(grams, timestamp) {
  await api("/api/log", { method: "POST", body: { grams, timestamp } });
  if (navigator.vibrate) navigator.vibrate(40);
  scheduleNextDoseNotification(timestamp);
  const [today, streakData, trendsData] = await Promise.all([api("/api/today"), api("/api/streak"), api("/api/trends")]);
  const sorted = [...today.entries].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length > 0) {
    const entry = sorted.reduce((best, e) =>
      Math.abs(e.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? e : best
    , sorted[0]);
    lastFeedback = buildFeedback(entry, today);
  }
  renderHome({ today, streak: streakData.streak || 0, trends: trendsData });
}

// ── Settings ──────────────────────────────────────────────────────────────
async function renderSettings() {
  const notifStatus = "Notification" in window ? Notification.permission : "not-supported";

  appEl.innerHTML = `
    <header class="app-header">
      <div class="app-logo">Synth</div>
      <button class="logout-btn" id="settingsBackBtn">← Back</button>
    </header>

    <div style="padding:12px 0 20px"><h1>Settings</h1></div>

    <div class="settings-section-title">Profile</div>
    <div class="card">
      <h2>Your details</h2>
      <label class="field-label">Body weight (kg)</label>
      <input id="settingsWeight" type="number" value="${profile?.weightKg || ""}" placeholder="e.g. 80"/>
      <label class="field-label">Activity level</label>
      <select id="settingsActivity">
        <option value="sedentary" ${profile?.activityLevel === "sedentary" ? "selected" : ""}>Mostly sedentary</option>
        <option value="active"    ${profile?.activityLevel === "active"    ? "selected" : ""}>Active a few times a week</option>
        <option value="training"  ${profile?.activityLevel === "training"  ? "selected" : ""}>Regular resistance training</option>
        <option value="serious"   ${profile?.activityLevel === "serious"   ? "selected" : ""}>Serious / competitive training</option>
      </select>
      <div id="settingsProfileMsg" style="font-size:13px;min-height:20px;margin-bottom:8px"></div>
      <button id="saveProfileBtn">Save changes</button>
    </div>

    <div class="settings-section-title">Appearance</div>
    <div class="card">
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-label">Dark mode</div>
          <div class="settings-row-sub">Easier on the eyes in low light</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="darkModeToggle" ${localStorage.getItem("theme") === "dark" ? "checked" : ""}/>
          <span class="toggle-knob"></span>
        </label>
      </div>
    </div>

    <div class="settings-section-title">Notifications</div>
    <div class="card">
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-label">Dose reminders</div>
          <div class="settings-row-sub">Reminded when your next window opens</div>
        </div>
        ${notifStatus === "granted"
          ? `<span class="notif-status-on">ON</span>`
          : notifStatus === "denied"
          ? `<span class="notif-status-off">Blocked</span>`
          : notifStatus === "not-supported"
          ? `<span class="notif-status-off">Not supported</span>`
          : `<button class="notif-enable-btn" id="enableNotifBtn">Enable</button>`}
      </div>
      ${notifStatus === "denied"
        ? `<div class="settings-note">To enable, allow notifications for this site in your browser settings.</div>` : ""}
    </div>

    <div class="settings-section-title">Account</div>
    <div class="card">
      <button class="secondary" id="settingsLogoutBtn" style="margin:0">Log out</button>
    </div>
  `;

  document.getElementById("settingsBackBtn").onclick = () => {
    currentTab = "home";
    renderHome(cachedHomeData);
  };

  document.getElementById("saveProfileBtn").onclick = async () => {
    const weightKg      = parseFloat(document.getElementById("settingsWeight").value);
    const activityLevel = document.getElementById("settingsActivity").value;
    const msgEl         = document.getElementById("settingsProfileMsg");
    if (!weightKg || weightKg <= 0) {
      msgEl.textContent = "Enter a valid weight."; msgEl.style.color = "var(--bad)"; return;
    }
    try {
      const result = await api("/api/profile", { method: "POST", body: { weightKg, activityLevel } });
      profile = result;
      cachedHomeData = null;
      msgEl.textContent = `Saved — new target: ${result.target}g / day`;
      msgEl.style.color = "var(--green)";
    } catch (e) {
      msgEl.textContent = e.message; msgEl.style.color = "var(--bad)";
    }
  };

  document.getElementById("darkModeToggle").onchange = function () {
    setTheme(this.checked ? "dark" : "light");
  };

  document.getElementById("enableNotifBtn")?.addEventListener("click", async () => {
    const perm = await Notification.requestPermission();
    if (perm === "granted") showToast("Notifications enabled");
    else showToast("Notifications not granted");
    renderSettings();
  });

  document.getElementById("settingsLogoutBtn").onclick = () => {
    token = null; localStorage.removeItem("token"); lastFeedback = null; cachedHomeData = null; render();
  };
}

// ── Why ───────────────────────────────────────────────────────────────────
function renderWhy() {
  const sections = [
    {
      id: "s1", icon: "⏰",
      title: `The "anabolic window" myth`,
      body: `
        <p>Gym culture says you have a strict 30-minute window after training to consume protein — miss it and you miss the gains. This idea took hold in the early 2000s and became one of the most repeated pieces of gym advice ever.</p>
        <p>The research tells a different story. Muscle protein synthesis (your body's muscle-building response) stays elevated for <strong>several hours</strong> after resistance training — not 30 minutes. The urgency around the post-workout window is largely exaggerated.</p>
        <div class="why-callout">
          <div class="why-callout-label">What this means for you</div>
          Don't stress about slamming a shake the second you put the barbell down. Your whole-day protein pattern matters far more than whether you hit a 30-minute window.
        </div>`
    },
    {
      id: "s2", icon: "⚡",
      title: "What actually matters: spacing",
      body: `
        <p>A landmark 2013 study (Areta et al.) gave three groups the same total protein — 80g — over 12 hours, but spaced differently:</p>
        <p>• <strong>Group A:</strong> 8 × 10g doses every 1.5 hours<br>
           • <strong>Group B:</strong> 4 × 20g doses every 3 hours<br>
           • <strong>Group C:</strong> 2 × 40g doses every 6 hours</p>
        <p>Group B — the 3-hour group — showed significantly greater muscle protein synthesis. Not the most frequent. Not the least frequent. The 3-hour pattern won.</p>
        <div class="why-callout">
          <div class="why-callout-label">How Synth uses this</div>
          Synth tracks whether your doses are spaced ~3 hours apart across the day. The coloured timeline on your home screen shows exactly where your spacing is strong and where there are gaps.
        </div>`
    },
    {
      id: "s3", icon: "⚠️",
      title: "Why small or close-together doses are flagged",
      body: `
        <p><strong>Small doses (under 20g):</strong> Below around 20g, a dose doesn't produce a strong enough anabolic stimulus to meaningfully drive muscle protein synthesis. You're consuming the protein, but your muscles aren't getting the full signal.</p>
        <p><strong>Doses too close together (under 2.5h):</strong> When a second dose arrives before the first has been fully processed, they compete. The amino acid signalling pathways are still active from the previous dose, and the efficiency of the second one drops sharply.</p>
        <div class="why-callout">
          <div class="why-callout-label">How Synth uses this</div>
          Entries under 20g are flagged as "Small dose". Entries within 2.5 hours of the previous one are flagged as "Too close". Both show as amber on your timeline.
        </div>`
    },
    {
      id: "s4", icon: "🔬",
      title: "Being honest about the uncertainty",
      body: `
        <p>Newer research (Trommelen et al. 2023) suggests that the muscle-building response to a large protein dose may last considerably longer than the Areta study assumed — potentially 5–6 hours for a 100g dose. If true, this would change the optimal spacing recommendation.</p>
        <p>The science is still evolving. Individual factors — age, training status, body composition, and the specific protein source — all affect the optimal pattern for any given person.</p>
        <div class="why-callout">
          <div class="why-callout-label">Synth's position</div>
          We use the best-supported pattern in the current evidence base — doses of 20–40g spaced roughly every 3 hours — as a practical guide, not a rigid rule. As the research evolves, so will the app.
        </div>`
    }
  ];

  appEl.innerHTML = `
    <div class="why-hero">
      <div class="why-hero-eyebrow">Synth</div>
      <div class="why-hero-title">The science</div>
      <div class="why-hero-sub">Evidence-based. No bro-science.</div>
    </div>

    <div class="card why-stats-card">
      <div class="why-stats">
        <div class="why-stat">
          <div class="why-stat-val">3h</div>
          <div class="why-stat-label">ideal gap between doses</div>
        </div>
        <div class="why-stat">
          <div class="why-stat-val">20–40g</div>
          <div class="why-stat-label">per dose sweet spot</div>
        </div>
        <div class="why-stat">
          <div class="why-stat-val">~25%</div>
          <div class="why-stat-label">more MPS vs poor timing</div>
        </div>
      </div>
    </div>

    ${sections.map(s => `
      <div class="accordion-item" id="acc-${s.id}">
        <button class="accordion-header" data-id="${s.id}">
          <span class="accordion-icon">${s.icon}</span>
          <span class="accordion-title">${s.title}</span>
          <span class="accordion-chevron">▼</span>
        </button>
        <div class="accordion-body" id="body-${s.id}">
          <div class="accordion-content">${s.body}</div>
        </div>
      </div>`).join("")}

    <div class="why-cite">
      Areta et al. 2013, J Physiol 591(9):2319–31<br>
      Mamerow et al. 2014, J Nutr<br>
      Trommelen et al. 2023, Cell Reports Medicine
    </div>

    ${nav()}
  `;

  document.querySelectorAll(".accordion-header").forEach(btn => {
    btn.onclick = () => {
      const id   = btn.dataset.id;
      const item = document.getElementById(`acc-${id}`);
      const body = document.getElementById(`body-${id}`);
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".accordion-item").forEach(el => {
        el.classList.remove("open");
        el.querySelector(".accordion-body").style.maxHeight = "0";
      });
      if (!isOpen) {
        item.classList.add("open");
        body.style.maxHeight = body.scrollHeight + "px";
      }
    };
  });

  bindNav();
}

// ── Trends ────────────────────────────────────────────────────────────────
async function renderTrends() {
  const [trends, prof] = await Promise.all([api("/api/trends"), api("/api/profile")]);
  const target = prof.target || 0;
  const sorted = [...trends].sort((a, b) => a.day.localeCompare(b.day));

  const sqLabel = { good: "Good spacing", mixed: "Mixed spacing", poor: "Poor spacing" };

  const rowsHtml = sorted.length === 0
    ? `<p class="muted" style="text-align:center;padding:12px 0">Log a few days to see trends here.</p>`
    : sorted.map(d => {
        const pctOfTarget = Math.round(d.totalGrams / (target || 1) * 100);
        const isOver = pctOfTarget > 110;
        const isHit  = d.hitTarget && !isOver;
        const barCls  = isOver ? "over" : (isHit ? "" : "miss");
        const barPct  = Math.min(100, pctOfTarget);
        const tickCls = isOver ? "over" : (isHit ? "hit" : "miss");
        const tickChar = isOver ? "↑" : (isHit ? "✓" : "✗");
        const sq    = d.spacingQuality || "good";
        const label = new Date(d.day + "T12:00:00")
          .toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        const overTitle = isOver ? ` title="Over target (${pctOfTarget}% — excess protein isn't stored as muscle)"` : "";
        return `
          <div class="trend-row">
            <div class="trend-date">${label}</div>
            <div class="trend-grams">${d.totalGrams}g</div>
            <div class="trend-bar-wrap">
              <div class="trend-bar-fill ${barCls}" style="width:${barPct}%"></div>
            </div>
            <div title="${sqLabel[sq]}" class="sq-dot sq-${sq}"></div>
            <div class="trend-tick ${tickCls}"${overTitle}>${tickChar}</div>
          </div>`;
      }).join("");

  appEl.innerHTML = `
    <div class="trends-header">
      <div class="app-logo" style="margin-bottom:10px">Synth</div>
      <h1>Last 7 days</h1>
    </div>
    <div class="card">${rowsHtml}</div>
    <div class="muted" style="text-align:center;font-size:11px;margin-top:8px;line-height:2">
      Coloured dot = spacing quality &nbsp;
      <span style="display:inline-flex;align-items:center;gap:3px"><span class="sq-dot sq-good" style="display:inline-block"></span>good</span> &nbsp;
      <span style="display:inline-flex;align-items:center;gap:3px"><span class="sq-dot sq-mixed" style="display:inline-block"></span>mixed</span> &nbsp;
      <span style="display:inline-flex;align-items:center;gap:3px"><span class="sq-dot sq-poor" style="display:inline-block"></span>poor</span>
      <br>
      <span style="color:var(--green)">✓</span> on target &nbsp;
      <span style="color:var(--warn)">↑</span> over target (110%+) &nbsp;
      <span style="color:var(--bad)">✗</span> under target
    </div>
    ${nav()}
  `;
  bindNav();
}

render();
