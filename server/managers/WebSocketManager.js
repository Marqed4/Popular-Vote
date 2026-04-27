export class WebSocketManager {
  constructor(io) {
    this.io = io;
  }

  register(sessionManager) {
    this.io.on('connection', (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      socket.on('host:delete_session', async ({ code }) => {
        if (socket.sessionRole !== 'host') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        try {
          await sessionManager.deleteSession(code);
          this.io.to(code).emit('session:deleted');
        } catch (err) {
          socket.emit('error', { message: err.message });
        }
      });

      // participant/host joins a session room
      socket.on('join:room', ({ code, role }) => {
        const session = sessionManager.getSession(code);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        socket.join(code);
        socket.sessionCode = code;
        socket.sessionRole = role;
        console.log(`Socket ${socket.id} joined room ${code} as ${role}`);

        if (role === 'participant') {
          const count = this._participantCount(code);
          session.participantCount = count;
          this.io.to(code).emit('participant:joined', { socketId: socket.id, count });
        }

        // send current state to the joining client
        socket.emit('session:sync', {
          code: session.code,
          phase: session.phase,
          tags: session.tags,
          participantCount: session.participantCount,
          submissionCount: session.submissions.length,
          clusters: session.clusters,
          curators: session.curators,
          contextualFacts: session.contextualFacts
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
          const session = sessionManager.getSession(socket.sessionCode);
          if (session) {
            const count = this._participantCount(socket.sessionCode, socket.id);
            session.participantCount = count;
            this.io.to(socket.sessionCode).emit('participant:left', { count });
          }
        }
      });
    });
  }

  // count only participant sockets in a room, optionally excluding one socket id
  _participantCount(code, excludeSocketId = null) {
    const room = this.io.sockets.adapter.rooms.get(code);
    if (!room) return 0;
    let count = 0;
    for (const socketId of room) {
      if (socketId === excludeSocketId) continue;
      const s = this.io.sockets.sockets.get(socketId);
      if (s && s.sessionRole === 'participant') count++;
    }
    return count;
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