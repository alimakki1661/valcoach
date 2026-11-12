import { Router } from 'express';
import { getCoachingReport, GeminiBusyError } from '../services/llm.js';
import { computeAggregates } from '../services/aggregates.js';
import { fetchPlayerRank } from '../services/mmr.js';
import { getMeta } from '../services/metaStore.js';
import { computeMetaComparison } from '../services/metaComparison.js';

const router = Router();

// POST /api/coach
// Body: { matches: Array, name: string, tag: string, region: string }
router.post('/', async (req, res) => {
  const { matches, name, tag, region } = req.body;

  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({ error: 'matches array is required in the request body' });
  }

  const aggregates = computeAggregates(matches);

  // Meta comparison is computed server-side before the LLM call
  const metaComparison = computeMetaComparison(aggregates, getMeta());

  // Fetch rank in parallel — failure is non-fatal
  const rank = (name && tag && region)
    ? await fetchPlayerRank(region, name, tag)
    : null;

  try {
    const report = await getCoachingReport(matches, aggregates, rank, metaComparison);
    // Include the precomputed comparison in the response so the UI can render it
    // independently of what the LLM chose to say
    res.json({ ...report, metaComparison });
  } catch (err) {
    console.error(err);
    if (err instanceof GeminiBusyError) {
      return res.status(503).json({ error: err.message, busy: true });
    }
    res.status(502).json({ error: err.message });
  }
});

export default router;
