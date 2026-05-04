import express from 'express';
import cors from 'cors';
import { riskRouter } from './routes/risk.js';
import { reportsRouter } from './routes/reports.js';
import { femaRouter } from './routes/fema.js';
import { waterRouter } from './routes/water.js';
import { safeWaterRouter } from './routes/safeWater.js';

const app = express();
const api = express.Router();

app.use(cors());
app.use(express.json());
api.use('/fema', femaRouter);
api.use('/risk', riskRouter);
api.use('/reports', reportsRouter);
api.use('/water', waterRouter);
api.use('/safe-water', safeWaterRouter);

api.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'AquaSafe API' });
});

api.get('/ai-status', (_req, res) => {
  const key = process.env.OPENAI_API_KEY?.trim();
  res.json({
    configured: !!key,
    message: key
      ? `Key is set (${key.slice(0, 7)}...${key.slice(-4)})`
      : 'Set OPENAI_API_KEY in server/.env (no quotes, no space after =) and restart.',
  });
});

// Local dev uses /api/* via Vite proxy; Vercel serverless may forward with or without /api prefix.
app.use('/api', api);
app.use('/', api);

export default app;
