import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

import HostHeader from "./HostHeader";
import HostSidebar from "./HostSidebar.jsx";
import ParticipantList from "./ParticipantList";
import ClusterList from "./ClusterList";

import "./Host.css";

export default function HostDashboard({ code: initialCode, onBack }) {
  const [phase, setPhase] = useState("OPEN");
  const [code, setCode] = useState(initialCode);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [submissionsAtLastCluster, setSubmissionsAtLastCluster] = useState(0);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(initialCode === "NEW");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [editingAnswer, setEditingAnswer] = useState(null);

  // expansion state
  const [expansionPreviews, setExpansionPreviews] = useState({});
  const [selectedQuestions, setSelectedQuestions] = useState({});
  const [manualQuestions, setManualQuestions] = useState({});
  const [expandLoading, setExpandLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // curator state
  const [participants, setParticipants] = useState([]);
  const [curators, setCurators] = useState([]);

  const socketRef = useRef(null);

  useEffect(() => {
    if (initialCode === "NEW") {
      createSession();
    } else {
      fetchSession();
    }
  }, []);

  useEffect(() => {
    if (!code || code === "NEW") return;

    const socket = io("http://localhost:2167");
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:room", { code });
    });

    socket.on("reconnect", () => {
      fetchSession();
    });

    socket.on("submission:count", ({ count }) => setSubmissionCount(count));
    socket.on("session:closed", () => setPhase("CLOSED"));
    socket.on("session:clustering", () => setPhase("CLUSTERING"));
    socket.on("session:results", ({ clusters, submissionsAtLastCluster }) => {
      setClusters(clusters);
      if (submissionsAtLastCluster !== undefined) setSubmissionsAtLastCluster(submissionsAtLastCluster);
      setPhase("RESULTS");
    });

    socket.on("session:ended", () => setPhase("ENDED"));
    socket.on("cluster:deleted", ({ clusterId }) =>
      setClusters(prev => prev.filter(c => c.id !== clusterId))
    );
    socket.on("cluster:answered", ({ clusterId, answer }) =>
      setAnswers(prev => ({ ...prev, [clusterId]: answer }))
    );
    socket.on("participant:joined", ({ socketId, count }) => {
      setParticipantCount(count);
      setParticipants(prev => {
        if (prev.find(p => p.socketId === socketId)) return prev;
        return [...prev, { socketId, isCurator: false }];
      });
    });
    socket.on("participant:left", ({ socketId, count }) => {
      setParticipantCount(count);
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
    });
    socket.on("curator:updated", ({ curators: newCurators }) => {
      setCurators(newCurators);
      setParticipants(prev =>
        prev.map(p => ({ ...p, isCurator: newCurators.includes(p.socketId) }))
      );
    });
    socket.on("expansion:preview", ({ clusterPreviews, contextualFacts }) => {
      console.log("[socket] expansion:preview received", { clusterPreviews, contextualFacts });
      setExpansionPreviews(prev => {
        const next = { ...prev };
        clusterPreviews.forEach(({ clusterId, previewedQuestions }) => {
          next[clusterId] = { questions: previewedQuestions, loading: false };
        });
        console.log("[socket] expansion:preview — new expansionPreviews:", next);
        return next;
      });
      console.log("[socket] setting phase to RESULTS");
      setPhase("RESULTS");
    });

    return () => socket.disconnect();
  }, [code]);

  async function createSession() {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCode(data.code);
      setPhase(data.phase);
      setTags(data.tags ?? []);
    } catch (err) {
      setError(err.message ?? "Failed to create session.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSession() {
    try {
      const res = await fetch(`/api/sessions/${initialCode}`);
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      setPhase(data.phase);
      setTags(data.tags ?? []);
      setSubmissionCount(data.submissionCount ?? 0);
      setSubmissionsAtLastCluster(data.submissionsAtLastCluster ?? 0);
      setParticipantCount(data.participantCount ?? 0);
      setClusters(data.clusters ?? []);
      setCurators(data.curators ?? []);
      const savedAnswers = {};
      const savedSelected = {};
      const savedPreviews = {};
      (data.clusters ?? []).forEach(c => {
        if (c.answer) savedAnswers[c.id] = c.answer;
        if (c.selected_questions?.length) savedSelected[c.id] = new Set(c.selected_questions);
        if (c.previewed_questions?.length) savedPreviews[c.id] = { questions: c.previewed_questions, loading: false };
      });
      setAnswers(savedAnswers);
      setSelectedQuestions(savedSelected);
      setExpansionPreviews(savedPreviews);
    } catch (err) {
      setError("Could not load session.");
    }
  }

  async function closeSubmissions() {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/close`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      setPhase("CLOSED");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function triggerClustering() {
    if (submissionCount === 0) { setError("No submissions yet."); return; }
    setActionLoading(true);
    setError("");
    setPhase("CLUSTERING");
    try {
      const res = await fetch(`/api/sessions/${code}/cluster`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClusters(data.clusters);
      setPhase("RESULTS");
    } catch (err) {
      setError(err.message);
      setPhase("CLOSED");
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteCluster(clusterId) {
    try {
      await fetch(`/api/sessions/${code}/clusters/${clusterId}`, { method: "DELETE" });
      setClusters(prev => prev.filter(c => c.id !== clusterId));
    } catch {
      setError("Failed to delete cluster.");
    }
  }

  // if URI Componenet doesn't work switch back to regex and try to sanitize it
  async function saveAnswer(answerId) {
    const answer = answers[answerId] ?? "";
    const [clusterId, question] = answerId.includes("::") 
        ? answerId.split("::") 
        : [answerId, null];
    try {
        const url = question
        ? `/api/sessions/${code}/clusters/${clusterId}/answer?question=${encodeURIComponent(question)}`
        : `/api/sessions/${code}/clusters/${clusterId}/answer`;
        await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
        });
        setEditingAnswer(null);
    } catch {
        setError("Failed to save answer.");
    }
    }

  async function endSession() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      setPhase("ENDED");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // call ./components/ExpansionPanel.jsx to transition phase & get AI previewed questions back
  async function fetchExpansionPreview() {
    console.log("[fetchExpansionPreview] called — clusters:", clusters.map(c => c.id));
    setPreviewLoading(true);
    setError("");
    const loadingState = {};
    clusters.forEach(c => { loadingState[c.id] = { questions: [], loading: true }; });
    setExpansionPreviews(loadingState);

    try {
      const res = await fetch(`/api/sessions/${code}/expand`, { method: "POST" });
      const data = await res.json();
      console.log("[fetchExpansionPreview] expand response — ok:", res.ok, "data:", data);
      if (!res.ok) throw new Error(data.error);

      const next = {};
      (data.clusterPreviews ?? []).forEach(({ clusterId, previewedQuestions }) => {
        console.log("[fetchExpansionPreview] mapping clusterId:", clusterId, "— looking in clusters:", clusters.map(c => c.id));
        // fix: find by id, not array index (because my index attempts would never increase on prompt)
        const cluster = clusters.find(c => c.id === clusterId);
        console.log("[fetchExpansionPreview] matched cluster:", cluster ?? "NOT FOUND");
        if (cluster) next[cluster.id] = { questions: previewedQuestions, loading: false };
      });

      console.log("[fetchExpansionPreview] final expansionPreviews to set:", next);
      setExpansionPreviews(next);
      setPhase("RESULTS");
    } catch (err) {
      console.error("[fetchExpansionPreview] error:", err);
      setError(err.message ?? "Failed to load AI suggestions.");
      const cleared = {};
      clusters.forEach(c => { cleared[c.id] = { questions: [], loading: false }; });
      setExpansionPreviews(cleared);
    } finally {
      setPreviewLoading(false);
    }
  }

  // toggle a previewed question selection for a cluster
  async function toggleQuestion(clusterId, question) {
    setSelectedQuestions(prev => {
      const current = new Set(prev[clusterId] ?? []);
      current.has(question) ? current.delete(question) : current.add(question);
      return { ...prev, [clusterId]: current };
    });
    try {
      await fetch(`/api/sessions/${code}/clusters/${clusterId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
    } catch {
      // revert optimistic update
      setSelectedQuestions(prev => {
        const current = new Set(prev[clusterId] ?? []);
        current.has(question) ? current.delete(question) : current.add(question);
        return { ...prev, [clusterId]: current };
      });
    }
  }

  // trigger expansion because it sends selected & manual questions are included in the transitions phase
    async function triggerExpansion() {
        setExpandLoading(true);
        setError("");
        try {
            const expansionData = clusters.map(c => ({
            clusterId: c.id,
            selectedQuestions: [...(selectedQuestions[c.id] ?? [])],
            manualQuestion: (manualQuestions[c.id] ?? "").trim(),
            }));
            const res = await fetch(`/api/sessions/${code}/expand`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expansionData }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // fon't wait for sockets
            if (data.clusterPreviews) {
            const next = {};
            data.clusterPreviews.forEach(({ clusterId, previewedQuestions }) => {
                const cluster = clusters.find(c => c.id === clusterId);
                if (cluster) next[cluster.id] = { questions: previewedQuestions, loading: false };
            });
            setExpansionPreviews(next);
            }
            setPhase("RESULTS");
        } catch (err) {
            setError(err.message ?? "Failed to trigger expansion.");
        } finally {
            setExpandLoading(false);
        }
    }

  // promote or demote a participant as curator
  async function toggleCurator(socketId) {
    try {
      const res = await fetch(`/api/sessions/${code}/curators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socketId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurators(data.curators);
      setParticipants(prev =>
        prev.map(p => ({ ...p, isCurator: data.curators.includes(p.socketId) }))
      );
    } catch (err) {
      setError(err.message ?? "Failed to update curator.");
    }
  }

  function addTag(e) {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim().replace(/,$/, "");
      if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
      setTagInput("");
    }
  }

  function removeTag(t) {
    setTags(prev => prev.filter(x => x !== t));
  }

  const isHost = true;

  if (loading) {
    return (
      <div className="hd-loading">
        <div className="hd-loading-text">Creating session…</div>
      </div>
    );
  }

  return (
    <div className="hd-root">
      <HostHeader
        phase={phase}
        participantCount={participantCount}
        submissionCount={submissionCount}
        onBack={onBack}
      />

      <div className="hd-body">
        <aside className="hd-sidebar-shell">
          <HostSidebar
            code={code}
            phase={phase}
            tags={tags}
            tagInput={tagInput}
            error={error}
            actionLoading={actionLoading}
            previewLoading={previewLoading}
            expandLoading={expandLoading}
            onTagInput={setTagInput}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            canRecluster={submissionCount > submissionsAtLastCluster}
            onClose={closeSubmissions}
            onCluster={triggerClustering}
            onPreviewExpansion={fetchExpansionPreview}
            onTriggerExpansion={triggerExpansion}
            onEndSession={endSession}
          />
          <ParticipantList
            participants={participants}
            curators={curators}
            onToggleCurator={toggleCurator}
          />
        </aside>

        <main className="hd-main">
          <ClusterList
            phase={phase}
            clusters={clusters}
            submissionCount={submissionCount}
            answers={answers}
            editingAnswer={editingAnswer}
            expansionPreviews={expansionPreviews}
            selectedQuestions={selectedQuestions}
            manualQuestions={manualQuestions}
            onDeleteCluster={deleteCluster}
            onSetEditingAnswer={setEditingAnswer}
            onAnswerChange={(id, val) => setAnswers(prev => ({ ...prev, [id]: val }))}
            onSaveAnswer={saveAnswer}
            onToggleQuestion={toggleQuestion}
            onManualChange={(id, val) => setManualQuestions(prev => ({ ...prev, [id]: val }))}
          />
        </main>
      </div>
    </div>
  );
}