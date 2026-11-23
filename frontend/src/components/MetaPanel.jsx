export default function MetaPanel({ meta }) {
  if (!meta) return null;

  const { generatedAt, sample, overlap, gaps, offMeta } = meta;
  const date = new Date(generatedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const hasContent = overlap.length > 0 || gaps.length > 0 || offMeta.length > 0;

  return (
    <div className="meta-panel">
      <div className="meta-header">
        <h2>Top-500 NA Snapshot</h2>
        <span className="meta-meta">
          {sample.players} players · {sample.totalMatches} matches · {date}
        </span>
      </div>

      {!hasContent && (
        <p className="muted" style={{ padding: '0.75rem 0' }}>
          No overlap or gap data for this player's agent pool.
        </p>
      )}

      {overlap.length > 0 && (
        <section className="meta-section">
          <h3>Agents you share with the cohort</h3>
          <table className="meta-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Cohort pick</th>
                <th>Cohort WR</th>
                <th>Your games</th>
                <th>Your WR</th>
              </tr>
            </thead>
            <tbody>
              {overlap.map((r) => (
                <tr key={r.agent}>
                  <td>{r.agent}</td>
                  <td>{r.cohortPickRate}% <span className="meta-apps">({r.cohortAppearances})</span></td>
                  <td>{r.cohortWinRate !== null ? `${Math.round(r.cohortWinRate)}%` : <span className="meta-null">—</span>}</td>
                  <td>{r.playerGames}</td>
                  <td>{r.playerWinRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="meta-section">
          <h3>Cohort top-8 you haven't played much</h3>
          <table className="meta-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Cohort pick</th>
                <th>Cohort WR</th>
                <th>Your games</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((r) => (
                <tr key={r.agent}>
                  <td>{r.agent}</td>
                  <td>{r.cohortPickRate}% <span className="meta-apps">({r.cohortAppearances})</span></td>
                  <td>{r.cohortWinRate !== null ? `${Math.round(r.cohortWinRate)}%` : <span className="meta-null">—</span>}</td>
                  <td className="meta-muted">{r.playerGames}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {offMeta.length > 0 && (
        <section className="meta-section">
          <h3>Off-meta agents working for you</h3>
          <p className="meta-note">3+ games, win rate above your baseline, cohort pick under 5%</p>
          <table className="meta-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Your games</th>
                <th>Your WR</th>
                <th>Cohort pick</th>
              </tr>
            </thead>
            <tbody>
              {offMeta.map((r) => (
                <tr key={r.agent}>
                  <td>{r.agent}</td>
                  <td>{r.playerGames}</td>
                  <td>{r.playerWinRate}%</td>
                  <td>{r.cohortPickRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
