import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";
import { DefaultBackgrounds } from '../assets/backgrounds/index.js';
import "./Home.css";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { db: { schema: 'public' } }
);

const SESSIONS_PER_PAGE = 15;
const BG_STORAGE_KEY = "pv-background";

const PHASE_MAP = {
  OPEN:       ["pv-phase-open",    "Open"],
  CLOSED:     ["pv-phase-closed",  "Closed"],
  CLUSTERING: ["pv-phase-results", "Clustering"],
  RESULTS:    ["pv-phase-results", "Results"],
  ENDED:      ["pv-phase-ended",   "Ended"],
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function PhaseBadge({ phase }) {
  const [cls, label] = PHASE_MAP[phase] ?? ["pv-phase-ended", phase];
  return <span className={`pv-phase-badge ${cls}`}>{label}</span>;
}

function TrashIcon() {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.755,20.283,4,8H20L18.245,20.283A2,2,0,0,1,16.265,22H7.735A2,2,0,0,1,5.755,20.283ZM21,4H16V3a1,1,0,0,0-1-1H9A1,1,0,0,0,8,3V4H3A1,1,0,0,0,3,6H21a1,1,0,0,0,0-2Z"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function GlassIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

/*
Separate available nighttime and daytime backgrounds since nighttime ones look odd in light mode and vice versa.
The picker will show night options in dark mode, and day options in light mode.
*/
function BackgroundPicker({ current, onSelect, onClose, darkMode }) {
  const filtered = Object.entries(DefaultBackgrounds).filter(([key]) =>
    darkMode ? key.startsWith("night_") : key.startsWith("day_")
  );

  return (
    <div className="pv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pv-modal pv-bg-picker">
        <button className="pv-modal-close" onClick={onClose}>×</button>
        <h2>Choose Background</h2>
        <div className="pv-bg-grid">
          {filtered.map(([key, src]) => (
            <button
              key={key}
              className={`pv-bg-option ${current === key ? "active" : ""}`}
              onClick={() => { onSelect(key); onClose(); }}
            >
              <img src={src} alt={key} />
              <span>{key.replace(/^day_/, '').replace(/^night_/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InstructionsModal({ onClose }) {
  return (
    <div className="pv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pv-modal">
        <button className="pv-modal-close" onClick={onClose}>×</button>
        <h2>How Popular Vote Works</h2>
        <div className="pv-modal-section">
          <h3>For Hosts</h3>
          <p>
            Create a session and share the 6-character code or link.
            Close submissions when ready, control/trigger AI clustering,
            write responses to each cluster,
            and then end the session for a shareable summary.
          </p>
        </div>
        <div className="pv-modal-section">
          <h3>For Participants</h3>
          <p>
            Join via code, shared link, or QR scan.
            After clustering, upvote questions and view the host's answers.
          </p>
        </div>
        <div className="pv-modal-section">
          <h3>Privacy</h3>
          <p>
            All questions are anonymous. No accounts,
            no persistent data after a session ends.
          </p>
        </div>
      </div>
    </div>
  );
}

function YourSessions({ onRejoin }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => { loadSessions(); }, [page]);

  async function loadSessions() {
    setLoading(true);
    try {
      const mine = JSON.parse(localStorage.getItem("pv-my-sessions") ?? "[]");
      if (mine.length === 0) {
        setSessions([]);
        setHasMore(false);
        return;
      }
      const { data, error } = await supabase
        .from("sessions")
        .select("code, phase, tags, created_at")
        .in("code", mine)
        .order("created_at", { ascending: false })
        .range(0, page * SESSIONS_PER_PAGE);
      if (error) throw error;
      setSessions(data ?? []);
      setHasMore((data ?? []).length === page * SESSIONS_PER_PAGE);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSession(e, code) {
    e.stopPropagation();
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("code", code);
    if (!error) {
      setSessions(prev => prev.filter(s => s.code !== code));
      // ADD THIS:
      const mine = JSON.parse(localStorage.getItem("pv-my-sessions") ?? "[]");
      localStorage.setItem("pv-my-sessions", JSON.stringify(mine.filter(c => c !== code)));
    }
  }

  return (
    <div className="pv-panel">
      <div className="pv-panel-header">
        <div className="pv-panel-title">Your Sessions</div>
        <div className="pv-panel-subtitle">Click any session to rejoin as host.</div>
      </div>
      <div className="pv-panel-body">
        {loading ? (
          <>{[1, 2, 3].map(i => <div key={i} className="pv-skeleton" />)}</>
        ) : sessions.length === 0 ? (
          <div className="pv-empty">No sessions yet.<br />Create one below to begin.</div>
        ) : (
          <>
            <ul className="pv-session-list">
              {sessions.map(s => (
                <li key={s.code} className="pv-session-item" onClick={() => onRejoin(s.code)}>
                  <div className="pv-session-left">
                    <span className="pv-session-code">{s.code}</span>
                    <span className="pv-session-tags">
                      {s.tags?.length ? s.tags.join(", ") : "No tags"}
                    </span>
                  </div>
                  <div className="pv-session-meta">
                    <PhaseBadge phase={s.phase} />
                    <span className="pv-session-date">{formatDate(s.created_at)}</span>
                    <button
                      className="pv-btn-delete"
                      onClick={(e) => deleteSession(e, s.code)}
                      title="Delete session"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button className="pv-view-more" onClick={() => setPage(p => p + 1)}>
                view more…
              </button>
            )}
          </>
        )}
        <div className="pv-divider">or</div>
        <button className="pv-btn-create" onClick={() => onRejoin("NEW")}>
          Create New Session
        </button>
      </div>
    </div>
  );
}

function QRScanner({ onScan }) {
  const [status, setStatus] = useState("starting"); // starting | scanning | error
  const [errMsg, setErrMsg] = useState("");
  const isRunningRef = useRef(false);
  const scannerRef = useRef(null);
  const doneRef = useRef(false); // prevent double-fire in strict mode

  useEffect(() => {
    const scanner = new Html5Qrcode("pv-qr-reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        if (doneRef.current) return;
        let code = decodedText.trim().toUpperCase();
        try {
          const c = new URL(decodedText).searchParams.get("code");
          if (c) code = c.toUpperCase();
        } catch {}
        if (/^[A-Z0-9]{6}$/.test(code)) {
          doneRef.current = true;
          scanner.stop().catch(() => {}).finally(() => onScan(code));
        }
      },
      () => {} // ignore per-frame decode failures
    )
    .then(() => { isRunningRef.current = true; setStatus("scanning"); })
    .catch(() => { setStatus("error"); setErrMsg("Camera access denied. Please allow camera and try again."); });

    return () => {
      if (isRunningRef.current) {
        isRunningRef.current = false;
        scanner.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="pv-qr-scanner">
      <div id="pv-qr-reader" className="pv-qr-reader" />
      {status === "starting" && <div className="pv-qr-hint">Starting camera…</div>}
      {status === "scanning" && <div className="pv-qr-hint">Aim at the QR code on the host's screen.</div>}
      {status === "error" && <div className="pv-error-msg">{errMsg}</div>}
    </div>
  );
}

function JoinSession({ onJoin }) {
  const [tab, setTab] = useState("type");
  const [code, setCode] = useState("");
  const [linkVal, setLink] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c && /^[A-Z0-9]{6}$/i.test(c)) setCode(c.toUpperCase());
  }, []);

  function handleCodeChange(e) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
    setError("");
  }

  function handleLinkChange(e) {
    setLink(e.target.value);
    setError("");
    try {
      const c = new URL(e.target.value).searchParams.get("code");
      if (c && /^[A-Z0-9]{6}$/i.test(c)) setCode(c.toUpperCase());
    } catch {}
  }

  async function handleJoin() {
    const target = code.trim().toUpperCase();
    if (target.length !== 6) { setError("Session codes are exactly 6 characters."); return; }
    try {
      const res = await fetch(`/api/sessions/${target}/join`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Session not found or already closed.");
        return;
      }
      onJoin(target);
    } catch {
      setError("Could not reach server — please try again.");
    }
  }

  const canJoin = code.length === 6;

  return (
    <div className="pv-panel">
      <div className="pv-panel-header">
        <div className="pv-panel-title">Join a Session</div>
        <div className="pv-panel-subtitle">Enter a code, paste a link, or scan a QR code.</div>
      </div>
      <div className="pv-panel-body">
        <div className="pv-join-tabs">
          {[["type", "Type Code"], ["link", "Paste Link"], ["qr", "Scan QR"]].map(([id, label]) => (
            <button
              key={id}
              className={`pv-join-tab ${tab === id ? "active" : ""}`}
              onClick={() => { setTab(id); setError(""); }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`pv-join-panel ${tab === "type" ? "active" : ""}`}>
          <input
            className={`pv-code-input ${error ? "error" : ""}`}
            placeholder="enter code"
            value={code}
            onChange={handleCodeChange}
            onKeyDown={e => e.key === "Enter" && canJoin && handleJoin()}
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="pv-error-msg">{error}</div>
          <button className="pv-btn-join" disabled={!canJoin} onClick={handleJoin}>
            Join Session
          </button>
        </div>

        <div className={`pv-join-panel ${tab === "link" ? "active" : ""}`}>
          <p className="pv-link-hint">Paste the full session URL — the code will be extracted automatically.</p>
          <input
            className="pv-link-input"
            placeholder="https://…?code=XYZ67"
            value={linkVal}
            onChange={handleLinkChange}
          />
          <div className="pv-error-msg">{error}</div>
          <button className="pv-btn-join" disabled={!canJoin} onClick={handleJoin}>
            Join Session
          </button>
        </div>

        <div className={`pv-join-panel ${tab === "qr" ? "active" : ""}`}>
          {tab === "qr" && (
            <QRScanner onScan={async (scannedCode) => {
              try {
                const res = await fetch(`/api/sessions/${scannedCode}/join`, { method: "POST" });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  setError(body.error ?? "Session not found or already closed.");
                  return;
                }
                onJoin(scannedCode);
              } catch {
                setError("Could not reach server — please try again.");
              }
            }} />
          )}
          {error && <div className="pv-error-msg">{error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Home({ onNavigate }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [bgKey, setBgKey] = useState(() => localStorage.getItem(BG_STORAGE_KEY) ?? "barn");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("pv-dark") === "true");
  const [glassMode, setGlassMode] = useState(() => localStorage.getItem("pv-glass") === "true");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    document.documentElement.setAttribute("data-glass", glassMode ? "on" : "off");
    localStorage.setItem("pv-dark", darkMode);
    localStorage.setItem("pv-glass", glassMode);
  }, [darkMode, glassMode]);

  function handleToggleGlass() {
    setGlassMode(prev => !prev);
  }

  function handleToggleDark() {
    setDarkMode(prev => {
      const next = !prev;
      const prefix = next ? "night_" : "day_";
      const firstMatch = Object.keys(DefaultBackgrounds).find(k => k.startsWith(prefix));
      if (firstMatch) {
        setBgKey(firstMatch);
        localStorage.setItem(BG_STORAGE_KEY, firstMatch);
      }
      return next;
    });
  }

  function handleSelectBg(key) {
    setBgKey(key);
    localStorage.setItem(BG_STORAGE_KEY, key);
  }

  const bgSrc = DefaultBackgrounds[bgKey] ?? DefaultBackgrounds.barn;

  return (
    <div
      className="pv-root"
      style={{ backgroundImage: `url(${bgSrc})` }}
    >
      <nav className="pv-nav">
        <a className="pv-nav-logo" href="/">
          <span className="pv-nav-icon">🗳</span>
          <span className="pv-nav-wordmark">Popular <em>Vote</em></span>
        </a>
        <div className="pv-nav-actions">
          <a
            href="#instructions"
            className="pv-nav-instructions"
            onClick={e => { e.preventDefault(); setShowInstructions(true); }}
          >
            How it works
          </a>
          <button className="pv-nav-settings" onClick={handleToggleDark}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="pv-nav-settings" onClick={handleToggleGlass}
            title={glassMode ? "Disable glass" : "Enable glass"}>
            <GlassIcon />
          </button>
          <button className="pv-nav-settings" onClick={() => setShowBgPicker(true)} title="Change background">
            <SettingsIcon />
          </button>
        </div>
      </nav>

      <div className="pv-hero">
        <h1 className="pv-hero-title">Let the room<br /><em>speak.</em></h1>
        <p className="pv-hero-sub">Anonymous questions, collectively surfaced.</p>
        <div className="pv-hero-rule" />
      </div>

      <main className="pv-home">
        <YourSessions onRejoin={code => onNavigate?.("host", code)} />
        <JoinSession  onJoin={code  => onNavigate?.("participant", code)} />
      </main>

      {showInstructions && <InstructionsModal onClose={() => setShowInstructions(false)} />}
      {showBgPicker && (
        <BackgroundPicker
          current={bgKey}
          onSelect={handleSelectBg}
          onClose={() => setShowBgPicker(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}