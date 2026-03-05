exports.handler = async function(event, context) {
  // CORS headers so the app can call this function
  const headers = {
    'Access-Control-Allow-Origin': 'https://app.afriendlygame.com',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight — must come before method check
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { profileA, profileB } = JSON.parse(event.body);

    if (!profileA || !profileB) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing profiles' }) };
    }

    const prompt = `You are a compatibility analyst for a board game friendship-matching platform.

Two people answered open-ended questions about themselves as gamers. Analyze how compatible they are as gaming friends based only on what they wrote.

PERSON A:
${profileA}

PERSON B:
${profileB}

Score their compatibility from 0 to 6 where:
0 = Clear incompatibility (dealbreakers conflict, very different styles)
2 = Low compatibility (different styles, little in common)
4 = Good compatibility (similar vibe, complementary where it matters)
6 = Excellent compatibility (strong alignment in values, style, and what they're looking for)

Also write a single short phrase (3-5 words) that captures WHY they're compatible or not.
Examples: "both love deep strategy", "very different play styles", "shared social gaming values", "dealbreakers may conflict"

Respond with JSON only, no other text:
{"score": <number 0-6>, "insight": "<short phrase>"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'API error', score: 0, insight: '' }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        score: Math.max(0, Math.min(6, Number(parsed.score) || 0)),
        insight: parsed.insight || ''
      })
    };

  } catch (err) {
    console.error('Function error:', err);
    // Fail gracefully - return neutral score so matching still works
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ score: 0, insight: '' })
    };
  }
};
