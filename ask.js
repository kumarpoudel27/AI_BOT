export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Robust body parse (Vercel usually parses JSON, but handle string just in case)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {}
  }
  body = body || {};

  const requestedModel = body.model;
  const defaultModel = 'gemini-1.5-flash';
  const tryModels = [requestedModel, defaultModel, 'gemini-1.5-flash-latest'].filter(Boolean);

  const parts = Array.isArray(body.parts) ? body.parts : [];
  if (parts.length === 0) {
    return res.status(400).json({ error: "parts[] is required. Example: [{ text: 'Hello' }]" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing GEMINI_API_KEY. Set it in Vercel → Project → Settings → Environment Variables.' });
  }

  let lastErrText = null;
  for (const model of tryModels) {
    try {
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
          })
        }
      );

      if (!gRes.ok) {
        lastErrText = await gRes.text();
        // If it's a model-not-found or bad-request, try the next model; otherwise bubble up
        if (gRes.status === 404 || gRes.status === 400) {
          continue;
        }
        return res.status(gRes.status).json({ error: lastErrText });
      }

      const data = await gRes.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') ??
        '';
      return res.status(200).json({ text, modelUsed: model });
    } catch (e) {
      lastErrText = String(e);
      // keep looping to the next model
    }
  }

  return res.status(502).json({ error: lastErrText || 'Unknown upstream error' });
}
