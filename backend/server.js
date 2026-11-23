import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import matchesRouter from './routes/matches.js';
import coachRouter from './routes/coach.js';
import { loadMeta } from './services/metaStore.js';

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'valcoach-backend' });
});

app.use('/api/matches', matchesRouter);
app.use('/api/coach', coachRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`ValCoach backend listening on port ${PORT}`);
  // Non-blocking startup tasks — failures are warnings, not errors
  import('./services/agentRoles.js').then(({ prefetchAgentRoles }) => prefetchAgentRoles());
  await loadMeta();
});
