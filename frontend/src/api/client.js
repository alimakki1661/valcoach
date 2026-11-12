const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function fetchWithTimeout(url, options = {}, ms = 35_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') throw new Error('Request timed out — is the backend running?');
      throw err;
    })
    .finally(() => clearTimeout(id));
}

export async function getMatches({ name, tag, region }) {
  const params = new URLSearchParams({ name, tag, region });
  const res = await fetchWithTimeout(`${BASE}/api/matches?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to fetch matches');
  }
  return res.json();
}

export async function getCoachReport(matches, player) {
  const res = await fetchWithTimeout(
    `${BASE}/api/coach`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches, ...player }),
    },
    90_000
  );
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const err = new Error(body.error || 'Failed to fetch coaching report');
    err.busy = !!body.busy;
    throw err;
  }
  return body;
}
