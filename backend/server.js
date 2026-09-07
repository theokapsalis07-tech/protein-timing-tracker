const express = require("express");
const path    = require("path");
const crypto  = require("crypto");
const db      = require("./db");
const logic   = require("./logic");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));

const sessions = {}; // token -> username

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function requireAuth(req, res, next) {
  const token    = req.headers.authorization?.replace("Bearer ", "");
  const username = sessions[token];
  if (!username) return res.status(401).json({ error: "Not authenticated" });
  req.username = username;
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing username or password" });
  try {
    await db.createUser(username, hashPassword(password));
    const token = crypto.randomBytes(16).toString("hex");
    sessions[token] = username;
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getUser(username);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = crypto.randomBytes(16).toString("hex");
  sessions[token] = username;
  res.json({ token });
});

// ── Profile ───────────────────────────────────────────────────────────────
app.get("/api/profile", requireAuth, async (req, res) => {
  res.json(await db.getUser(req.username));
});

app.post("/api/profile", requireAuth, async (req, res) => {
  const { weightKg, activityLevel } = req.body;
  const target = logic.calculateProteinTarget({ weightKg, activityLevel });
  const user   = await db.updateProfile(req.username, { weightKg, activityLevel, target });
  res.json(user);
});

// ── Logging ───────────────────────────────────────────────────────────────
app.post("/api/log", requireAuth, async (req, res) => {
  const { grams, timestamp } = req.body;
  if (!grams || grams <= 0) return res.status(400).json({ error: "Invalid grams" });
  const entry = await db.addEntry(req.username, { grams, timestamp: timestamp || Date.now() });
  res.json(entry);
});

app.delete("/api/log/:id", requireAuth, async (req, res) => {
  await db.deleteEntry(req.username, req.params.id);
  res.json({ ok: true });
});

app.put("/api/log/:id", requireAuth, async (req, res) => {
  const { grams, timestamp } = req.body;
  if (!grams || grams <= 0) return res.status(400).json({ error: "Invalid grams" });
  const entry = await db.updateEntry(req.username, req.params.id, { grams, timestamp });
  if (!entry) return res.status(404).json({ error: "Entry not found" });
  res.json(entry);
});

// ── Today ─────────────────────────────────────────────────────────────────
app.get("/api/today", requireAuth, async (req, res) => {
  const [user, allEntries] = await Promise.all([
    db.getUser(req.username),
    db.getEntries(req.username)
  ]);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayEntries = allEntries.filter(e => e.timestamp >= startOfDay.getTime());
  const analysis = logic.analyzeSpacing(todayEntries);
  const status   = logic.buildStatusMessage({
    totalGrams:     analysis.totalGrams,
    target:         user.target || 0,
    spacingQuality: analysis.spacingQuality,
    openGapFlag:    analysis.openGapFlag
  });
  res.json({ target: user.target, ...analysis, status });
});

// ── Trends ────────────────────────────────────────────────────────────────
app.get("/api/trends", requireAuth, async (req, res) => {
  const [allEntries, user] = await Promise.all([
    db.getEntries(req.username),
    db.getUser(req.username)
  ]);
  const now         = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const days = {};
  allEntries.filter(e => e.timestamp >= sevenDaysAgo).forEach(e => {
    const day = new Date(e.timestamp).toISOString().slice(0, 10);
    if (!days[day]) days[day] = [];
    days[day].push(e);
  });
  const summary = Object.entries(days).map(([day, entries]) => {
    const analysis = logic.analyzeSpacing(entries);
    return {
      day,
      totalGrams:     analysis.totalGrams,
      spacingQuality: analysis.spacingQuality,
      hitTarget:      analysis.totalGrams >= (user.target || 0) * 0.9
    };
  });
  res.json(summary);
});

// ── Streak ────────────────────────────────────────────────────────────────
app.get("/api/streak", requireAuth, async (req, res) => {
  const [allEntries, user] = await Promise.all([
    db.getEntries(req.username),
    db.getUser(req.username)
  ]);
  const target = user.target || 0;
  const pad    = n => String(n).padStart(2, "0");
  const localDateStr = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  const dayTotals = {};
  allEntries.forEach(e => {
    const day = localDateStr(e.timestamp);
    dayTotals[day] = (dayTotals[day] || 0) + e.grams;
  });
  const hitDay    = ds => (dayTotals[ds] || 0) >= target * 0.9;
  const todayStr  = localDateStr(Date.now());
  const startOffset = hitDay(todayStr) ? 0 : 1;
  let streak = 0;
  for (let i = startOffset; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (hitDay(localDateStr(d.getTime()))) streak++;
    else break;
  }
  res.json({ streak });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Synth running at http://localhost:${PORT}`));
