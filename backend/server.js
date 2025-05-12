// server.js
import express from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";
import cors from "cors";
import dotenv from "dotenv";
import searchRouter from "./routes/search.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_KEY = process.env.VITE_BIRDEYE_API_KEY;

if (!BIRDEYE_KEY) {
  console.error("⚠️  Missing VITE_BIRDEYE_API_KEY in .env");
  process.exit(1);
}

// Enhanced error logging middleware
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    console.log(
      `Response for ${req.method} ${req.path}:`,
      typeof data === "string" && data.length > 500
        ? data.substring(0, 500) + "..."
        : data
    );
    return originalSend.call(this, data);
  };
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Request body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

// rate‑limit to 15 requests per second
const birdeyeLimiter = rateLimit({
  windowMs: 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests to Birdeye" },
});

// shared axios client for Birdeye
const birdeye = axios.create({
  baseURL: BIRDEYE_BASE,
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": BIRDEYE_KEY,
  },
});

app.use(cors());
app.use(express.json());

// mount the Birdeye proxy under /api
app.use("/api", birdeyeLimiter);

// **mount search under `/api/search`**
app.use("/api/search", searchRouter);

/**
 * Forwards the incoming request to Birdeye under the same query params + x‑chain header
 */
async function forwardToBirdeye(req, res, birdeyePath) {
  const chain = req.header("x-chain") || "sui";
  try {
    const response = await birdeye.get(birdeyePath, {
      headers: { "x-chain": chain },
      params: req.query,
    });
    return res.json(response.data);
  } catch (err) {
    if (err.response?.data) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

// proxy endpoints
app.get("/api/token_trending", (req, res) =>
  forwardToBirdeye(req, res, "/defi/token_trending")
);
app.get("/api/price_volume/single", (req, res) =>
  forwardToBirdeye(req, res, "/defi/price_volume/single")
);
app.get("/api/tokenlist", (req, res) =>
  forwardToBirdeye(req, res, "/defi/tokenlist")
);
app.get("/api/ohlcv", (req, res) => forwardToBirdeye(req, res, "/defi/ohlcv"));
app.get("/api/history_price", (req, res) =>
  forwardToBirdeye(req, res, "/defi/history_price")
);

// 404 for anything else under /api
app.use("/api/*", (_req, res) =>
  res.status(404).json({ success: false, message: "Not found" })
);

// Global error handler - place at the end of your server.js
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : `${err.message || "Unknown error"}`,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy listening on http://localhost:${PORT}`);
});

export default app;
