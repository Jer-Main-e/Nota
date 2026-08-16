function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Constant-time-ish string compare so response timing doesn't leak how many
// characters matched. Not bulletproof, but cheap and worth doing.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const enteredPin = (body && body.pin ? String(body.pin) : "").trim();

  if (!safeEqual(enteredPin, env.SITE_PIN)) {
    // Small delay to make brute-forcing a little less pleasant.
    await new Promise((r) => setTimeout(r, 300));
    return json({ ok: false }, 401);
  }

  let data;
  try {
    data = JSON.parse(env.BIZ_CONFIG_JSON);
  } catch (e) {
    return json({ ok: false, error: "server config error" }, 500);
  }

  return json({ ok: true, data }, 200);
}

// Any other method on this route -> 405.
export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "method not allowed" }, 405);
}
