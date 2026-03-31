import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { productId, customerPrice, email, firstName, lastName, redirectUrl } = body;

    const MAKETOU_API_KEY = process.env.MAKETOU_API_KEY;
    
    if (!MAKETOU_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Maketou API key is not configured" }) };
    }

    const payload: any = {
      productDocumentId: productId,
      email: email,
      firstName: firstName,
      lastName: lastName,
      redirectURL: redirectUrl || "http://localhost:3000",
      meta: {
        source: "face_ia_app"
      }
    };

    if (customerPrice) {
      payload.customerPrice = customerPrice;
    }

    const response = await fetch('https://api.maketou.net/api/v1/stores/cart/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAKETOU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Maketou API returned non-JSON response:", responseText.substring(0, 200));
      return { statusCode: response.status || 500, body: JSON.stringify({ error: `Erreur de l'API de paiement (Code ${response.status}). Veuillez réessayer plus tard.` }) };
    }

    if (!response.ok) {
      console.error("Maketou API Error:", data);
      return { statusCode: response.status, body: JSON.stringify({ error: data.message || "Erreur lors de l'initialisation du paiement" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error: any) {
    console.error("Checkout Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal server error" }) };
  }
};
