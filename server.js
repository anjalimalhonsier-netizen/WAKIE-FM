const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("node:crypto");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DJ_PASSWORD"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
if (process.env.DJ_PASSWORD.length < 16) {
  console.error("DJ_PASSWORD must be at least 16 characters.");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const requestLimiter = rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });

function cleanText(value, max) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalize(title, artist) {
  return `${title}::${artist}`.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}:]+/gu, "");
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function requireDJ(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(token, process.env.DJ_PASSWORD)) return res.status(401).json({ error: "Incorrect DJ password." });
  next();
}
function voterHash(req) {
  const device = cleanText(req.body.deviceId, 100);
  if (!device) return null;
  return crypto.createHash("sha256").update(device).digest("hex");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Wakie FM" }));

app.get("/api/queue", publicLimiter, async (_req, res) => {
  const { data, error } = await supabase
    .from("song_requests")
    .select("id,title,artist,requested_by,status,votes,created_at,started_at")
    .in("status", ["queued", "playing"])
    .order("votes", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Queue load failed:", error);
    return res.status(500).json({ error: "Could not load the queue." });
  }
  res.json({ songs: data || [] });
});

app.post("/api/requests", requestLimiter, async (req, res) => {
  const title = cleanText(req.body.title, 120);
  const artist = cleanText(req.body.artist, 120);
  const requested_by = cleanText(req.body.requestedBy, 40) || "Anonymous";
  if (title.length < 1 || artist.length < 1) return res.status(400).json({ error: "Enter both a song title and artist." });

  const normalized_key = normalize(title, artist);
  const { data: existing } = await supabase.from("song_requests")
    .select("id").eq("normalized_key", normalized_key).in("status", ["queued", "playing"]).maybeSingle();
  if (existing) return res.status(409).json({ error: "That song is already in the active queue." });

  const { data, error } = await supabase.from("song_requests")
    .insert({ title, artist, requested_by, normalized_key })
    .select("id,title,artist,requested_by,status,votes,created_at")
    .single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That song is already in the active queue." });
    return res.status(500).json({ error: "Could not add your request." });
  }
  res.status(201).json({ song: data, message: "Added to the queue!" });
});

app.post("/api/vote/:id", publicLimiter, async (req, res) => {
  const hash = voterHash(req);
  if (!hash) return res.status(400).json({ error: "Refresh the page and try again." });
  const { data, error } = await supabase.rpc("cast_song_vote", { p_song_id: req.params.id, p_voter_hash: hash });
  if (error) return res.status(500).json({ error: "Could not record your vote." });
  if (!data) return res.status(409).json({ error: "You have already voted, or this song is no longer queued." });
  res.json({ message: "Vote counted!" });
});

app.post("/api/dj/next", requireDJ, async (_req, res) => {
  const { data, error } = await supabase.rpc("dj_play_next");
  if (error) return res.status(500).json({ error: "Could not start the next song." });
  res.json({ song: data?.[0] || null, message: data?.length ? "Now Playing updated." : "The queue is empty." });
});
app.post("/api/dj/finish", requireDJ, async (_req, res) => {
  const { error } = await supabase.rpc("dj_finish_current");
  if (error) return res.status(500).json({ error: "Could not finish the current song." });
  res.json({ message: "Current song marked finished." });
});
app.post("/api/dj/skip", requireDJ, async (_req, res) => {
  const { error } = await supabase.rpc("dj_skip_current");
  if (error) return res.status(500).json({ error: "Could not skip the current song." });
  res.json({ message: "Current song skipped." });
});
app.post("/api/dj/remove/:id", requireDJ, async (req, res) => {
  const { error } = await supabase.from("song_requests").update({ status: "skipped", finished_at: new Date().toISOString() })
    .eq("id", req.params.id).eq("status", "queued");
  if (error) return res.status(500).json({ error: "Could not remove that request." });
  res.json({ message: "Request removed." });
});

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Wakie FM listening on port ${port}`));
