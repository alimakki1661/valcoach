import { useState } from 'react';

export default function PlayerForm({ onSubmit, loading }) {
  const [name, setName] = useState('choppa');
  const [tag, setTag] = useState('hhh');
  const [region, setRegion] = useState('na');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name: name.trim(), tag: tag.trim(), region });
  }

  return (
    <form onSubmit={handleSubmit} className="player-form">
      <div className="form-row">
        <label>
          Player Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="choppa"
            required
          />
        </label>
        <label>
          Tag
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="hhh"
            required
          />
        </label>
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="na">NA</option>
            <option value="eu">EU</option>
            <option value="ap">AP</option>
            <option value="kr">KR</option>
            <option value="latam">LATAM</option>
            <option value="br">BR</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Loading…' : 'Fetch Matches'}
      </button>
    </form>
  );
}
