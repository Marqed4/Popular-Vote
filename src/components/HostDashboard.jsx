import { useState, useEffect } from 'react';
import { useSession, PHASES } from '../context/SessionContext';
import { useSocketSession } from '../hooks/useSocketSession';
import './HostDashboard.css';

// ── Cluster Card ──────────────────────────────────────────────────────────────
function ClusterCard({ cluster, onDelete, onAnswerSubmit }) {
  const [expanded,    setExpanded]    = useState(true);
  const [answering,   setAnswering]   = useState(false);
  const [answerText,  setAnswerText]  = useState(cluster.answer ?? '');
  const [saving,      setSaving]      = useState(false);

  const isAnswered = !!cluster.answer;

  async function handleSubmitAnswer() {
    if (!answerText.trim()) return;
    setSaving(true);
    await onAnswerSubmit(cluster.id, answerText.trim());
    setSaving(false);
    setAnswering(false);
  }

  return (
    <div className={`hd-cluster-card ${isAnswered ? 'answered' : ''}`}>
      <div className="hd-cluster-header">
        <div className="hd-cluster-left">
          <span className="hd-cluster-count">{cluster.submission_count ?? cluster.submissionCount} questions</span>
          {isAnswered && <span className="hd-cluster-badge answered">Answered</span>}
        </div>
        <div className="hd-cluster-actions">
          <button
            className="hd-btn-answer"
            onClick={() => setAnswering(a => !a)}
            title={isAnswered ? 'Edit answer' : 'Answer this cluster'}
          >
            {isAnswered ? 'Edit' : '↳ Answer'}
          </button>
          <button
            className="hd-btn-delete"
            onClick={() => onDelete(cluster.id)}
            title="Delete cluster"
          >
            ×
          </button>
        </div>
      </div>

      <p className="hd-cluster-query">{cluster.representative_query ?? cluster.representativeQuery}</p>

      {isAnswered && !answering && (
        <div className="hd-cluster-answer">
          <span className="hd-answer-label">Answer</span>
          <p>{cluster.answer}</p>
        </div>
      )}

      {answering && (
        <div className="hd-answer-form">
          <textarea
            className="hd-answer-textarea"
            value={answerText}
            onChange={e => setAnswerText(e.target.value)}
            placeholder="Type your answer here…"
            rows={3}
          />
          <div className="hd-answer-form-actions">
            <button
              className="hd-btn-submit-answer"
              onClick={handleSubmitAnswer}
              disabled={!answerText.trim() || saving}
            >
              {saving ? 'Saving…' : 'Submit Answer'}
            </button>
            <button className="hd-btn-cancel" onClick={() => { setAnswering(false); setAnswerText(cluster.answer ?? ''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button className="hd-cluster-toggle" onClick={() => setExpanded(e => !e)}>
        {expanded ? 'Hide questions ▲' : 'Show questions ▼'}
      </button>

      {expanded && (
        <ul className="hd-cluster-questions">
          {(cluster.questions ?? []).map((q, i) => (
            <li key={i} className="hd-cluster-question">
              {typeof q === 'string' ? q : q.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Processing Indicator ──────────────────────────────────────────────────────
function ProcessingIndicator() {
  return (
    <div className="hd-processing">
      <div className="hd-spinner" />
      <p className="hd-processing-text">AI is clustering questions…</p>
      <p className="hd-processing-sub">This usually takes a few seconds.</p>
    </div>
  );
}

// ── Session Summary ───────────────────────────────────────────────────────────
function SessionSummary({ clusters, sessionCode, onHome }) {
  const total = clusters.reduce((sum, c) => sum + (c.submission_count ?? c.submissionCount ?? 0), 0);
  const answered = clusters.filter(c => c.answer).length;

  function copySummary() {
    const lines = clusters.map(c => {
      const q = c.representative_query ?? c.representativeQuery;
      const count = c.submission_count ?? c.submissionCount;
      const ans = c.answer ? `\nAnswer: ${c.answer}` : '';
      const originals = (c.questions ?? []).map(q => `  - ${typeof q === 'string' ? q : q.text}`).join('\n');
      return `• ${q} (${count} submissions)${ans}\n${originals}`;
    }).join('\n\n');

    const text = `Popular Vote — Session ${sessionCode}\n${'─'.repeat(40)}\n${clusters.length} clusters · ${total} submissions · ${answered} answered\n\n${lines}`;
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="hd-summary">
      <div className="hd-summary-header">
        <h1 className="hd-summary-title">Session Summary</h1>
        <p className="hd-summary-meta">Session ended · {clusters.length} clusters · {total} submissions · {sessionCode}</p>
        <div className="hd-summary-badges">
          <span className="hd-badge">{clusters.length} Clusters</span>
          <span className="hd-badge">{total} Submissions</span>
          <span className="hd-badge">{answered} Answered</span>
          <button className="hd-btn-copy" onClick={copySummary}>⎘ Copy Summary</button>
        </div>
      </div>
      <div className="hd-summary-grid">
        {clusters.map(c => (
          <div key={c.id} className={`hd-summary-card ${c.answer ? 'answered' : ''}`}>
            <p className="hd-summary-query">{c.representative_query ?? c.representativeQuery}</p>
            <div className="hd-summary-card-meta">
              <span>{c.submission_count ?? c.submissionCount} questions</span>
              {c.answer && <span className="hd-cluster-badge answered">Answered</span>}
            </div>
            {c.answer && (
              <div className="hd-cluster-answer">
                <span className="hd-answer-label">Answer</span>
                <p>{c.answer}</p>
              </div>
            )}
            <ul className="hd-cluster-questions">
              {(c.questions ?? []).map((q, i) => (
                <li key={i} className="hd-cluster-question">
                  {typeof q === 'string' ? q : q.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button className="hd-btn-home" onClick={onHome}>← Back to Home</button>
    </div>
  );
}

// ── Main Host Dashboard ───────────────────────────────────────────────────────
export default function HostDashboard({ sessionCode, onBack }) {
  const {
    phase,
    clusters,
    participantCount,
    submissionCount,
    tags,
    setTags,
    setPhase,
  } = useSession();

  useSocketSession(sessionCode, 'host');

  const [tagInput,    setTagInput]    = useState('');
  const [error,       setError]       = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  // Add a tag
  function handleAddTag(e) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/,$/, '');
      if (newTag && !tags.includes(newTag)) {
        const updated = [...tags, newTag];
        setTags(updated);
        fetch(`/api/sessions/${sessionCode}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: updated }),
        }).catch(() => {});
      }
      setTagInput('');
    }
  }

  function handleRemoveTag(tag) {
    const updated = tags.filter(t => t !== tag);
    setTags(updated);
  }

  // Close submissions
  async function handleClose() {
    setConfirmClose(false);
    setError('');
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/close`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setError(err.message || 'Failed to close session.');
    }
  }

  // Trigger clustering
  async function handleCluster() {
    setError('');
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/cluster`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setError(err.message || 'Clustering failed. You can retry.');
    }
  }

  // End session
  async function handleEnd() {
    setError('');
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/end`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setError(err.message || 'Failed to end session.');
    }
  }

  // Delete cluster
  async function handleDeleteCluster(clusterId) {
    try {
      await fetch(`/api/sessions/${sessionCode}/clusters/${clusterId}`, { method: 'DELETE' });
    } catch {
      setError('Failed to delete cluster.');
    }
  }

  // Submit answer
  async function handleAnswerSubmit(clusterId, answer) {
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/clusters/${clusterId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch {
      setError('Failed to save answer.');
    }
  }

  // Copy session link
  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}?code=${sessionCode}`);
  }

  // ── ENDED phase → summary ──
  if (phase === PHASES.ENDED) {
    return <SessionSummary clusters={clusters} sessionCode={sessionCode} onHome={onBack} />;
  }

  return (
    <div className="hd-root">
      {/* Nav */}
      <nav className="pv-nav">
        <a className="pv-nav-logo" href="/" onClick={e => { e.preventDefault(); onBack(); }}>
          <span className="pv-nav-icon">🗳</span>
          <span className="pv-nav-wordmark">Popular <em>Vote</em></span>
        </a>
        <div className="hd-nav-right">
          <span className="hd-phase-indicator" data-phase={phase}>{phase}</span>
        </div>
      </nav>

      <div className="hd-layout">
        {/* ── Left sidebar ── */}
        <aside className="hd-sidebar">
          {/* Session Code */}
          <div className="hd-panel">
            <div className="hd-panel-header">Session Code</div>
            <div className="hd-panel-body">
              <div className="hd-code">{sessionCode}</div>
              <button className="hd-btn-copy-code" onClick={copyLink}>Copy Link</button>
            </div>
          </div>

          {/* Session Info */}
          <div className="hd-panel">
            <div className="hd-panel-header">Session Info</div>
            <div className="hd-panel-body hd-info-grid">
              <div className="hd-info-row">
                <span className="hd-info-label">Participants</span>
                <span className="hd-info-value">{participantCount}</span>
              </div>
              <div className="hd-info-row">
                <span className="hd-info-label">Submissions</span>
                <span className="hd-info-value">{submissionCount}</span>
              </div>
              <div className="hd-info-row">
                <span className="hd-info-label">Status</span>
                <span className={`hd-status-badge hd-status-${phase?.toLowerCase()}`}>{phase}</span>
              </div>
            </div>
          </div>

          {/* Session Tags — only editable when OPEN */}
          <div className="hd-panel">
            <div className="hd-panel-header">Session Tags</div>
            <div className="hd-panel-body">
              <p className="hd-tags-hint">Add tags to help the AI understand the session topic.</p>
              {phase === PHASES.OPEN && (
                <input
                  className="hd-tag-input"
                  placeholder="Type tag, press Enter…"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                />
              )}
              <div className="hd-tags">
                {tags.map(t => (
                  <span key={t} className="hd-tag">
                    {t}
                    {phase === PHASES.OPEN && (
                      <button onClick={() => handleRemoveTag(t)}>×</button>
                    )}
                  </span>
                ))}
                {tags.length === 0 && <span className="hd-tags-empty">No tags yet.</span>}
              </div>
            </div>
          </div>

          {/* Session Controls */}
          <div className="hd-panel">
            <div className="hd-panel-header">Session Controls</div>
            <div className="hd-panel-body hd-controls">
              {error && <p className="hd-error">{error}</p>}

              {phase === PHASES.OPEN && !confirmClose && (
                <button className="hd-btn-danger" onClick={() => setConfirmClose(true)}>
                  Close Submissions
                </button>
              )}

              {phase === PHASES.OPEN && confirmClose && (
                <div className="hd-confirm">
                  <p>Close submissions? Participants won't be able to add more questions.</p>
                  <div className="hd-confirm-actions">
                    <button className="hd-btn-danger" onClick={handleClose}>Yes, Close</button>
                    <button className="hd-btn-secondary" onClick={() => setConfirmClose(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {phase === PHASES.CLOSED && (
                <button
                  className="hd-btn-primary"
                  onClick={handleCluster}
                  disabled={submissionCount === 0}
                  title={submissionCount === 0 ? 'No submissions to cluster' : ''}
                >
                  {submissionCount === 0 ? 'No submissions yet' : 'Start AI Clustering'}
                </button>
              )}

              {phase === PHASES.RESULTS && (
                <button className="hd-btn-end" onClick={handleEnd}>
                  End Session
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main content area ── */}
        <main className="hd-main">
          {phase === PHASES.OPEN && (
            <div className="hd-live-banner">
              <strong>Live Q&A Session</strong>
              <span>Questions are being submitted in real‑time. Close submissions when ready, then trigger AI clustering.</span>
            </div>
          )}

          {phase === PHASES.CLOSED && (
            <div className="hd-live-banner closed">
              <strong>Submissions Closed</strong>
              <span>Click "Start AI Clustering" to group the questions.</span>
            </div>
          )}

          {phase === PHASES.CLUSTERING && <ProcessingIndicator />}

          {phase === PHASES.RESULTS && (
            <>
              <div className="hd-results-header">
                <h2 className="hd-results-title">Clustered Results</h2>
                <p className="hd-results-sub">{clusters.length} clusters from {submissionCount} submissions</p>
              </div>
              {clusters.length === 0 ? (
                <p className="hd-empty">No clusters yet.</p>
              ) : (
                <div className="hd-cluster-list">
                  {clusters.map(c => (
                    <ClusterCard
                      key={c.id}
                      cluster={c}
                      onDelete={handleDeleteCluster}
                      onAnswerSubmit={handleAnswerSubmit}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}