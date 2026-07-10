import process from 'node:process';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import config from './config.js';
import errorHandler from './middleware/errorHandler.js';
import uploadRoutes from './routes/upload.js';
import chatRoutes from './routes/chat.js';
import statsRoutes from './routes/stats.js';
import sessionRoutes from './routes/session.js';
import personaRoutes from './routes/persona.js';
import sessionsRoutes from './routes/sessions.js';
import configRoutes from './routes/config.js';
import authRoutes from './routes/auth.js';
import { startCleanup } from './store/sessionStore.js';
import { cleanupOrphanedCollections } from './brain/chromaClient.js';
import { connectDB } from './db.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.body?.session_id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again shortly.' },
});

// Auth routes (no rate limit)
app.use('/api/auth', authRoutes);

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/persona', personaRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/config', configRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

startCleanup();

const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/src/index.js') ||
  process.argv[1].endsWith('src\\index.js') ||
  process.argv[1].includes('/backend/src/index.js')
);

if (isMainModule) {
  const server = app.listen(config.port, async () => {
    console.log(`[Signet] Server running on port ${config.port}`);
    await connectDB().catch((err) => console.warn('[MongoDB] Connection warning:', err.message));
    await cleanupOrphanedCollections();
  });

  function shutdown() {
    console.log('\n[Signet] Shutting down...');
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
