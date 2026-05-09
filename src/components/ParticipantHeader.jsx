import "./Participant.css";

export default function ParticipantHeader({ phase, code, onBack, onOpenSidebar, submittedCount, inClusterCount }) {
  const showStats = phase === "RESULTS" || phase === "ENDED";

  return (
    <header className="pd-header">
      <div className="pd-header-left">
        <button className="pd-hamburger" onClick={onOpenSidebar} title="Session history">
          <span /><span /><span />
        </button>
        <button className="pd-back" onClick={onBack}>← back</button>
        <div className="pd-header-meta">
          <span className="pd-header-label">Participant</span>
          <span className={`pd-phase pd-phase--${phase.toLowerCase()}`}>{phase}</span>
        </div>
      </div>

      <div className="pd-header-right">
        <span className="pd-header-code">{code}</span>

        {showStats && (
          <div className="pd-header-stats">
            <div className="pd-hstat">
              <span className="pd-hstat-num">{submittedCount ?? 0}</span>
              <span className="pd-hstat-label">submitted</span>
            </div>
            <div className="pd-hstat">
              <span className="pd-hstat-num">{inClusterCount ?? 0}</span>
              <span className="pd-hstat-label">in cluster</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
