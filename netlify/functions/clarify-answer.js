exports.handler = async function(event, context) {
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  // Immediately flag missing API key — shows in Netlify function logs
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is not set');
    return { statusCode: 200, headers, body: JSON.stringify({ clear: true, interpretation: '', _debug: 'missing_api_key' }) };
  }

  try {
    const { answer, fieldId, existingAnswers } = JSON.parse(event.body);

    if (!answer || !fieldId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing answer or fieldId' }) };
    }

    console.log(`clarify-answer called: fieldId=${fieldId}, answerLength=${answer.length}`);

    const fieldContext = {
      'gamer-describe':    'Asked: "How would you describe yourself as a gamer? What kind of player are you? What do you bring to the table?"',
      'great-experience':  'Asked: "What would make this a great experience for you? What are you hoping to get out of today?"',
      'anything-warm':     'Asked: "Anything else that would help us match you today?"',
      'dealbreaker':       'Asked: "Gaming dealbreaker? What would make you leave a table?"',
      'anything-warmer':   'Asked: "Anything else we should know?"',
      'ideal':             'Asked: "Describe your ideal gaming friend. What qualities matter most?"',
      'anything-warmest':  'Asked: "Anything else on your mind?"',
      'story-best':        'Asked: "Tell me about the best gaming session you\'ve ever had. What made it special?"',
      'story-worst':       'Asked: "What\'s the worst experience you\'ve had with other players? What made it bad?"',
      'story-ideal':       'Asked: "Describe your ideal gaming group. What\'s the vibe? What matters most?"'
    };

    const context = fieldContext[fieldId] || 'Open-ended question about gaming preferences.';

    const contextParts = [];
    const contextFields = {
      'noise': 'Table talk preference',
      'complexity': 'Game complexity preference',
      'style': 'Play style',
      'winning': 'Attitude toward winning',
      'friendship': 'Gaming friendship goals'
    };
    for (const [key, label] of Object.entries(contextFields)) {
      if (existingAnswers?.[key]) {
        contextParts.push(`${label}: ${existingAnswers[key]}`);
      }
    }
    const otherContext = contextParts.length > 0
      ? `\n\nOther answers they've given:\n${contextParts.join('\n')}`
      : '';

    const prompt = `You are a warm, curious assistant for A Friendly Game — a board game friendship-matching platform. Your job is to decide if a person's open-ended answer is clear enough to use for matching, or if one gentle follow-up question would help.

${context}${otherContext}

Their answer: "${answer}"

MATCHING CATEGORIES (what you're trying to map them to):
- Play style: competitive, cooperative, social/casual, story-driven/immersive
- Social energy: wants deep gaming friendships, prefers casual acquaintances, just here to play games
- Table culture: quiet/focused, chatty/social, rowdy/party
- Dealbreakers: specific behaviors or situations that would make them leave a table
- Ideal friend qualities: what they value most in a gaming partner

DECISION RULES:
- If the answer clearly maps to one or more categories above, return clear=true with a brief interpretation.
- If their OTHER answers already resolve the ambiguity, return clear=true.
- If the answer is too vague, contradictory, or could mean very different things for matching, return clear=false with a follow-up.
- Short answers (under 5 words) are almost always ambiguous — return clear=false.
- "Optional" answers with nothing written should be skipped — return clear=true with empty interpretation.

If clear=false, write a follow-up using this EXACT formula:
"When you said [their exact words], did you mean [interpretation A] or [interpretation B]?"
- Use their EXACT words — never paraphrase what they said
- Keep interpretations short (5-8 words each), warm, not clinical
- Interpretations must be genuinely different from each other and meaningful for matching

Respond with JSON only, no other text:
{"clear": true, "interpretation": "brief mapping to matching categories"} 
OR
{"clear": false, "followUp": "When you said...", "optionA": "first interpretation", "optionB": "second interpretation"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return { statusCode: 200, headers, body: JSON.stringify({ clear: true, interpretation: '' }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    console.log(`clarify-answer response: ${text.substring(0, 200)}`);

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (parsed.clear === false && (!parsed.followUp || !parsed.optionA || !parsed.optionB)) {
      return { statusCode: 200, headers, body: JSON.stringify({ clear: true, interpretation: '' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error('Clarify function error:', err.message, err.stack);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clear: true, interpretation: '' })
    };
  }
};
