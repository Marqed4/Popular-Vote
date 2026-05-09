import "./Participant.css";

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export default function ParticipantHeader({ phase, code, onBack, onOpenSidebar, submittedCount, inClusterCount, darkMode, onToggleDark }) {
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
      <button className="pv-nav-icon-btn" onClick={onToggleDark} title={darkMode ? "Light mode" : "Dark mode"}>
        {darkMode ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}

