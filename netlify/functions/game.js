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

export default async (req) => {
  if (req.method === "OPTIONS") return cors();

  const url = new URL(req.url);
  const gameId = url.searchParams.get("id");

  if (!gameId) return json({ error: "Missing game id" }, 400);

  const store = getStore("games");

  if (req.method === "GET") {
    const data = await store.get(gameId, { type: "json" });
    return json(data || null, 200, { "Cache-Control": "no-store" });
  }

  if (req.method === "POST") {
    const body = await req.json();
    await store.setJSON(gameId, body);
    return json({ ok: true });
  }

  if (req.method === "PATCH") {
    const updates = await req.json();
    const existing = await store.get(gameId, { type: "json" });
    if (!existing) return json({ error: "Game not found" }, 404);
    const merged = { ...existing, ...updates };
    await store.setJSON(gameId, merged);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = {
  path: "/api/game",
};
