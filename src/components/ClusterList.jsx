import ExpansionPanel from "./ExpansionPanel";
import "./ClusterList.css";

export default function ClusterList({
  phase,
  clusters,
  submissionCount,
  answers,
  editingAnswer,
  expansionPreviews,
  selectedQuestions,
  manualQuestions,
  onDeleteCluster,
  onSetEditingAnswer,
  onAnswerChange,
  onSaveAnswer,
  onToggleQuestion,
  onManualChange,
  onManualSubmit,
}) {
  const hasAnyPreview = Object.keys(expansionPreviews).length > 0;

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
      <div className="hd-waiting">
        <div className="hd-waiting-title">Expanding the session…</div>
        <p className="hd-waiting-sub">New questions are being sent to participants.</p>
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
          const preview = expansionPreviews[cluster.id];
          const selected = selectedQuestions[cluster.id] ?? new Set();

          return (
            <div key={cluster.id} className="hd-cluster">
              <div className="hd-cluster-top">
                {cluster.questions?.length > 0 && (
                  <ul className="hd-questions-list">
                    {cluster.questions.map((q, qi) => (
                      <li key={qi} className="hd-question-item">
                        {q.text}
                        {q.upvoteCount > 0 && (
                          <span className="hd-upvote-count">▲ {q.upvoteCount}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="hd-cluster-left">
                  <span className="hd-cluster-num">{i + 1}</span>
                  <div className="hd-cluster-info">
                    <div className="hd-cluster-query">{cluster.representative_query}</div>
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

              <div className="hd-cluster-answer-area">
                {editingAnswer === cluster.id ? (
                  <>
                    <textarea
                      className="hd-answer-input"
                      placeholder="Write a response to this cluster…"
                      value={answers[cluster.id] ?? ""}
                      onChange={e => onAnswerChange(cluster.id, e.target.value)}
                      rows={3}
                    />
                    <div className="hd-answer-btns">
                      <button className="hd-btn-save" onClick={() => onSaveAnswer(cluster.id)}>Save</button>
                      <button className="hd-btn-ghost" onClick={() => onSetEditingAnswer(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div
                    className={`hd-answer-display ${answers[cluster.id] ? "has-answer" : "no-answer"}`}
                    onClick={() => phase === "RESULTS" && onSetEditingAnswer(cluster.id)}
                  >
                    {answers[cluster.id]
                      ? answers[cluster.id]
                      : phase === "RESULTS" ? "Click to write a response…" : "No response written."}
                  </div>
                )}
              </div>

              {phase === "RESULTS" && hasAnyPreview && (
                <ExpansionPanel
                  cluster={cluster}
                  preview={preview}
                  selected={selected}
                  manualQuestion={manualQuestions[cluster.id]}
                  onToggleQuestion={onToggleQuestion}
                  onManualChange={onManualChange}
                  onManualSubmit={onManualSubmit}
                />
                )}

                {[...(selected)].map(question => (
                <div key={question} className="hd-expansion-answer-area">
                    <div className="hd-expansion-question-label">{question}</div>
                    {editingAnswer === `${cluster.id}::${question}` ? (
                    <>
                        <textarea
                        className="hd-answer-input"
                        placeholder="Write a response to this question…"
                        value={answers[`${cluster.id}::${question}`] ?? ""}
                        onChange={e => onAnswerChange(`${cluster.id}::${question}`, e.target.value)}
                        rows={3}
                        />
                        <div className="hd-answer-btns">
                        <button className="hd-btn-save" onClick={() => onSaveAnswer(`${cluster.id}::${question}`)}>Save</button>
                        <button className="hd-btn-ghost" onClick={() => onSetEditingAnswer(null)}>Cancel</button>
                        </div>
                    </>
                    ) : (
                    <div
                        className={`hd-answer-display ${answers[`${cluster.id}::${question}`] ? 
                        "has-answer" : "no-answer"}`}
                        onClick={() => phase === "RESULTS" && onSetEditingAnswer(`${cluster.id}::${question}`)}
                    >
                        {answers[`${cluster.id}::${question}`] ?? "Click to write a response…"}
                    </div>
                    )}
                </div>
                ))}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}