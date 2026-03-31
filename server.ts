import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Maketou Checkout API
  app.post("/api/checkout", async (req, res) => {
    try {
      const { productId, customerPrice, email, firstName, lastName, redirectUrl } = req.body;

      if (!productId || !email || !firstName || !lastName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const MAKETOU_API_KEY = process.env.MAKETOU_API_KEY;
      
      if (!MAKETOU_API_KEY) {
        return res.status(500).json({ error: "Maketou API key is not configured" });
      }

      const payload: any = {
        productDocumentId: productId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        redirectURL: redirectUrl || req.headers.referer || "http://localhost:3000",
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

      const data = await response.json();

      if (!response.ok) {
        console.error("Maketou API Error:", data);
        return res.status(response.status).json({ error: data.message || "Erreur lors de l'initialisation du paiement" });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Checkout Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Maketou Webhook / Callback endpoint (Placeholder)
  app.post("/api/webhooks/maketou", async (req, res) => {
    try {
      const event = req.body;
      
      console.log("Received Maketou Webhook:", event);

      // Implement Maketou webhook verification and handling here
      // You can also verify cart status via GET /api/v1/stores/cart/{cartId}

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook Error:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
