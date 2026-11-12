import fetch from 'node-fetch';
import { COACH_SYSTEM_PROMPT } from '../prompts/coach.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

/** Pause for `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call the Gemini generateContent endpoint for a given model.
 * Returns the raw fetch Response (caller checks res.ok).
 */
async function callGemini(model, apiKey, body) {
  // Strip "models/" prefix if the env var includes it, since it's already in GEMINI_API_BASE
  const modelId = model.replace(/^models\//, '');
  const url = `${GEMINI_API_BASE}/${modelId}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Gemini request timed out after 30 s');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try a model with up to MAX_RETRIES retries on 429/503, with exponential backoff.
 * Returns parsed JSON on success, or throws with the last error message.
 */
async function tryModelWithRetries(model, apiKey, body) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_MS[attempt - 1]);
    }

    const res = await callGemini(model, apiKey, body);

    if (res.ok) {
      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error('Gemini returned an empty response');
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`Failed to parse Gemini JSON response: ${raw}`);
      }
    }

    const text = await res.text();

    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      console.warn(`Gemini ${res.status} on attempt ${attempt + 1}/${MAX_RETRIES} (model: ${model}), retrying in ${BACKOFF_MS[attempt]}ms…`);
      lastError = new Error(`Gemini API error ${res.status}: ${text}`);
      continue;
    }

    // Non-retryable error or final attempt — throw immediately.
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  throw lastError;
}

/**
 * Guarantee that the parsed report always conforms to our expected shape,
 * regardless of whether the LLM followed every instruction exactly.
 */
function postProcess(report, totalMatches) {
  // Ensure summary opens with "Based on your last N" (allow model's wording if it starts correctly)
  if (report.summary && !/^based on (your last )?\d+/i.test(report.summary)) {
    report.summary = `Based on your last ${totalMatches} competitive match${totalMatches === 1 ? '' : 'es'}, ${report.summary.charAt(0).toLowerCase()}${report.summary.slice(1)}`;
  }

  // sampleWarning is owned by the LLM — it is instructed to list agents/maps by name.
  // Only normalise the empty-string case so the frontend always gets null or a string.
  if (report.sampleWarning === '') report.sampleWarning = null;

  return report;
}

/**
 * Build the agent→role reference block for the prompt.
 * Only included when at least one match has a role attached.
 */
function buildAgentRoleSection(matches) {
  const roleMap = {};
  for (const m of matches) {
    if (m.agent && m.agentRole) roleMap[m.agent] = m.agentRole;
  }
  if (Object.keys(roleMap).length === 0) return '';
  const lines = Object.entries(roleMap).map(([a, r]) => `  ${a}: ${r}`).join('\n');
  return `\n## Agent roles (authoritative — use exactly these, never infer)\n${lines}\n`;
}

/**
 * Build the meta comparison section for the prompt.
 * The LLM receives finished lists — no arithmetic required.
 */
function buildMetaSection(mc) {
  if (!mc) return '';

  const lines = [];
  lines.push('\n## Top-500 NA cohort comparison (precomputed — do not recalculate)');
  lines.push(`Snapshot: ${mc.generatedAt} | ${mc.sample.players} players, ${mc.sample.totalMatches} matches`);
  lines.push('pickRate = share of this cohort\'s own games; winRate is null when fewer than 20 appearances.\n');

  if (mc.overlap.length) {
    lines.push('### Overlap (cohort top-8 agents the player has ≥2 games on)');
    for (const r of mc.overlap) {
      const cohortWR = r.cohortWinRate !== null ? `${r.cohortWinRate}% WR` : 'WR N/A (<20 apps)';
      lines.push(`  ${r.agent}: cohort ${r.cohortPickRate}% pick (${r.cohortAppearances} apps), ${cohortWR} | player ${r.playerGames} games, ${r.playerWinRate}% WR`);
    }
  }

  if (mc.gaps.length) {
    lines.push('### Gaps (cohort top-8 agents the player has ≤1 game on)');
    for (const r of mc.gaps) {
      const cohortWR = r.cohortWinRate !== null ? `${r.cohortWinRate}% WR` : 'WR N/A (<20 apps)';
      lines.push(`  ${r.agent}: cohort ${r.cohortPickRate}% pick (${r.cohortAppearances} apps), ${cohortWR}`);
    }
  }

  if (mc.offMeta.length) {
    lines.push('### Off-meta strengths (player ≥3 games, WR > player baseline, cohort pick <5%)');
    for (const r of mc.offMeta) {
      lines.push(`  ${r.agent}: player ${r.playerGames} games, ${r.playerWinRate}% WR | cohort ${r.cohortPickRate}% pick`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Send the match summary to Google Gemini and return a parsed coaching report.
 * Retries the primary model up to 3 times (1 s / 2 s / 4 s backoff) on 429/503,
 * then falls back to LLM_FALLBACK_MODEL (if set) for one final attempt.
 *
 * @param {Array}       matches         Cleaned match objects from henrik.js
 * @param {Object}      aggregates      Per-agent and per-map stats from aggregates.js
 * @param {Object|null} rank            { tier, rr, leaderboardRank } or null
 * @param {Object|null} metaComparison  Precomputed output of computeMetaComparison()
 * @returns {Promise<Object>}  { summary, strengths, weaknesses, tips, sampleWarning }
 */
export async function getCoachingReport(matches, aggregates, rank = null, metaComparison = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const primaryModel = process.env.LLM_MODEL || 'gemini-3.5-flash';
  const fallbackModel = process.env.LLM_FALLBACK_MODEL || null;

  const rankSection = rank
    ? `\n## Player rank\n  Tier: ${rank.tier}\n  RR: ${rank.rr}${rank.leaderboardRank ? `\n  Leaderboard: #${rank.leaderboardRank}` : ''}\n`
    : '';

  const userContent =
    `Total matches analysed: ${matches.length}\n` +
    rankSection +
    buildAgentRoleSection(matches) +
    buildMetaSection(metaComparison) +
    `\n## Aggregated stats\n${JSON.stringify(aggregates, null, 2)}\n\n` +
    `## Raw match log\n${JSON.stringify(
      // Strip raw shot counts from the log — the LLM only needs hsPercent and the aggregates
      matches.map(({ headshots, bodyshots, legshots, ...m }) => m),
      null, 2
    )}`;

  const body = {
    system_instruction: {
      parts: [{ text: COACH_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userContent }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const totalMatches = aggregates?.totalMatches ?? matches.length;

  // --- Primary model (with retries) ---
  try {
    const report = await tryModelWithRetries(primaryModel, apiKey, body);
    return postProcess(report, totalMatches);
  } catch (primaryErr) {
    console.error(`Primary model (${primaryModel}) failed after retries: ${primaryErr.message}`);

    if (!fallbackModel) {
      throw new GeminiBusyError(primaryErr.message);
    }

    // --- Fallback model (single attempt) ---
    console.warn(`Trying fallback model: ${fallbackModel}`);
    try {
      const report = await tryModelWithRetries(fallbackModel, apiKey, body);
      return postProcess(report, totalMatches);
    } catch (fallbackErr) {
      console.error(`Fallback model (${fallbackModel}) also failed: ${fallbackErr.message}`);
      throw new GeminiBusyError(fallbackErr.message);
    }
  }
}

/**
 * Sentinel error class so the route can return a friendly 503 to the frontend.
 */
export class GeminiBusyError extends Error {
  constructor(detail) {
    super('The AI is busy right now — please try again in a moment.');
    this.name = 'GeminiBusyError';
    this.detail = detail;
  }
}
