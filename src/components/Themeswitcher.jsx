import { useState, useEffect } from "react";
import { DefaultBackgrounds } from "../assets/backgrounds/index.js";
import "./ThemeSwitcher.css";

const BG_STORAGE_KEY = "pv-background";

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GlassIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}


function BgPickerModal({ current, darkMode, onSelect, onClose }) {
  const filtered = Object.entries(DefaultBackgrounds).filter(([key]) =>
    darkMode ? key.startsWith("night_") : key.startsWith("day_")
  );

  return (
    <div className="ts-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ts-bg-modal">
        <button className="ts-modal-close" onClick={onClose}>×</button>
        <h2 className="ts-modal-title">Choose Background</h2>
        <p className="ts-modal-sub">
          {darkMode ? "Night" : "Day"} backgrounds — switch mode to see the other set.
        </p>
        <div className="ts-bg-grid">
          {filtered.map(([key, src]) => (
            <button
              key={key}
              className={`ts-bg-option ${current === key ? "ts-bg-option--active" : ""}`}
              onClick={() => { onSelect(key); onClose(); }}
            >
              <img src={src} alt={key} />
              <span>{key.replace(/^(day_|night_)/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ThemeSwitcher
 *
 * Reads/writes to localStorage and sets data-theme / data-glass on <html>.
 * Emits onChange({ mode, bgKey }) whenever either changes so the parent
 * can re-render a background image or pass state down.
 *
 * mode: "day" | "dark" | "glass"
 *
 * "day" → data-theme=light, data-glass=off, solid bg
 * "dark" → data-theme=dark,  data-glass=off, solid bg
 * "glass" → data-theme=light (or dark), data-glass=on, photo bg visible
 *
 * The component is self-contained; just drop it anywhere in the header.
 */
export default function ThemeSwitcher({ onChange }) {
  const [mode, setMode] = useState(() => {
    const dark  = localStorage.getItem("pv-dark")  === "true";
    const glass = localStorage.getItem("pv-glass") === "true";
    if (glass) return "glass";
    if (dark)  return "dark";
    return "day";
  });

  const [bgKey, setBgKey] = useState(
    () => localStorage.getItem(BG_STORAGE_KEY) ?? "day_barn"
  );

  const [showPicker, setShowPicker] = useState(false);

  // Derive sub-settings from mode
  const isDark  = mode === "dark";
  const isGlass = mode === "glass";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark  ? "dark"  : "light");
    document.documentElement.setAttribute("data-glass", isGlass ? "on"    : "off");
    localStorage.setItem("pv-dark",  isDark);
    localStorage.setItem("pv-glass", isGlass);
    onChange?.({ mode, bgKey });
  }, [mode, bgKey]);

  function switchMode(next) {
    setMode(prev => {
      if (prev === next) return prev;
      // When switching modes, auto-pick a sensible default bg
      const prefix = next === "dark" ? "night_" : "day_";
      const currentBg = localStorage.getItem(BG_STORAGE_KEY) ?? "";
      if (!currentBg.startsWith(prefix)) {
        const match = Object.keys(DefaultBackgrounds).find(k => k.startsWith(prefix));
        if (match) {
          setBgKey(match);
          localStorage.setItem(BG_STORAGE_KEY, match);
        }
      }
      return next;
    });
  }

  function selectBg(key) {
    setBgKey(key);
    localStorage.setItem(BG_STORAGE_KEY, key);
  }

  const MODES = [
    { id: "day",   label: "Day",   icon: <SunIcon /> },
    { id: "dark",  label: "Dark",  icon: <MoonIcon /> },
    { id: "glass", label: "Glass", icon: <GlassIcon /> },
  ];

  return (
    <>
      <div className="ts-root">
        <div className="ts-toggle" role="group" aria-label="Display mode">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`ts-toggle-btn ${mode === m.id ? "ts-toggle-btn--active" : ""}`}
              onClick={() => switchMode(m.id)}
              title={`${m.label} mode`}
              aria-pressed={mode === m.id}
            >
              {m.icon}
              <span className="ts-toggle-label">{m.label}</span>
            </button>
          ))}
        </div>

        <button
          className="ts-bg-btn"
          onClick={() => setShowPicker(true)}
          title="Change background"
          aria-label="Change background photo"
        >
          <ImageIcon />
        </button>
      </div>

      {showPicker && (
        <BgPickerModal
          current={bgKey}
          darkMode={isDark || (isGlass && bgKey.startsWith("night_"))}
          onSelect={selectBg}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}