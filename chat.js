// Vercel Serverless Function: POST /api/chat
// Set OPENAI_API_KEY in Vercel Project Settings -> Environment Variables.
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing OPENAI_API_KEY. Add it in Vercel Project Settings → Environment Variables, then redeploy."
    });
  }

  try {
    const { prompt, modelTier } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "A non-empty prompt is required." });
    }
    if (prompt.length > 45000) {
      return res.status(413).json({ error: "Prompt is too long. Please shorten your brief or uploaded rule files." });
    }

    // Both tiers use a broadly available, cost-conscious OpenAI model.
    const model = "gpt-4.1-mini";
    const maxTokens = modelTier === "quick" ? 1200 : 6500;

    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Follow the user's instructions carefully. Do not invent facts, personal experience, citations, statistics, or sources. Return only the requested output format."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const apiMessage = payload?.error?.message || `OpenAI request failed (${upstream.status}).`;
      const status = upstream.status === 401 ? 401 :
        upstream.status === 429 ? 429 :
        upstream.status >= 500 ? 502 : 400;
      return res.status(status).json({
        error: apiMessage,
        code: payload?.error?.code || (upstream.status === 429 ? "rate_limited" : "openai_error")
      });
    }

    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return res.status(502).json({ error: "OpenAI returned an empty response." });
    }
    return res.status(200).json({ text });
  } catch (error) {
    console.error("OpenAI API route error:", error);
    return res.status(500).json({ error: "Unexpected server error while contacting OpenAI." });
  }
};
