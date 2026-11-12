import { useState } from 'react';
import PlayerForm from './components/PlayerForm';
import MatchTable from './components/MatchTable';
import CoachReport from './components/CoachReport';
import MetaPanel from './components/MetaPanel';
import { getMatches, getCoachReport } from './api/client';
import './App.css';

export default function App() {
  const [matches, setMatches] = useState([]);
  const [report, setReport] = useState(null);
  const [metaComparison, setMetaComparison] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [collapseSignal, setCollapseSignal] = useState(0);

  async function handleFetchMatches(player) {
    setError(null);
    setMatches([]);
    setReport(null);
    setMatchesLoading(true);
    try {
      const data = await getMatches(player);
      setMatches(data);
      setCurrentPlayer(player);
    } catch (e) {
      setError(e.message);
    } finally {
      setMatchesLoading(false);
    }
  }

  async function handleGetReport() {
    setError(null);
    setReport(null);
    setCoachBusy(false);
    setCoachLoading(true);
    try {
      const data = await getCoachReport(matches, currentPlayer);
      const { metaComparison: mc, ...report } = data;
      setReport(report);
      setMetaComparison(mc ?? null);
      setCollapseSignal((n) => n + 1); // tell MatchTable to collapse
    } catch (e) {
      if (e.busy) {
        setCoachBusy(true);
      } else {
        setError(e.message);
      }
    } finally {
      setCoachLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>ValCoach</h1>
        <p className="tagline">AI-powered Valorant coaching from your match history</p>
      </header>

      <main>
        <PlayerForm onSubmit={handleFetchMatches} loading={matchesLoading} />

        {error && <p className="error">{error}</p>}

        <MatchTable matches={matches} collapseSignal={collapseSignal} />

        <CoachReport
          report={report}
          loading={coachLoading}
          busy={coachBusy}
          onRequest={handleGetReport}
          hasMatches={matches.length > 0}
        />

        <MetaPanel meta={metaComparison} />
      </main>
    </div>
  );
}
