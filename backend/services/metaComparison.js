/**
 * metaComparison.js
 *
 * Computes three server-side comparison lists between the player's own
 * aggregates and the Top-500 NA cohort snapshot (meta.json).
 *
 * All arithmetic happens here — nothing is delegated to the LLM.
 *
 * Returns null if the meta snapshot is unavailable.
 */

/**
 * @param {Object} playerAggregates  Output of computeAggregates()
 * @param {Object|null} meta         Output of getMeta(), or null
 * @returns {Object|null}
 *   {
 *     generatedAt: string,
 *     sample: { players, totalMatches },
 *     overlap: Array<OverlapRow>,
 *     gaps:    Array<GapRow>,
 *     offMeta: Array<OffMetaRow>,
 *   }
 *
 * OverlapRow: { agent, cohortPickRate, cohortAppearances, cohortWinRate,
 *               playerGames, playerWinRate }
 * GapRow:     { agent, cohortPickRate, cohortAppearances, cohortWinRate }
 * OffMetaRow: { agent, playerGames, playerWinRate, cohortPickRate }
 */
export function computeMetaComparison(playerAggregates, meta) {
  if (!meta) return null;

  const cohort = meta.agentStats ?? {};
  const byAgent = playerAggregates.byAgent ?? {};
  const overallWR = playerAggregates.overallWinRate ?? 0;

  // Top 8 cohort agents by pick count
  const top8 = Object.entries(cohort)
    .sort((a, b) => b[1].picks - a[1].picks)
    .slice(0, 8)
    .map(([agent, stats]) => ({ agent, ...stats }));

  // ── Overlap: top-8 cohort agents the player has 2+ games on ──────────────
  const overlap = top8
    .filter(({ agent }) => (byAgent[agent]?.games ?? 0) >= 2)
    .map(({ agent, picks, pickRate, winRate }) => {
      const p = byAgent[agent];
      return {
        agent,
        cohortPickRate:    pickRate,
        cohortAppearances: picks,
        cohortWinRate:     winRate,       // may be null if below threshold
        playerGames:       p.games,
        playerWinRate:     p.winRate,
      };
    });

  // ── Gaps: top-8 cohort agents the player has 0 or 1 games on ─────────────
  const gaps = top8
    .filter(({ agent }) => (byAgent[agent]?.games ?? 0) <= 1)
    .map(({ agent, picks, pickRate, winRate }) => ({
      agent,
      cohortPickRate:    pickRate,
      cohortAppearances: picks,
      cohortWinRate:     winRate,
    }));

  // ── Off-meta strengths: 3+ games, WR > player baseline, cohort < 5% ──────
  const offMeta = Object.entries(byAgent)
    .filter(([agent, p]) => {
      const cohortPickRate = cohort[agent]?.pickRate ?? 0;
      return (
        p.games >= 3 &&
        p.winRate > overallWR &&
        cohortPickRate < 5
      );
    })
    .map(([agent, p]) => ({
      agent,
      playerGames:   p.games,
      playerWinRate: p.winRate,
      cohortPickRate: cohort[agent]?.pickRate ?? 0,
    }))
    .sort((a, b) => b.playerWinRate - a.playerWinRate);

  return {
    generatedAt: meta.generatedAt,
    sample:      meta.sample,
    overlap,
    gaps,
    offMeta,
  };
}
