import { useState, useEffect, useRef } from 'react';

export default function MatchTable({ matches, collapseSignal }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef(null);

  // Expand when matches first arrive
  useEffect(() => {
    if (matches.length > 0) setOpen(true);
  }, [matches.length > 0]);

  // Auto-collapse when the coach report finishes (collapseSignal flips)
  useEffect(() => {
    if (collapseSignal) setOpen(false);
  }, [collapseSignal]);

  if (!matches.length) return null;

  const wins   = matches.filter((m) => m.won).length;
  const losses = matches.length - wins;
  const wr     = Math.round((wins / matches.length) * 100);

  return (
    <div className="table-wrapper">
      <button
        className="table-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="match-table-body"
      >
        <span className="table-toggle-title">
          Last {matches.length} Competitive Matches
        </span>
        <span className="table-toggle-summary" aria-hidden="true">
          {wins}W {losses}L · {wr}% WR
        </span>
        <span className={`table-chevron${open ? ' open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>

      <div
        id="match-table-body"
        ref={bodyRef}
        className={`table-body${open ? ' expanded' : ''}`}
      >
        <table>
          <thead>
            <tr>
              <th>Map</th>
              <th>Agent</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th>KDA</th>
              <th>HS%</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={m.matchId ?? i} className={m.won ? 'win' : 'loss'}>
                <td>{m.map}</td>
                <td>{m.agent}</td>
                <td>{m.kills}</td>
                <td>{m.deaths}</td>
                <td>{m.assists}</td>
                <td>{m.kda}</td>
                <td>{m.hsPercent}%</td>
                <td className={m.won ? 'result-win' : 'result-loss'}>
                  {m.won ? 'WIN' : 'LOSS'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
