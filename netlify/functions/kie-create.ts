import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const KIE_API_KEY = process.env.KIE_API_KEY;

    if (!KIE_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "KIE API key is not configured" }) };
    }

    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("KIE API returned non-JSON response:", responseText.substring(0, 200));
      return { statusCode: response.status || 500, body: JSON.stringify({ error: `Erreur de l'API KIE (Code ${response.status}).` }) };
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      body: JSON.stringify(data)
    };
  } catch (error: any) {
    console.error("KIE Create Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal server error" }) };
  }
};
