import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const taskId = event.queryStringParameters?.taskId;
    const KIE_API_KEY = process.env.KIE_API_KEY;

    if (!taskId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing taskId" }) };
    }

    if (!KIE_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "KIE API key is not configured" }) };
    }

    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`
      }
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
    console.error("KIE Check Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal server error" }) };
  }
};
