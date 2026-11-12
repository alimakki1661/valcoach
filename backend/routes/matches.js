import { Router } from 'express';
import { fetchMatches } from '../services/henrik.js';

const router = Router();

// GET /api/matches?name=choppa&tag=hhh&region=na
router.get('/', async (req, res) => {
  const { name, tag, region } = req.query;

  if (!name || !tag || !region) {
    return res.status(400).json({ error: 'name, tag, and region are required' });
  }

  try {
    const matches = await fetchMatches(region, name, tag);
    // Filter out any null entries (player not found in a match)
    res.json(matches.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

export default router;
