import fetch from 'node-fetch';
import { getAgentRoles } from './agentRoles.js';

const BASE = 'https://api.henrikdev.xyz/valorant/v4/matches';

/**
 * Fetch the last N competitive matches for a player and return a
 * cleaned per-match summary safe to send to the frontend / LLM.
 *
 * @param {string} region  e.g. "na"
 * @param {string} name    e.g. "choppa"
 * @param {string} tag     e.g. "hhh"
 * @returns {Promise<Array>}
 */
export async function fetchMatches(region, name, tag) {
  const total = parseInt(process.env.MATCH_SIZE, 10) || 10;
  const PAGE  = 10; // HenrikDev free tier max per request

  // Build page requests: e.g. size=20 → [{size:10,start:0},{size:10,start:10}]
  const pages = [];
  for (let start = 0; start < total; start += PAGE) {
    pages.push({ size: Math.min(PAGE, total - start), start });
  }

  // Fetch all pages in parallel
  const pageResults = await Promise.all(pages.map(({ size, start }) =>
    fetchPage(region, name, tag, size, start)
  ));

  // Flatten, deduplicate by match_id, filter competitive
  const seen = new Set();
  const allMatches = pageResults.flat().filter((m) => {
    const id = m?.metadata?.match_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return m?.metadata?.queue?.id === 'competitive';
  });

  // Roles map may be empty if the fetch failed — that's fine
  const roles = await getAgentRoles();

  return allMatches.map((m) => cleanMatch(m, name, tag, roles)).filter(Boolean);
}

async function fetchPage(region, name, tag, size, start) {
  const url = `${BASE}/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=${size}&start=${start}`;

  const res = await fetch(url, {
    headers: { Authorization: process.env.HDEV_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HenrikDev API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

/**
 * Extract the fields we care about for a single match.
 * Raw shot counts (headshots/bodyshots/legshots) are kept so that
 * aggregates.js can compute a true HS% across multiple games.
 */
function cleanMatch(match, name, tag, roles) {
  const player = findPlayer(match, name, tag);
  if (!player) return null;

  const stats = player.stats ?? {};
  const headshots = stats.headshots ?? 0;
  const bodyshots = stats.bodyshots ?? 0;
  const legshots  = stats.legshots  ?? 0;
  const totalShots = headshots + bodyshots + legshots;
  // Per-match HS% for display in the table
  const hsPercent = totalShots > 0 ? Math.round((headshots / totalShots) * 100) : 0;

  const agentName = player.agent?.name ?? 'Unknown';
  const agentRole = roles.get(agentName.toLowerCase()) ?? null;

  const map = match?.metadata?.map?.name ?? 'Unknown';
  const kills = stats.kills ?? 0;
  const deaths = stats.deaths ?? 0;
  const assists = stats.assists ?? 0;

  // Determine win/loss for this player's team
  const teamId = player.team_id;
  const teams = match?.teams ?? [];
  const playerTeam = teams.find((t) => t.team_id === teamId);
  const won = playerTeam?.won ?? false;

  return {
    matchId:    match?.metadata?.match_id ?? null,
    map,
    agent:      agentName,
    agentRole,          // e.g. "Controller", "Duelist" — null if unavailable
    kills,
    deaths,
    assists,
    // Raw shot counts kept for true aggregate HS% computation
    headshots,
    bodyshots,
    legshots,
    hsPercent,          // per-match % for the UI table
    won,
    kda: deaths === 0 ? kills + assists : +((kills + assists) / deaths).toFixed(2),
  };
}

function findPlayer(match, name, tag) {
  const players = match?.players ?? [];
  return players.find(
    (p) =>
      p?.name?.toLowerCase() === name.toLowerCase() &&
      p?.tag?.toLowerCase() === tag.toLowerCase()
  );
}
