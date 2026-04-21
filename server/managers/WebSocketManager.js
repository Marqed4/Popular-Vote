export class WebSocketManager {
  constructor(io) {
    this.io = io;
  }

  register(sessionManager) {
    this.io.on('connection', (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      // participant/host joins a session room
      socket.on('join:room', ({ code }) => {
        const session = sessionManager.getSession(code);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        socket.join(code);
        socket.sessionCode = code;
        console.log(`Socket ${socket.id} joined room ${code}`);

        // send current state to the joining client
        socket.emit('session:sync', {
          code: session.code,
          phase: session.phase,
          tags: session.tags,
          participantCount: session.participantCount,
          submissionCount: session.submissions.length,
          clusters: session.clusters
        });
      });

      // participant/host leaves a session room
      socket.on('leave:room', ({ code }) => {
        socket.leave(code);
        console.log(`Socket ${socket.id} left room ${code}`);
      });

      // handle disconnection
      socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        if (socket.sessionCode) {
          const count = sessionManager.decrementParticipants(socket.sessionCode);
          this.io.to(socket.sessionCode).emit('participant:left', { count });
        }
      });
    });
  }

  // broadcast to everyone in a session room
  toSession(code, event, data) {
    this.io.to(code).emit(event, data);
  }

  // broadcast to everyone except the sender
  toSessionExcept(socketId, code, event, data) {
    this.io.to(code).except(socketId).emit(event, data);
  }
}