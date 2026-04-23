import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../socket/SocketClient';
import { useSession } from '../context/SessionContext';

export function useSocketSession(sessionCode, role) {
  const {
    syncSession,
    setPhase,
    setClusters,
    setParticipantCount,
    setSubmissionCount,
    removeCluster,
    updateClusterAnswer,
    setSummary,
  } = useSession();

  useEffect(() => {
    if (!sessionCode || !role) return;

    connectSocket(sessionCode, role, {
      onSync: (state) => {
        syncSession(state);
      },

      onPhaseChange: (phase) => {
        setPhase(phase);
      },

      onClusters: (clusters) => {
        setClusters(clusters);
      },

      onClusterDeleted: (clusterId) => {
        removeCluster(clusterId);
      },

      onClusterAnswered: (clusterId, answer) => {
        updateClusterAnswer(clusterId, answer);
      },

      onSubmissionCount: (count) => {
        setSubmissionCount(count);
      },

      onParticipantJoined: (count) => {
        setParticipantCount(count);
      },

      onParticipantLeft: (count) => {
        setParticipantCount(count);
      },

      onSessionEnded: (summary) => {
        setSummary(summary);
      },

      onError: (msg) => {
        console.error('Socket error:', msg);
      },
    });

    // Cleanup on unmount or session change
    return () => {
      disconnectSocket(sessionCode);
    };
  }, [sessionCode, role]);
}