import "./HostHeader.css";

export default function HostHeader({ phase, participantCount, submissionCount, onBack }) {
  return (
    <header className="hd-header">
      <div className="hd-header-left">
        <button className="hd-back" onClick={onBack}>← back</button>
        <div className="hd-header-meta">
          <span className="hd-header-label">Host Dashboard</span>
          <span className={`hd-phase hd-phase--${phase.toLowerCase()}`}>{phase}</span>
        </div>
      </div>
      <div className="hd-header-right">
        <div className="hd-stat">
          <span className="hd-stat-num">{participantCount}</span>
          <span className="hd-stat-label">participants</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-num">{submissionCount}</span>
          <span className="hd-stat-label">submissions</span>
        </div>
      </div>
    </header>
  );
}