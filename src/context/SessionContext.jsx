import { createContext, useContext, useState, useCallback } from 'react';

const SessionContext = createContext(null);

export const PHASES = {
  OPEN:       'OPEN',
  CLOSED:     'CLOSED',
  CLUSTERING: 'CLUSTERING',
  RESULTS:    'RESULTS',
  ENDED:      'ENDED',
};

export function SessionProvider({ children }) {
  const [sessionCode,      setSessionCode]      = useState(null);
  const [role,             setRole]             = useState(null);   // 'host' | 'participant'
  const [phase,            setPhase]            = useState(null);
  const [clusters,         setClusters]         = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [submissionCount,  setSubmissionCount]  = useState(0);
  const [tags,             setTags]             = useState([]);
  const [mySubmissions,    setMySubmissions]    = useState([]);  // participant's own questions
  const [summary,          setSummary]          = useState(null);

  // Called when host creates a session or participant joins
  const initSession = useCallback((code, userRole, initialState = {}) => {
    setSessionCode(code);
    setRole(userRole);
    setPhase(initialState.phase ?? PHASES.OPEN);
    setClusters(initialState.clusters ?? []);
    setParticipantCount(initialState.participantCount ?? 0);
    setSubmissionCount(initialState.submissionCount ?? 0);
    setTags(initialState.tags ?? []);
    setMySubmissions([]);
    setSummary(null);
  }, []);

  // Called when WebSocket syncs full session state on reconnect
  const syncSession = useCallback((state) => {
    if (state.phase            !== undefined) setPhase(state.phase);
    if (state.clusters         !== undefined) setClusters(state.clusters);
    if (state.participantCount !== undefined) setParticipantCount(state.participantCount);
    if (state.submissionCount  !== undefined) setSubmissionCount(state.submissionCount);
    if (state.tags             !== undefined) setTags(state.tags);
  }, []);

  // Called when participant submits a question successfully
  const addMySubmission = useCallback((submission) => {
    setMySubmissions(prev => [...prev, submission]);
    setSubmissionCount(prev => prev + 1);
  }, []);

  // Called when participant deletes their own question
  const removeMySubmission = useCallback((id) => {
    setMySubmissions(prev => prev.filter(s => s.id !== id));
    setSubmissionCount(prev => Math.max(0, prev - 1));
  }, []);

  // Called when host submits an answer to a cluster
  const updateClusterAnswer = useCallback((clusterId, answer) => {
    setClusters(prev =>
      prev.map(c => c.id === clusterId ? { ...c, answer } : c)
    );
  }, []);

  // Called when host deletes a cluster
  const removeCluster = useCallback((clusterId) => {
    setClusters(prev => prev.filter(c => c.id !== clusterId));
  }, []);

  // Called when a question gets an upvote
  const updateUpvote = useCallback((clusterId, questionIndex, newCount) => {
    setClusters(prev =>
      prev.map(c => {
        if (c.id !== clusterId) return c;
        const questions = [...(c.questions ?? [])];
        if (questions[questionIndex]) {
          questions[questionIndex] = {
            ...questions[questionIndex],
            upvoteCount: newCount,
          };
        }
        return { ...c, questions };
      })
    );
  }, []);

  // Reset everything — called when session ends or user goes back to home
  const clearSession = useCallback(() => {
    setSessionCode(null);
    setRole(null);
    setPhase(null);
    setClusters([]);
    setParticipantCount(0);
    setSubmissionCount(0);
    setTags([]);
    setMySubmissions([]);
    setSummary(null);
  }, []);

  const value = {
    // state
    sessionCode,
    role,
    phase,
    clusters,
    participantCount,
    submissionCount,
    tags,
    mySubmissions,
    summary,

    // actions
    initSession,
    syncSession,
    addMySubmission,
    removeMySubmission,
    updateClusterAnswer,
    removeCluster,
    updateUpvote,
    setPhase,
    setClusters,
    setParticipantCount,
    setSubmissionCount,
    setTags,
    setSummary,
    clearSession,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

// Hook — any component calls useSession() to get the context
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a <SessionProvider>');
  return ctx;
}