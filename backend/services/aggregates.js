/**
 * Compute per-agent, per-map, and per agent×map combination stats.
 *
 * HS% is computed as totalHeadshots / totalShots across all games for that
 * agent/map — NOT as an average of per-match percentages.
 *
 * Returns:
 *  {
 *    totalMatches: number,
 *    overallWinRate: number,          // % across all matches
 *    byAgent: { [agent]: Stats },
 *    byMap:   { [map]:   Stats },
 *    byAgentMap: { ["Agent on Map"]: { games, wins, winRate } }
 *  }
 */
export function computeAggregates(matches) {
  const agentBuckets  = {};
  const mapBuckets    = {};
  const pairBuckets   = {};

  let totalHeadshots = 0;
  let totalShots     = 0;

  for (const m of matches) {
    accumulate(agentBuckets, m.agent, m);
    accumulate(mapBuckets, m.map, m);
    // Agent×map pair key: "Clove on Sunset"
    accumulatePair(pairBuckets, `${m.agent} on ${m.map}`, m);
    // Accumulate for overall HS%
    totalHeadshots += m.headshots ?? 0;
    totalShots     += (m.headshots ?? 0) + (m.bodyshots ?? 0) + (m.legshots ?? 0);
  }

  const totalWins = matches.filter((m) => m.won).length;

  return {
    totalMatches:      matches.length,
    overallWinRate:    matches.length > 0 ? round((totalWins / matches.length) * 100) : 0,
    overallHsPercent:  totalShots > 0 ? round((totalHeadshots / totalShots) * 100) : 0,
    byAgent:    finalise(agentBuckets),
    byMap:      finalise(mapBuckets),
    byAgentMap: finalise(pairBuckets),
  };
}

function accumulate(buckets, key, m) {
  if (!buckets[key]) {
    buckets[key] = {
      games: 0, wins: 0,
      kills: 0, deaths: 0, assists: 0, kda: 0,
      headshots: 0, bodyshots: 0, legshots: 0,
    };
  }
  const b = buckets[key];
  b.games      += 1;
  b.wins       += m.won ? 1 : 0;
  b.kills      += m.kills;
  b.deaths     += m.deaths;
  b.assists    += m.assists;
  b.kda        += m.kda;
  // Accumulate raw shot counts for a true HS%
  b.headshots  += m.headshots ?? 0;
  b.bodyshots  += m.bodyshots ?? 0;
  b.legshots   += m.legshots  ?? 0;
}

function finalise(buckets) {
  const result = {};
  for (const [key, b] of Object.entries(buckets)) {
    const g = b.games;
    const totalShots = b.headshots + b.bodyshots + b.legshots;
    result[key] = {
      games:        g,
      wins:         b.wins,
      winRate:      round((b.wins / g) * 100),
      avgKills:     round(b.kills   / g),
      avgDeaths:    round(b.deaths  / g),
      avgAssists:   round(b.assists / g),
      avgKda:       round(b.kda     / g),
      // True HS%: total headshots across all games / total shots across all games
      hsPercent:    totalShots > 0 ? round((b.headshots / totalShots) * 100) : 0,
    };
  }
  return result;
}

function accumulatePair(buckets, key, m) {
  if (!buckets[key]) {
    buckets[key] = {
      games: 0, wins: 0,
      kills: 0, deaths: 0, assists: 0, kda: 0,
      headshots: 0, bodyshots: 0, legshots: 0,
    };
  }
  const b = buckets[key];
  b.games     += 1;
  b.wins      += m.won ? 1 : 0;
  b.kills     += m.kills;
  b.deaths    += m.deaths;
  b.assists   += m.assists;
  b.kda       += m.kda;
  b.headshots += m.headshots ?? 0;
  b.bodyshots += m.bodyshots ?? 0;
  b.legshots  += m.legshots  ?? 0;
}

function round(n) {
  return Math.round(n * 10) / 10;
}
