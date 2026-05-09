import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { supabase } from "../lib/supabase.js";

import ParticipantClusterList from "./ParticipantCluster";
import ParticipantHeader from "./ParticipantHeader";
import ParticipantInput from "./ParticipantInput";
import Summary from "./Summary";

import "./Participant.css";

// localStorage key scoped to this session code so multiple sessions don't collide
function mySubsKey(code) { return `pv-my-subs-${code}`; }

function loadMySubmissions(code) {
  try { return JSON.parse(localStorage.getItem(mySubsKey(code)) ?? "[]"); }
  catch { return []; }
}

function saveMySubmissions(code, submissions) {
  localStorage.setItem(mySubsKey(code), JSON.stringify(submissions));
}

export default function Participant({ code, onBack, user, onOpenSidebar, darkMode, onToggleDark }) {
  const [phase, setPhase] = useState("OPEN");
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // "my" submissions — restored from localStorage on return so questions stay identified as mine
  const [submissions, setSubmissions] = useState(() => loadMySubmissions(code));
  const [clusters, setClusters] = useState([]);
  const [answers, setAnswers] = useState({});
  const [upvotes, setUpvotes] = useState({});
  const [submissionCount, setSubmissionCount] = useState(0);
  const [followups, setFollowups] = useState({}); // { [clusterId]: string[] }
  const [error, setError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  const socketRef = useRef(null);
  const socketIdRef = useRef(null);

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    if (!code) return;

    const socket = io("http://localhost:2167");
    socketRef.current = socket;

    socket.on("connect", () => {
      socketIdRef.current = socket.id;
      socket.emit("join:room", { code, role: "participant" });
    });

    // sync on (re)connect — covers mid-session joins and page refreshes via socket
    socket.on("session:sync", ({ clusters: syncClusters, phase: syncPhase }) => {
      if (syncClusters?.length) {
        setClusters(syncClusters);
        setAnswers(prev => {
          const next = { ...prev };
          syncClusters.forEach(c => { if (c.answer) next[String(c.id)] = c.answer; });
          return next;
        });
      }
      if (syncPhase) setPhase(syncPhase);
    });

    // on reconnect, re-fetch current session state to catch any events missed
    socket.on("reconnect", () => {
      fetchSession();
    });

    socket.on("submission:count", ({ count }) => setSubmissionCount(count));
    socket.on("session:closed",    () => setPhase("CLOSED"));
    socket.on("session:clustering",() => setPhase("CLUSTERING"));
    socket.on("session:results",   ({ clusters }) => {
      setClusters(clusters);
      // populate any answers already on clusters (e.g. after re-clustering)
      setAnswers(prev => {
        const next = { ...prev };
        (clusters ?? []).forEach(c => { if (c.answer) next[String(c.id)] = c.answer; });
        return next;
      });
      setPhase("RESULTS");
    });
    socket.on("session:expanding",  () => setPhase("EXPANDING"));
    socket.on("cluster:followups",  ({ clusterId, suggestions }) =>
      setFollowups(prev => ({ ...prev, [clusterId]: suggestions }))
    );
    socket.on("session:ended",      () => setPhase("ENDED"));
    socket.on("cluster:deleted",   ({ clusterId }) =>
      setClusters(prev => prev.filter(c => c.id !== clusterId))
    );
    socket.on("cluster:answered", ({ clusterId, answer }) =>
      /*
      clusterId coming from the socket might be a number 
      but cluster.id from the DB is a UUID string 
      so answers[cluster.id] never matches.
      */
      setAnswers(prev => ({ ...prev, [String(clusterId)]: answer }))
    );
    socket.on("cluster:upvote",    ({ questionText, upvoteCount }) =>
      setClusters(prev => prev.map(c => ({
        ...c,
        questions: c.questions?.map(q =>
          q.text === questionText ? { ...q, upvoteCount } : q
        ),
      })))
    );

    socket.on("cluster:submission:added", ({ clusterId, question, submissionCount }) => {
      setClusters(prev => prev.map(c => {
        if (String(c.id) !== String(clusterId)) return c;
        return {
          ...c,
          submission_count: submissionCount,
          questions: [...(c.questions ?? []), question],
        };
      }));
    });

    return () => socket.disconnect();
  }, [code]);

  async function fetchSession() {
    try {
      const res = await fetch(`/api/sessions/${code}`);
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      setPhase(data.phase);
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setClusters(data.clusters ?? []);
      setSubmissionCount(data.submissionCount ?? 0);
      const savedAnswers = {};
      (data.clusters ?? []).forEach(c => {
        if (c.answer) savedAnswers[c.id] = c.answer;
      });
      setAnswers(savedAnswers);

      // if signed in, restore "my" submissions from Supabase (overrides localStorage)
      if (user) {
        const { data: rows } = await supabase
          .from("user_submissions")
          .select("submission_id, content")
          .eq("user_id", user.id)
          .eq("session_code", code);
        if (rows?.length) {
          const restored = rows.map(r => ({ id: r.submission_id, text: r.content }));
          setSubmissions(restored);
          saveMySubmissions(code, restored); // keep localStorage in sync too
        }
      }
    } catch (err) {
      setError("Could not load session.");
    }
  }

  async function submitQuestion(text) {
    setSubmitLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions(prev => {
        const next = [...prev, { id: data.id, text }];
        saveMySubmissions(code, next);
        return next;
      });
      // if signed in, persist to Supabase permanently
      if (user) {
        supabase.from("user_submissions").insert({
          user_id: user.id, session_code: code, submission_id: data.id, content: text
        }).catch(err => console.error("[user_submissions] insert failed:", err));
      }
    } catch (err) {
      setError(err.message ?? "Failed to submit question.");
    } finally {
      setSubmitLoading(false);
    }
  }

  async function deleteSubmission(submissionId) {
    try {
      await fetch(`/api/sessions/${code}/submit/${submissionId}`, { method: "DELETE" });
      setSubmissions(prev => {
        const next = prev.filter(s => s.id !== submissionId);
        saveMySubmissions(code, next);
        return next;
      });
      // remove from Supabase too if signed in
      if (user) {
        supabase.from("user_submissions")
          .delete()
          .eq("user_id", user.id)
          .eq("submission_id", submissionId)
          .catch(err => console.error("[user_submissions] delete failed:", err));
      }
    } catch {
      setError("Failed to delete submission.");
    }
  }

  async function submitToCluster(clusterId, text) {
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/clusters/${clusterId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions(prev => {
        const next = [...prev, { id: data.id, text, clusterId }];
        saveMySubmissions(code, next);
        return next;
      });
      // if signed in, persist to Supabase permanently
      if (user) {
        supabase.from("user_submissions").insert({
          user_id: user.id, session_code: code, submission_id: data.id, content: text
        }).catch(err => console.error("[user_submissions] insert failed:", err));
      }
    } catch (err) {
      setError(err.message ?? "Failed to submit to cluster.");
    }
  }

  async function upvoteQuestion(questionText) {
    const alreadyVoted = upvotes[questionText];
    setUpvotes(prev => ({ ...prev, [questionText]: !alreadyVoted }));
    try {
      await fetch(`/api/sessions/${code}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText, undo: alreadyVoted }),
      });
    } catch {
      // revert
      setUpvotes(prev => ({ ...prev, [questionText]: alreadyVoted }));
    }
  }

  const myTexts = new Set(submissions.map(s => s.text));
  const inClusterCount = submissions.filter(s =>
    clusters.some(c => c.questions?.some(q => {
      const qText = (q.text ?? '').replace(/^\d+\.\s*/, '').trim().toLowerCase();
      const sText = s.text.trim().toLowerCase();
      return qText === sText || qText.includes(sText) || sText.includes(qText);
    }))
  ).length;

  if (phase === "ENDED") {
    return (
      <div className="pd-root">
        <ParticipantHeader phase={phase} code={code} onBack={onBack} onOpenSidebar={onOpenSidebar} darkMode={darkMode} onToggleDark={onToggleDark} />
        <div className="pd-body">
          <Summary
            clusters={clusters}
            answers={answers}
            tags={[]}
            submissionCount={submissionCount}
          />
        </div>
      </div>
    );
  }

  if (phase === "OPEN" || phase === "CLOSED") {
    return (
      <div className="pd-root">
        <ParticipantHeader phase={phase} code={code} onBack={onBack} onOpenSidebar={onOpenSidebar} darkMode={darkMode} onToggleDark={onToggleDark} />
        {(title || description) && (
          <div className="pd-session-context">
            {title && <div className="pd-session-title">{title}</div>}
            {description && <div className="pd-session-description">{description}</div>}
          </div>
        )}
        <div className="pd-body">
          <ParticipantInput
            phase={phase}
            submissions={submissions}
            submittedCount={submissions.length}
            inClusterCount={inClusterCount}
            submitLoading={submitLoading}
            error={error}
            onSubmit={submitQuestion}
            onDelete={deleteSubmission}
          />
        </div>
      </div>
    );
  }

  if (phase === "CLUSTERING") {
    return (
      <div className="pd-root">
        <ParticipantHeader phase={phase} code={code} onBack={onBack} onOpenSidebar={onOpenSidebar} darkMode={darkMode} onToggleDark={onToggleDark} />
        <div className="pd-body">
          <div className="pd-waiting">
            <div className="pd-spinner" />
            <div className="pd-waiting-title">Grouping questions…</div>
            <p className="pd-waiting-sub">The host is clustering submissions. Results will appear shortly.</p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "RESULTS") {
    return (
      <div className="pd-root">
        <ParticipantHeader
          phase={phase}
          code={code}
          onBack={onBack}
          submittedCount={submissions.length}
          inClusterCount={inClusterCount} onOpenSidebar={onOpenSidebar} darkMode={darkMode} onToggleDark={onToggleDark} />
        <div className="pd-body">
          {error && <div className="pd-error">{error}</div>}
          <ParticipantInput
            phase="OPEN"
            submissions={submissions}
            submittedCount={submissions.length}
            inClusterCount={inClusterCount}
            submitLoading={submitLoading}
            error={null}
            onSubmit={submitQuestion}
            onDelete={deleteSubmission}
          />
          <ParticipantClusterList
            phase={phase}
            clusters={clusters}
            answers={answers}
            myTexts={myTexts}
            upvotes={upvotes}
            followups={followups}
            onUpvote={upvoteQuestion}
            onSubmitToCluster={submitToCluster}
          />
        </div>
      </div>
    );
  }

  if (phase === "EXPANDING") {
    return (
      <div className="pd-root">
        <ParticipantHeader phase={phase} code={code} onBack={onBack} onOpenSidebar={onOpenSidebar} darkMode={darkMode} onToggleDark={onToggleDark} />
        <div className="pd-body">
          <div className="pd-round2-banner">
            <div className="pd-round2-title">Round 2 — Dig deeper</div>
            <p className="pd-round2-sub">The host has answered the first round. Now's your chance to ask follow-up questions.</p>
          </div>

          {expansionPrompts.length > 0 && (
            <div className="pd-prompts">
              <div className="pd-prompts-label">Need inspiration? Here are some areas to explore:</div>
              <ul className="pd-prompts-list">
                {expansionPrompts.flatMap(p => p.questions).map((q, i) => (
                  <li key={i} className="pd-prompt-item">{q}</li>
                ))}
              </ul>
            </div>
          )}

          <ParticipantInput
            phase="OPEN"
            submissions={submissions}
            submittedCount={submissions.length}
            inClusterCount={0}
            submitLoading={submitLoading}
            error={error}
            onSubmit={submitQuestion}
            onDelete={deleteSubmission}
          />
        </div>
      </div>
    );
  }

  return null;
}


