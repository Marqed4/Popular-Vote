import Summary from "./Summary";
import "./ClusterList.css";
import React from "react";

function ExpandableQuestions({ questions }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!questions?.length) return null;
  return (
    <div className="hd-cluster-questions">
      <button className="hd-cluster-toggle" onClick={() => setExpanded(e => !e)}>
        {expanded
          ? `Hide ${questions.length} question${questions.length !== 1 ? 's' : ''} ▲`
          : `Show ${questions.length} question${questions.length !== 1 ? 's' : ''} ▼`}
      </button>
      {expanded && (
        <ul className="hd-questions-list">
          {questions.map((q, qi) => {
            const qText = typeof q === 'string' ? q : (q.text ?? '');
            const qVotes = typeof q === 'string' ? 0 : (q.upvoteCount ?? 0);
            return (
              <li key={qi} className="hd-question-item">
                <span className="hd-question-text">{qText}</span>
                {qVotes > 0 && <span className="hd-question-upvotes">▲ {qVotes}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ClusterList({
  phase,
  clusters,
  submissionCount,
  answers,
  editingAnswer,
  onDeleteCluster,
  onSetEditingAnswer,
  onAnswerChange,
  onSaveAnswer,
}) {
  
  // Check if the session has ended. Display Summary if it has.
  if (phase === "ENDED" && clusters.length > 0) {
    return (
      <Summary
        clusters={clusters}
        answers={answers}
        tags={[]}
        submissionCount={submissionCount}
      />
    );
  }

  if (phase === "OPEN" || phase === "CLOSED") {
    return (
      <div className="hd-waiting">
        <div className="hd-waiting-title">
          {phase === "OPEN" ? "Waiting for submissions…" : "Ready to cluster."}
        </div>
        <p className="hd-waiting-sub">
          {phase === "OPEN"
            ? `Share the code with your audience. Close submissions when ready.`
            : `${submissionCount} submission${submissionCount !== 1 ? "s" : ""} received. Trigger clustering to group them.`
          }
        </p>
      </div>
    );
  }

  if (phase === "CLUSTERING") {
    return (
      <div className="hd-waiting">
        <div className="hd-waiting-title">Analysing submissions…</div>
        <p className="hd-waiting-sub">This may take a few seconds.</p>
      </div>
    );
  }

  if (phase === "EXPANDING") {
    return (
      <div className="hd-clusters">
        <div className="hd-round2-banner">
          <div className="hd-round2-title">Round 2 is open</div>
          <p className="hd-round2-sub">Participants can now submit follow-up questions. Close submissions when ready, then cluster.</p>
        </div>
        {clusters.length > 0 && (
          <>
            <div className="hd-clusters-header">
              <span className="hd-clusters-title">Round 1 results</span>
            </div>
            {clusters.map((cluster, i) => (
              <div key={cluster.id} className="hd-cluster hd-cluster--readonly">
                <div className="hd-cluster-top">
                  <span className="hd-cluster-num">{i + 1}</span>
                  <div className="hd-cluster-info">
                    <div className="hd-cluster-query">{cluster.representative_query}</div>
                    <div className="hd-cluster-count">{cluster.submission_count} submission{cluster.submission_count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  if ((phase === "RESULTS" || phase === "ENDED") && clusters.length > 0) {
    return (
      <div className="hd-clusters">
        <div className="hd-clusters-header">
          <span className="hd-clusters-title">
            {clusters.length} cluster{clusters.length !== 1 ? "s" : ""}
          </span>
          <span className="hd-clusters-sub">
            {submissionCount} total submissions
          </span>
        </div>

        {clusters.map((cluster, i) => {
          return (
            <div key={cluster.id} className="hd-cluster">
              <div className="hd-cluster-top">
                <div className="hd-cluster-left">
                  <span className="hd-cluster-num">{i + 1}</span>
                  <div className="hd-cluster-info">
                    <div className="hd-cluster-query">
                      <span className="hd-cluster-num">Q{i + 1}.</span> {cluster.representative_query}
                    </div>
                    <div className="hd-cluster-count">
                      {cluster.submission_count} submission{cluster.submission_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                {phase === "RESULTS" && (
                  <button
                    className="hd-cluster-delete"
                    onClick={() => onDeleteCluster(cluster.id)}
                    title="Delete cluster"
                  >×</button>
                )}
              </div>

              <ExpandableQuestions questions={cluster.questions} />

              <div className="hd-cluster-answer-area">
                  {answers[cluster.id] && (
                    <div className="hd-answer-display has-answer">
                      {answers[cluster.id]}
                    </div>
                  )}

                {phase === "RESULTS" && (
                  <>
                    {editingAnswer === cluster.id ? (
                      <>
                        <textarea
                          className="hd-answer-input"
                          placeholder="Add a follow-up response…"
                          value={answers[cluster.id + "::followup"] ?? ""}
                          onChange={e => onAnswerChange(cluster.id + "::followup", e.target.value)}
                          rows={3}
                        />
                        <div className="hd-answer-btns">
                          <button className="hd-btn-save" onClick={() => onSaveAnswer(cluster.id + "::followup")}>Save</button>
                          <button className="hd-btn-cancel" onClick={() => onSetEditingAnswer(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <button
                        className="hd-btn-followup"
                        onClick={() => onSetEditingAnswer(cluster.id)}
                      >
                        {answers[cluster.id] ? "+ Add follow-up response" : "Click to write a response…"}
                      </button>
                    )}
                  </>
                )}

              {answers[cluster.id + "::followup"] && editingAnswer !== cluster.id && (
                <div className="hd-answer-display has-answer hd-answer-followup">
                  <span className="hd-answer-label">A{i + 1}b.</span> {answers[cluster.id + "::followup"]}
                </div>
              )}
              </div>

            </div>
          );
        })}
      </div>
    );
  }

  return null;
}