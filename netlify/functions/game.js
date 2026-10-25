import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

// Clients send their version in X-Hitta-Client (absent = 1, the client from
// before player tokens). Bump MIN_CLIENT_VERSION together with
// CLIENT_VERSION in src/constants.js when the API changes in a way older
// clients can't handle: every response advertises it, and older clients
// reload themselves to pick up the new code.
const MIN_CLIENT_VERSION = 2;

// The API is only called same-origin, so no CORS headers: other sites must
// not be able to read or write games from a visitor's browser.
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Hitta-Min-Client": String(MIN_CLIENT_VERSION),
      ...extra,
    },
  });
}

const GAME_ID_RE = /^[a-z0-9]{6,32}$/;
const MAX_BODY_BYTES = 4096;
const STATUS_ORDER = { inviting: 0, accepted: 1, playing: 2, won: 3, canceled: 3 };
const MAX_WRITE_ATTEMPTS = 5;

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

// Player tokens are secrets; never send them to clients in game state.
function publicView(game) {
  if (!game) return null;
  const { tokenA, tokenB, legacyClient, ...rest } = game;
  return rest;
}

export default async (req) => {
  const url = new URL(req.url);
  const gameId = url.searchParams.get("id");

  if (!gameId || !GAME_ID_RE.test(gameId)) return json({ error: "Missing or invalid game id" }, 400);

  // Strong consistency: polling clients must never read a stale replica after
  // a turn switch, or screens flip-flop between old and new game state.
  const store = getStore({ name: "games", consistency: "strong" });
  // Version-1 clients (tabs opened before tokens, still running old code)
  // never store or send tokens.
  const tokenAware = (parseInt(req.headers.get("x-hitta-client"), 10) || 1) >= 2;

  if (req.method === "GET") {
    const data = await store.get(gameId, { type: "json" });
    return json(publicView(data), 200, { "Cache-Control": "no-store" });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body) return json({ error: "Invalid game data" }, 400);
    // The creator is player A; the token proves it on later writes. A
    // version-1 client would discard the token and then be locked out of its
    // own game, so its games are created without one (legacy, as before).
    const token = tokenAware ? randomUUID() : undefined;
    // onlyIfNew: a create must never overwrite an existing game.
    const { modified } = await store.setJSON(gameId, { ...body, tokenA: token, rev: 1 }, { onlyIfNew: true });
    if (!modified) return json({ error: "Game already exists" }, 409);
    return json(token ? { ok: true, token } : { ok: true });
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    if (!body) return json({ error: "Invalid update" }, 400);
    const token = req.headers.get("x-player-token") || "";

    // Read-modify-write with an ETag check, retried on conflict, so two
    // players writing at the same moment can't silently drop each other's
    // update (e.g. a cancel racing a round result).
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const entry = await store.getWithMetadata(gameId, { type: "json" });
      if (!entry) return json({ error: "Game not found" }, 404);
      const existing = entry.data;
      const updates = { ...body };
      let issuedToken;

      // Legacy games accept writes without a token, as before tokens existed:
      // those created by a version-1 client or before tokens (no tokenA), and
      // those a version-1 client joined (it can't present B's token).
      const legacy = !existing.tokenA || existing.legacyClient === true;
      const isPlayer = legacy || (token && (token === existing.tokenA || token === existing.tokenB));
      const isJoin = existing.status === "inviting" && !existing.tokenB && body.status === "accepted";

      if (!isPlayer || (legacy && isJoin && !token)) {
        // Without a valid token the only allowed write is player B claiming
        // an open invite, which issues B's token. Anyone else holding the
        // link can watch but not change the game.
        if (!isJoin) return json({ error: "Not a player in this game" }, 403);
        issuedToken = randomUUID();
        for (const key of Object.keys(updates)) {
          if (key !== "playerBName" && key !== "status") delete updates[key];
        }
        updates.tokenB = issuedToken;
        if (!tokenAware) updates.legacyClient = true;
      }

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
      const { modified } = await store.setJSON(gameId, merged, { onlyIfMatch: entry.etag });
      if (modified) return json(issuedToken ? { ok: true, token: issuedToken } : { ok: true });
    }
    return json({ error: "Game is busy, try again" }, 409);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = {
  path: "/api/game",
};
