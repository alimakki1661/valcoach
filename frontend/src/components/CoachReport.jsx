export default function CoachReport({ report, loading, busy, onRequest, hasMatches }) {
  return (
    <div className="coach-report">
      <div className="coach-header">
        <h2>Coach's Report</h2>
        {hasMatches && (
          <button onClick={onRequest} disabled={loading}>
            {loading ? 'Analyzing…' : "Get Coach's Report"}
          </button>
        )}
      </div>

      {loading && <p className="muted">Sending your matches to the AI coach…</p>}

      {busy && !loading && (
        <div className="coach-busy">
          <span className="coach-busy-icon">⏳</span>
          <div>
            <strong>The AI is busy right now</strong>
            <p>Gemini is experiencing high demand. Please try again in a moment.</p>
          </div>
        </div>
      )}

      {report && !loading && (
        <div className="report-body">
          <p className="report-summary">{report.summary}</p>

          {report.sampleWarning && (
            <p className="sample-warning">⚠️ {report.sampleWarning}</p>
          )}

          <div className="report-columns">
            <section>
              <h3>💪 Strengths</h3>
              <ul>
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3>⚠️ Weaknesses</h3>
              <ul>
                {report.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          </div>

          <section className="tips">
            <h3>🎯 Actionable Tips</h3>
            <ol>
              {report.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
