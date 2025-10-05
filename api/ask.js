// api/ask.js  (Node runtime)
export default async function handler(req, res) {
  // Allow preflight if you’re testing from other origins
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // --- Parse body robustly (covers string/empty cases) ---
  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) body = JSON.parse(raw);
    } catch { /* fall through */ }
  }
  body = body || {};

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If you see THIS on the client, the env var isn’t reaching the function (naming/scope/redeploy).
    return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
  }

  const model = body.model || 'gemini-1.5-flash';
  const parts = Array.isArray(body.parts) ? body.parts : [];
  if (parts.length === 0) {
    return res.status(400).json({ error: "parts[] is required. Example: [{ text: 'Hello' }]" });
  }

  try {
    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
        })
      }
    );

    const raw = await gRes.text();
    if (!gRes.ok) {
      // This **exact** text is what you should see in Vercel logs if Google rejects the call.
      console.error('Gemini upstream error:', gRes.status, raw);
      // Bubble a concise message to the client:
      return res.status(gRes.status).json({ error: `Upstream ${gRes.status}: ${raw.slice(0, 500)}` });
    }

    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      (Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts.map(p => p.text).filter(Boolean).join('\n')
        : '');

    return res.status(200).json({ text, modelUsed: model });
  } catch (e) {
    console.error('ask.js exception:', e);
    return res.status(502).json({ error: String(e) });
  }
}
