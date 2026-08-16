function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a, b) {
  console.log("DEBUG entered:", JSON.stringify(a), "len:", a.length);
  console.log("DEBUG secret:", JSON.stringify(b), "len:", b ? b.length : "undefined");
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function handleUnlock(request, env) {
  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, error: "bad request" }, 400); }

  const enteredPin = (body && body.pin ? String(body.pin) : "").trim();

  if (!safeEqual(enteredPin, env.SITE_PIN)) {
    await new Promise((r) => setTimeout(r, 300)); // slow down guessing
    return json({ ok: false }, 401);
  }

  let data;
  try { data = JSON.parse(env.BIZ_CONFIG_JSON); }
  catch (e) { return json({ ok: false, error: "server config error" }, 500); }

  return json({ ok: true, data }, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/unlock") {
      if (request.method !== "POST") return json({ ok: false }, 405);
      return handleUnlock(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
