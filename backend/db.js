const fs   = require("fs");
const path = require("path");

const USE_MONGO = !!process.env.MONGODB_URI;
const DB_FILE   = process.env.DB_PATH || path.join(__dirname, "data.json");

// ── File-based (local dev) ────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(DB_FILE)) return { users: {}, entries: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function save(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// ── MongoDB (production) ──────────────────────────────────────────────────
let _mdb = null;
async function mdb() {
  if (_mdb) return _mdb;
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _mdb = client.db("synth");
  return _mdb;
}

// ── Public API (always async) ─────────────────────────────────────────────
async function getUser(username) {
  if (USE_MONGO) {
    const db = await mdb();
    return db.collection("users").findOne({ username }, { projection: { _id: 0 } });
  }
  return load().users[username] || null;
}

async function createUser(username, passwordHash) {
  if (USE_MONGO) {
    const db = await mdb();
    if (await db.collection("users").findOne({ username })) throw new Error("User already exists");
    const user = { username, passwordHash, weightKg: null, activityLevel: null, target: null };
    await db.collection("users").insertOne(user);
    await db.collection("entries").insertOne({ username, entries: [] });
    return user;
  }
  const data = load();
  if (data.users[username]) throw new Error("User already exists");
  data.users[username] = { username, passwordHash, weightKg: null, activityLevel: null, target: null };
  data.entries[username] = [];
  save(data);
  return data.users[username];
}

async function updateProfile(username, { weightKg, activityLevel, target }) {
  if (USE_MONGO) {
    const db = await mdb();
    await db.collection("users").updateOne({ username }, { $set: { weightKg, activityLevel, target } });
    return getUser(username);
  }
  const data = load();
  if (!data.users[username]) throw new Error("No such user");
  data.users[username] = { ...data.users[username], weightKg, activityLevel, target };
  save(data);
  return data.users[username];
}

async function addEntry(username, { grams, timestamp }) {
  if (USE_MONGO) {
    const db = await mdb();
    const entry = { id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`, grams, timestamp };
    await db.collection("entries").updateOne({ username }, { $push: { entries: entry } }, { upsert: true });
    return entry;
  }
  const data = load();
  if (!data.entries[username]) data.entries[username] = [];
  const entry = { id: Date.now() + Math.random().toString(36).slice(2, 7), grams, timestamp };
  data.entries[username].push(entry);
  save(data);
  return entry;
}

async function getEntries(username) {
  if (USE_MONGO) {
    const db = await mdb();
    const doc = await db.collection("entries").findOne({ username });
    return doc?.entries || [];
  }
  return load().entries[username] || [];
}

async function deleteEntry(username, id) {
  if (USE_MONGO) {
    const db = await mdb();
    await db.collection("entries").updateOne({ username }, { $pull: { entries: { id } } });
    return;
  }
  const data = load();
  if (!data.entries[username]) return;
  data.entries[username] = data.entries[username].filter(e => e.id !== id);
  save(data);
}

async function updateEntry(username, id, { grams, timestamp }) {
  if (USE_MONGO) {
    const db = await mdb();
    await db.collection("entries").updateOne(
      { username, "entries.id": id },
      { $set: { "entries.$.grams": grams, "entries.$.timestamp": timestamp } }
    );
    const doc = await db.collection("entries").findOne({ username });
    return doc?.entries?.find(e => e.id === id) || null;
  }
  const data = load();
  if (!data.entries[username]) return null;
  const idx = data.entries[username].findIndex(e => e.id === id);
  if (idx === -1) return null;
  data.entries[username][idx] = { ...data.entries[username][idx], grams, timestamp };
  save(data);
  return data.entries[username][idx];
}

module.exports = { getUser, createUser, updateProfile, addEntry, getEntries, deleteEntry, updateEntry };
