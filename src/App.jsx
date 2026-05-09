import { useState, useEffect } from 'react';
import Home from './components/Home.jsx';
import HostView from './components/Host.jsx';
import Participant from './components/Participant.jsx';
import { supabase } from './lib/supabase.js';
import './App.css';

const MY_SESSIONS_KEY = "pv-my-sessions";
const JOINED_KEY      = "pv-joined-sessions";

// After sign-in, move any localStorage sessions into Supabase so history is preserved
async function migrateLocalSessions(userId) {
  try {
    const created = JSON.parse(localStorage.getItem(MY_SESSIONS_KEY) ?? "[]");
    const joined  = JSON.parse(localStorage.getItem(JOINED_KEY) ?? "[]").map(s => s.code ?? s);

    const rows = [
      ...created.map(code => ({ user_id: userId, session_code: code, role: "host" })),
      ...joined.filter(c => !created.includes(c)).map(code => ({ user_id: userId, session_code: code, role: "participant" })),
    ].filter(r => r.session_code);

    if (rows.length) {
      await supabase
        .from("user_sessions")
        .upsert(rows, { onConflict: "user_id,session_code", ignoreDuplicates: true });
      localStorage.removeItem(MY_SESSIONS_KEY);
      localStorage.removeItem(JOINED_KEY);
    }

    // migrate any locally-stored "my questions" for each session
    const allCodes = [...new Set([...created, ...joined])];
    for (const code of allCodes) {
      const key = `pv-my-subs-${code}`;
      try {
        const subs = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (!subs.length) continue;
        const subRows = subs
          .map(s => ({ user_id: userId, session_code: code, submission_id: s.id, content: s.text ?? s.content ?? "" }))
          .filter(r => r.submission_id && r.content);
        if (subRows.length) {
          await supabase
            .from("user_submissions")
            .upsert(subRows, { onConflict: "user_id,submission_id", ignoreDuplicates: true });
          localStorage.removeItem(key);
        }
      } catch {}
    }
  } catch (err) {
    console.error('[migrateLocalSessions]', err);
  }
}

export default function App() {
  const [view, setView]   = useState(null);
  const [user, setUser]   = useState(null);

  useEffect(() => {
    // restore session on page load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        await migrateLocalSessions(u.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Save a session reference — localStorage for anon users, Supabase for signed-in users
  async function saveSession(code, role) {
    if (!code || code === "NEW") return;

    if (user) {
      supabase
        .from("user_sessions")
        .upsert(
          { user_id: user.id, session_code: code, role },
          { onConflict: "user_id,session_code", ignoreDuplicates: true }
        )
        .catch(err => console.error('[saveSession]', err));
    } else {
      if (role === "host") {
        const prev = JSON.parse(localStorage.getItem(MY_SESSIONS_KEY) ?? "[]");
        if (!prev.includes(code)) {
          localStorage.setItem(MY_SESSIONS_KEY, JSON.stringify([code, ...prev]));
        }
      } else {
        const prev = JSON.parse(localStorage.getItem(JOINED_KEY) ?? "[]");
        const filtered = prev.filter(s => (s.code ?? s) !== code);
        localStorage.setItem(JOINED_KEY, JSON.stringify([
          { code, joinedAt: new Date().toISOString() },
          ...filtered,
        ]));
      }
    }
  }

  function handleNavigate(role, code, meta = {}) {
    if (code && code !== "NEW") saveSession(code, role);
    setView({ role, code, ...meta });
  }

  if (view?.role === "host") {
    return (
      <HostView
        code={view.code}
        initialTitle={view.title ?? ''}
        initialDescription={view.description ?? ''}
        user={user}
        onSessionCreated={code => saveSession(code, "host")}
        onBack={() => setView(null)}
      />
    );
  }

  if (view?.role === "participant") {
    return (
      <Participant
        code={view.code}
        user={user}
        onBack={() => setView(null)}
      />
    );
  }

  return <Home onNavigate={handleNavigate} user={user} />;
}
