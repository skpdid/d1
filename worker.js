const ALLOWED_UPDATE_FIELDS = new Set([
  "msisdn",
  "subscriber_id",
  "subscription_type",
  "refresh_token",
  "fingerprint",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getApiKey(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key") || "";
}

function isAuthorized(request, env) {
  const expected = env.API_KEY;
  return Boolean(expected && getApiKey(request) === expected);
}

function safeToken(row) {
  if (!row) return row;
  return { ...row, refresh_token: "[REDACTED]" };
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getByUuid(env, uuid) {
  return env.DB.prepare("SELECT * FROM refresh_tokens WHERE uuid = ?")
    .bind(uuid)
    .first();
}

async function listTokens(request, env) {
  const includeSecrets = request.url.includes("include_secrets=1");
  const result = await env.DB.prepare(
    "SELECT uuid, msisdn, subscriber_id, subscription_type, refresh_token, fingerprint FROM refresh_tokens ORDER BY rowid DESC",
  ).all();
  return includeSecrets ? json(result.results) : json(result.results.map(safeToken));
}

async function addToken(request, env) {
  const data = await body(request);
  if (!data || !data.uuid || !data.refresh_token) {
    return json({ status: false, message: "uuid dan refresh_token wajib diisi" }, 400);
  }
  const uuid = String(data.uuid).trim();
  const msisdn = String(data.msisdn ?? "").trim();
  const existing = await getByUuid(env, uuid);

  if (existing) {
    await env.DB.prepare(
      "UPDATE refresh_tokens SET refresh_token = ?, msisdn = ?, fingerprint = COALESCE(?, fingerprint) WHERE uuid = ?",
    ).bind(String(data.refresh_token), msisdn, data.fingerprint ?? null, uuid).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO refresh_tokens
       (uuid, msisdn, subscriber_id, subscription_type, refresh_token, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid,
      msisdn,
      String(data.subscriber_id ?? ""),
      String(data.subscription_type ?? ""),
      String(data.refresh_token),
      String(data.fingerprint ?? ""),
    ).run();
  }

  return json({ status: true, data: safeToken(await getByUuid(env, uuid)) }, existing ? 200 : 201);
}

async function updateToken(request, env, uuid) {
  const current = await getByUuid(env, uuid);
  if (!current) return json({ status: false, message: `UUID ${uuid} tidak ditemukan` }, 404);
  const data = await body(request);
  const fields = Object.entries(data || {}).filter(([key, value]) =>
    ALLOWED_UPDATE_FIELDS.has(key) && value !== undefined,
  );
  if (!fields.length) return json({ status: false, message: "Tidak ada field valid yang diberikan" }, 400);

  const setClause = fields.map(([key]) => `${key} = ?`).join(", ");
  const values = fields.map(([, value]) => keyValue(value));
  await env.DB.prepare(`UPDATE refresh_tokens SET ${setClause} WHERE uuid = ?`)
    .bind(...values, uuid)
    .run();
  return json({ status: true, data: safeToken(await getByUuid(env, uuid)) });
}

function keyValue(value) {
  return value === null ? null : String(value);
}

async function deleteToken(env, uuid) {
  const result = await env.DB.prepare("DELETE FROM refresh_tokens WHERE uuid = ?").bind(uuid).run();
  if (!result.meta.changes) return json({ status: false, message: `UUID ${uuid} tidak ditemukan` }, 404);
  return json({ status: true, message: "Token berhasil dihapus" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,x-api-key", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
    if (!isAuthorized(request, env)) return json({ status: false, message: "Unauthorized" }, 401);

    try {
      if (url.pathname === "/health" && request.method === "GET") return json({ status: true, service: "d1-api" });
      if (url.pathname === "/tokens" && request.method === "GET") return listTokens(request, env);
      if (url.pathname === "/tokens" && request.method === "POST") return addToken(request, env);

      const match = url.pathname.match(/^\/tokens\/([^/]+)$/);
      if (match && request.method === "PATCH") return updateToken(request, env, decodeURIComponent(match[1]));
      if (match && request.method === "GET") {
        const row = await getByUuid(env, decodeURIComponent(match[1]));
        return row ? json(safeToken(row)) : json({ status: false, message: "Token tidak ditemukan" }, 404);
      }
      if (match && request.method === "DELETE") return deleteToken(env, decodeURIComponent(match[1]));
      if (url.pathname === "/tokens" && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM refresh_tokens").run();
        return json({ status: true, message: "Semua data berhasil dihapus" });
      }
      return json({ status: false, message: "Endpoint tidak ditemukan" }, 404);
    } catch (error) {
      console.error(error);
      return json({ status: false, message: "Internal server error" }, 500);
    }
  },
};
