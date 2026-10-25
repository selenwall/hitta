import { getStore } from "@netlify/blobs";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extra,
    },
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

const GAME_ID_RE = /^[a-z0-9]{6,32}$/;
const MAX_BODY_BYTES = 4096;
const STATUS_ORDER = { inviting: 0, accepted: 1, playing: 2, won: 3, canceled: 3 };

const isStr = (max) => (v) => typeof v === "string" && v.length <= max;
const isInt = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;

// Only these fields may be stored; anything else in a request is dropped.
// There is no auth, so this is what keeps arbitrary/huge payloads out of the
// store and out of the other player's browser.
const FIELDS = {
  playerAName: isStr(60),
  playerBName: isStr(60),
  playerAScore: isInt(0, 100),
  playerBScore: isInt(0, 100),
  currentTurn: (v) => v === "A" || v === "B",
  targetLabel: isStr(64),
  targetConfidence: (v) => typeof v === "number" && v >= 0 && v <= 1,
  status: (v) => Object.hasOwn(STATUS_ORDER, v),
  winner: (v) => v === "" || v === "A" || v === "B",
  winPoints: isInt(1, 20),
  canceledBy: isStr(60),
  createdAt: (v) => Number.isFinite(v),
};

// Returns the validated subset of `body`, or null if any known field is invalid.
function sanitize(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out = {};
  for (const [key, valid] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    if (!valid(body[key])) return null;
    out[key] = body[key];
  }
  return out;
}

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return sanitize(JSON.parse(text));
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return cors();

  const url = new URL(req.url);
  const gameId = url.searchParams.get("id");

  if (!gameId || !GAME_ID_RE.test(gameId)) return json({ error: "Missing or invalid game id" }, 400);

  // Strong consistency: polling clients must never read a stale replica after
  // a turn switch, or screens flip-flop between old and new game state.
  const store = getStore({ name: "games", consistency: "strong" });

  if (req.method === "GET") {
    const data = await store.get(gameId, { type: "json" });
    return json(data || null, 200, { "Cache-Control": "no-store" });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body) return json({ error: "Invalid game data" }, 400);
    // Never let a create overwrite an existing game.
    const existing = await store.get(gameId, { type: "json" });
    if (existing) return json({ error: "Game already exists" }, 409);
    await store.setJSON(gameId, { ...body, rev: 1 });
    return json({ ok: true });
  }

  if (req.method === "PATCH") {
    const updates = await readBody(req);
    if (!updates) return json({ error: "Invalid update" }, 400);
    const existing = await store.get(gameId, { type: "json" });
    if (!existing) return json({ error: "Game not found" }, 404);
    // A finished game is final: late writes (e.g. a round result racing a
    // cancel) must not change it.
    if (existing.status === "won" || existing.status === "canceled") {
      return json({ ok: true });
    }
    // Prevent status from going backwards (e.g. a late accept PATCH must not
    // overwrite a game that has already advanced to 'playing' or beyond).
    if (updates.status !== undefined) {
      if ((STATUS_ORDER[updates.status] ?? -1) < (STATUS_ORDER[existing.status] ?? -1)) {
        delete updates.status;
      }
    }
    // Monotonic revision lets clients discard stale poll responses.
    const merged = { ...existing, ...updates, rev: (existing.rev || 0) + 1 };
    await store.setJSON(gameId, merged);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = {
  path: "/api/game",
};
