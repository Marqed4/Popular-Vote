import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

import ParticipantHeader from "./ParticipantHeader";
import ParticipantInput from "./ParticipantInput";
import ParticipantClusterList from "./ParticipantCluster";

import "./Participant.css";

export default function Participant({ code, onBack }) {
  const [phase, setPhase] = useState("OPEN");
  const [submissions, setSubmissions] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [answers, setAnswers] = useState({});
  const [upvotes, setUpvotes] = useState({});       // { questionText: true }
  const [submissionCount, setSubmissionCount] = useState(0);
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

    // on reconnect, re-fetch current session state to catch any events missed
    socket.on("reconnect", () => {
      fetchSession();
    });

    socket.on("submission:count", ({ count }) => setSubmissionCount(count));
    socket.on("session:closed",    () => setPhase("CLOSED"));
    socket.on("session:clustering",() => setPhase("CLUSTERING"));
    socket.on("session:results",   ({ clusters }) => {
      setClusters(clusters);
      setPhase("RESULTS");
    });
    socket.on("session:ended",     () => setPhase("ENDED"));
    socket.on("cluster:deleted",   ({ clusterId }) =>
      setClusters(prev => prev.filter(c => c.id !== clusterId))
    );
    socket.on("cluster:answered",  ({ clusterId, answer }) =>
      setAnswers(prev => ({ ...prev, [clusterId]: answer }))
    );
    socket.on("cluster:upvote",    ({ questionText, upvoteCount }) =>
      setClusters(prev => prev.map(c => ({
        ...c,
        questions: c.questions?.map(q =>
          q.text === questionText ? { ...q, upvoteCount } : q
        ),
      })))
    );

    return () => socket.disconnect();
  }, [code]);

  async function fetchSession() {
    try {
      const res = await fetch(`/api/sessions/${code}`);
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      setPhase(data.phase);
      setClusters(data.clusters ?? []);
      setSubmissionCount(data.submissionCount ?? 0);
      const savedAnswers = {};
      (data.clusters ?? []).forEach(c => {
        if (c.answer) savedAnswers[c.id] = c.answer;
      });
      setAnswers(savedAnswers);
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
      setSubmissions(prev => [...prev, { id: data.id, text }]);
    } catch (err) {
      setError(err.message ?? "Failed to submit question.");
    } finally {
      setSubmitLoading(false);
    }
  }

  async function deleteSubmission(submissionId) {
    try {
      await fetch(`/api/sessions/${code}/submit/${submissionId}`, { method: "DELETE" });
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
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
      setSubmissions(prev => [...prev, { id: data.id, text, clusterId }]);
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

  if (phase === "OPEN" || phase === "CLOSED") {
    return (
      <div className="pd-root">
        <ParticipantHeader phase={phase} code={code} onBack={onBack} />
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
        <ParticipantHeader phase={phase} code={code} onBack={onBack} />
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

  if (phase === "RESULTS" || phase === "ENDED") {
    return (
      <div className="pd-root">
        <ParticipantHeader
          phase={phase}
          code={code}
          onBack={onBack}
          submittedCount={submissions.length}
          inClusterCount={inClusterCount}
        />
        <div className="pd-body">
          {phase === "ENDED" && (
            <div className="pd-ended-banner">
              Session has ended — here's the full summary.
            </div>
          )}
          {error && <div className="pd-error">{error}</div>}
          {phase === "RESULTS" && (
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
          )}
          <ParticipantClusterList
            phase={phase}
            clusters={clusters}
            answers={answers}
            myTexts={myTexts}
            upvotes={upvotes}
            onUpvote={upvoteQuestion}
            onSubmitToCluster={submitToCluster}
          />
        </div>
      </div>
    );
  }

  return null;
}