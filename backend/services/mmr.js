import fetch from 'node-fetch';

const MMR_BASE = 'https://api.henrikdev.xyz/valorant/v3/mmr';

/**
 * Fetch the player's current rank and RR from the HenrikDev MMR endpoint.
 * Returns null (silently) if the fetch fails — the coach prompt will just
 * omit the rank context rather than breaking the request.
 *
 * @param {string} region
 * @param {string} name
 * @param {string} tag
 * @returns {Promise<{ tier: string, rr: number, leaderboardRank: number|null }|null>}
 */
export async function fetchPlayerRank(region, name, tag) {
  const url = `${MMR_BASE}/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: process.env.HDEV_KEY },
    });

    if (!res.ok) {
      console.warn(`MMR fetch failed: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const current = json?.data?.current;
    if (!current) return null;

    return {
      tier: current.tier?.name ?? 'Unknown',
      rr: current.rr ?? 0,
      leaderboardRank: json?.data?.current?.leaderboard_placement?.rank ?? null,
    };
  } catch (err) {
    console.warn(`MMR fetch error (continuing without rank): ${err.message}`);
    return null;
  }
}
