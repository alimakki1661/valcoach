/**
 * fetchMeta.js
 *
 * Builds a ranked-meta snapshot by:
 *  1. Fetching the top N players from the NA leaderboard.
 *  2. For each non-anonymous, non-banned player, fetching their last MATCHES_PER_PLAYER
 *     competitive matches by PUUID.
 *  3. Aggregating agent pick rate, win rate, and agent×map pick/win rate.
 *  4. Writing the result to backend/data/meta.json.
 *
 * Usage (from the backend/ directory):
 *   node scripts/fetchMeta.js
 *
 * Rate-limit note:
 *   Henrik proxies Riot API calls. An uncached match-history request can consume
 *   up to MATCHES_PER_PLAYER units of Henrik's 30 req/min budget.
 *   The default DELAY_MS of 2500ms keeps throughput well within that.
 *   Expect a 30-player run to take ~75 seconds.
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ────────────────────────────────────────────────────────────
const PLAYER_COUNT       = 100;   // how many leaderboard players to sample
const MATCHES_PER_PLAYER = 5;     // recent competitive matches per player
// Each match-history request can cost up to MATCHES_PER_PLAYER Riot API units
// against Henrik's 30/min budget, so we need ≥ (MATCHES_PER_PLAYER/30)*60 s gap.
// 12 s leaves comfortable headroom (5 units per call × 5 calls = 25 units/min).
const DELAY_MS           = 12000; // ms between match-fetch requests
// Minimum appearances for a win rate to be considered statistically meaningful.
const WIN_RATE_MIN_PICKS = 20;
const REGION             = 'na';
const HDEV_BASE          = 'https://api.henrikdev.xyz/valorant';
// ──────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');
const OUT_FILE  = path.join(DATA_DIR, 'meta.json');

const HDEV_KEY = process.env.HDEV_KEY;
if (!HDEV_KEY) {
  console.error('ERROR: HDEV_KEY is not set in .env');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── HTTP helper with 429 backoff ────────────────────────────────────────────
async function hGet(urlPath, attempt = 0) {
  const url = `${HDEV_BASE}${urlPath}`;
  const res = await fetch(url, { headers: { Authorization: HDEV_KEY } });

  if (res.status === 429 && attempt < 3) {
    const wait = (attempt + 1) * 15_000; // 15 s, 30 s, 45 s
    console.warn(`    429 on attempt ${attempt + 1} — waiting ${wait / 1000}s before retry…`);
    await sleep(wait);
    return hGet(urlPath, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ─── Step 1: Leaderboard ──────────────────────────────────────────────────────
async function fetchLeaderboard() {
  console.log(`\nFetching top ${PLAYER_COUNT} players from NA leaderboard…`);
  const json = await hGet(
    `/v3/leaderboard/${REGION}/pc?start_index=1&size=${PLAYER_COUNT}`
  );
  const all = json?.data?.players ?? [];
  const eligible = all.filter((p) => !p.is_anonymized && !p.is_banned);
  console.log(
    `  ${all.length} entries returned, ${eligible.length} eligible ` +
    `(${all.length - eligible.length} skipped: anonymized or banned)`
  );
  return eligible;
}

// ─── Step 2: Per-player match fetch ──────────────────────────────────────────
async function fetchMatchesForPlayer(player, index, total) {
  const label = player.name && player.tag
    ? `${player.name}#${player.tag}`
    : `rank #${player.leaderboard_rank}`;

  try {
    const json = await hGet(
      `/v4/by-puuid/matches/${REGION}/pc/${player.puuid}` +
      `?mode=competitive&size=${MATCHES_PER_PLAYER}`
    );
    const matches = (json?.data ?? []).filter(
      (m) => m?.metadata?.queue?.id === 'competitive'
    );
    console.log(
      `  [${index}/${total}] ${label} — ${matches.length} competitive match(es) collected`
    );
    return { player, matches };
  } catch (err) {
    console.warn(`  [${index}/${total}] ${label} — SKIPPED (${err.message})`);
    return null;
  }
}

// ─── Step 3: Aggregation ──────────────────────────────────────────────────────
function buildAggregates(playerResults) {
  // agent → { picks, wins }
  const agentBuckets = {};

  let totalMatches = 0;
  let totalPlayers = 0;

  for (const { player, matches } of playerResults) {
    if (!matches.length) continue;
    totalPlayers++;

    for (const match of matches) {
      const matchPlayer = findPlayer(match, player.puuid);
      if (!matchPlayer) continue;

      const agent = matchPlayer.agent?.name;
      if (!agent) continue;

      const teamId = matchPlayer.team_id;
      const teams  = match?.teams ?? [];
      const team   = teams.find((t) => t.team_id === teamId);
      const won    = team?.won ?? false;

      bump(agentBuckets, agent, won);
      totalMatches++;
    }
  }

  // pickRate denominator = total player-match appearances in this cohort
  // (not all players in each match — only the sampled leaderboard players)
  const agentStats = rateify(agentBuckets, totalMatches);

  return { totalMatches, totalPlayers, agentStats };
}

function findPlayer(match, puuid) {
  return (match?.players ?? []).find((p) => p.puuid === puuid);
}

function bump(buckets, key, won) {
  if (!buckets[key]) buckets[key] = { picks: 0, wins: 0 };
  buckets[key].picks++;
  if (won) buckets[key].wins++;
}

function rateify(buckets, totalAppearances) {
  const result = {};
  for (const [key, { picks, wins }] of Object.entries(buckets)) {
    result[key] = {
      picks,
      // pickRate = share of this cohort's own games played on this agent
      pickRate: totalAppearances > 0 ? round((picks / totalAppearances) * 100) : 0,
      wins,
      // winRate only meaningful above WIN_RATE_MIN_PICKS; null below that threshold
      winRate: picks >= WIN_RATE_MIN_PICKS ? round((wins / picks) * 100) : null,
    };
  }
  // Sort descending by picks for readability
  return Object.fromEntries(
    Object.entries(result).sort((a, b) => b[1].picks - a[1].picks)
  );
}

function round(n) { return Math.round(n * 10) / 10; }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== ValCoach Meta Fetcher ===');
  console.log(`Config: ${PLAYER_COUNT} players, ${MATCHES_PER_PLAYER} matches each, ${DELAY_MS}ms delay`);

  const players = await fetchLeaderboard();

  console.log(`\nFetching match history (${players.length} players × ${MATCHES_PER_PLAYER} matches)…`);
  const estMin = Math.ceil((players.length * DELAY_MS) / 60_000);
  console.log(`Estimated time: ~${estMin} minute(s) (${DELAY_MS / 1000}s delay between requests)\n`);

  const results = [];
  for (let i = 0; i < players.length; i++) {
    const result = await fetchMatchesForPlayer(players[i], i + 1, players.length);
    if (result) results.push(result);
    // Throttle: skip delay after the last player
    if (i < players.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nAggregating ${results.length} players' match data…`);
  const { totalMatches, totalPlayers, agentStats } = buildAggregates(results);

  const agentsWithWinRate = Object.values(agentStats).filter((a) => a.winRate !== null).length;

  const output = {
    generatedAt: new Date().toISOString(),
    // pickRate denominator: total player-match appearances by sampled leaderboard players
    // (not every player in each match). Represents pick-share within this cohort.
    pickRateNote: 'pickRate = agent appearances / total appearances by sampled players',
    winRateNote:  `winRate is null for agents with fewer than ${WIN_RATE_MIN_PICKS} appearances`,
    sample: {
      players:           totalPlayers,
      totalMatches,
      matchesPerPlayer:  MATCHES_PER_PLAYER,
      leaderboardRegion: REGION,
    },
    agentStats,
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Players sampled  : ${totalPlayers}`);
  console.log(`   Matches collected: ${totalMatches}`);
  console.log(`   Agents tracked   : ${Object.keys(agentStats).length}`);
  console.log(`   Win rate shown   : ${agentsWithWinRate} agents (≥${WIN_RATE_MIN_PICKS} appearances)`);
  console.log(`   Win rate null    : ${Object.keys(agentStats).length - agentsWithWinRate} agents (below threshold)`);
  console.log(`   Output           : ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
