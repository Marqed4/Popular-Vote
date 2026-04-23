import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:2167';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectSocket(sessionCode, role, sessionCallbacks) {
  const s = getSocket();

  // Clean up any existing listeners before re-registering
  s.removeAllListeners();

  const {
    onSync,
    onPhaseChange,
    onClusters,
    onClusterDeleted,
    onClusterAnswered,
    onSubmissionCount,
    onParticipantJoined,
    onParticipantLeft,
    onSessionEnded,
    onError,
  } = sessionCallbacks;

  // Connection events
  s.on('connect', () => {
    console.log('Socket connected:', s.id);
    s.emit('join:room', { code: sessionCode, role });
  });

  s.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  s.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    onError?.('Connection error. Trying to reconnect...');
  });

  // Server → client events
  // Full state sync on join or reconnect
  s.on('session:sync', (state) => {
    console.log('session:sync', state);
    onSync?.(state);
  });

  // Phase transitions
  s.on('session:closed', () => {
    console.log('session:closed');
    onPhaseChange?.('CLOSED');
  });

  s.on('session:clustering', () => {
    console.log('session:clustering');
    onPhaseChange?.('CLUSTERING');
  });

  s.on('session:results', ({ clusters }) => {
    console.log('session:results', clusters);
    onClusters?.(clusters);
    onPhaseChange?.('RESULTS');
  });

  s.on('session:ended', ({ summary }) => {
    console.log('session:ended');
    onSessionEnded?.(summary);
    onPhaseChange?.('ENDED');
  });

  // Cluster updates
  s.on('cluster:deleted', ({ clusterId }) => {
    console.log('cluster:deleted', clusterId);
    onClusterDeleted?.(clusterId);
  });

  s.on('cluster:answered', ({ clusterId, answer }) => {
    console.log('cluster:answered', clusterId, answer);
    onClusterAnswered?.(clusterId, answer);
  });

  // Participant and submission counts
  s.on('participant:joined', ({ participantCount }) => {
    onParticipantJoined?.(participantCount);
  });

  s.on('participant:left', ({ participantCount }) => {
    onParticipantLeft?.(participantCount);
  });

  s.on('submission:count', ({ count }) => {
    onSubmissionCount?.(count);
  });

  // Connect
  if (!s.connected) {
    s.connect();
  } else {
    // Already connected, just join the room
    s.emit('join:room', { code: sessionCode, role });
  }

  return s;
}

export function disconnectSocket(sessionCode) {
  const s = getSocket();
  if (sessionCode) {
    s.emit('leave:room', { code: sessionCode });
  }
  s.removeAllListeners();
  s.disconnect();
  socket = null;
}