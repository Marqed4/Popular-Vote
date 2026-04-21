import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { SessionStore } from './database/SessionStore.js';
import { SessionManager } from './managers/SessionManager.js';
import { WebSocketManager } from './managers/WebSocketManager.js';
import chatRouter from './routes/Chat.js';
import sessionsRouter from './routes/Sessions.js';
import submissionsRouter from './routes/Submissions.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(express.json());

// make sessionManager and wsManager available to all route handlers
const sessionManager = new SessionManager();
const wsManager = new WebSocketManager(io);
wsManager.register(sessionManager);
app.locals.sessionManager = sessionManager;
app.locals.wsManager = wsManager;
app.locals.io = io;

// routes
app.use('/api', chatRouter);
app.use('/api', sessionsRouter);
app.use('/api', submissionsRouter);

// recovery via Supabase for resilience
async function recoverSessions() {
  const sessions = await SessionStore.getUnclosedSessions();
  for (const s of sessions) {
    const submissions = await SessionStore.getSubmissions(s.code);
    const clusters = await SessionStore.getClusters(s.code);
    sessionManager.restoreSession(s.code, s.phase, s.tags, submissions, clusters);
  }
  console.log(`Recovered ${sessions.length} active session(s) from Supabase`);
}

const PORT = process.env.PORT || 2167;

httpServer.listen(PORT, async () => {
  await recoverSessions();
  console.log(`Server running on port ${PORT}`);
});