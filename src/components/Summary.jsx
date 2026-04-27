import "./Summary.css";

export default function SummaryView({ clusters, answers, tags, submissionCount }) {
  return (
    <div className="sv-root">
      <div className="sv-header">
        <div className="sv-title">Session Summary</div>
        {tags?.length > 0 && (
          <div className="sv-tags">
            {tags.map(t => (
              <span key={t} className="sv-tag">{t}</span>
            ))}
          </div>
        )}
        <div className="sv-meta">
          {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} · {submissionCount} total submission{submissionCount !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="sv-clusters">
        {clusters.map((cluster, i) => {
          // sort participant questions by upvotes, show TOPp 5
          const topQuestions = [...(cluster.questions ?? [])]
            .sort((a, b) => (b.upvoteCount ?? 0) - (a.upvoteCount ?? 0))
            .slice(0, 5);

          return (
            <div key={cluster.id} className="sv-cluster">
              <div className="sv-cluster-header">
                <span className="sv-cluster-num">{i + 1}</span>
                <div className="sv-cluster-info">
                  <div className="sv-cluster-query">{cluster.representative_query}</div>
                  <div className="sv-cluster-meta">
                    {cluster.submission_count} submission{cluster.submission_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {answers[cluster.id] && (
                <div className="sv-answer">
                  <div className="sv-answer-label">Host response</div>
                  <div className="sv-answer-text">{answers[cluster.id]}</div>
                </div>
              )}

              {cluster.selected_questions?.length > 0 && (
                <div className="sv-expansion-questions">
                  <div className="sv-questions-label">AI recommended questions</div>
                  <ul className="sv-questions-list">
                    {cluster.selected_questions.map((q, qi) => (
                      <li key={qi} className="sv-question-item">
                        <span className="sv-question-text">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {topQuestions.length > 0 && (
                <div className="sv-questions">
                  <div className="sv-questions-label">Top questions</div>
                  <ul className="sv-questions-list">
                    {topQuestions.map((q, qi) => (
                      <li key={qi} className="sv-question-item">
                        <span className="sv-question-text">{q.text}</span>
                        {q.upvoteCount > 0 && (
                          <span className="sv-upvote">▲ {q.upvoteCount}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cluster.participant_answers?.length > 0 && (
                <div className="sv-participant-answers">
                  <div className="sv-questions-label">Participant answers</div>
                  <ul className="sv-questions-list">
                    {cluster.participant_answers.map((a, ai) => (
                      <li key={ai} className="sv-question-item">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}