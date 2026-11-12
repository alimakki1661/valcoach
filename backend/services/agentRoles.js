import fetch from 'node-fetch';

const AGENTS_URL = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true';

// In-memory cache: { displayName (lowercase) -> role displayName }
let cache = null;

/**
 * Return the agent→role map, fetching once and caching for the process lifetime.
 * On failure returns an empty map so callers can continue without roles.
 * @returns {Promise<Map<string, string>>}
 */
export async function getAgentRoles() {
  if (cache) return cache;

  try {
    const res = await fetch(AGENTS_URL, { timeout: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const map = new Map();

    for (const agent of json.data ?? []) {
      const name = agent.displayName?.toLowerCase();
      const role = agent.role?.displayName ?? null;
      if (name && role) map.set(name, role);
    }

    cache = map;
    console.log(`Agent roles loaded: ${map.size} agents`);
  } catch (err) {
    console.warn(`Could not fetch agent roles (will continue without): ${err.message}`);
    cache = new Map(); // empty — won't break anything
  }

  return cache;
}

/** Warm the cache at startup — fire and forget. */
export function prefetchAgentRoles() {
  getAgentRoles().catch(() => {});
}
