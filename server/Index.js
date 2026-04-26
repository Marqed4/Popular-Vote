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
import expandRouter from './routes/Expand.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(express.json());

// make sessionManager and wsManager available to all route handlers
const sessionManager = new SessionManager();
/*
Google: hydration generally refers to the process of filling a "dry" 
or empty structure with data or behavior to make it functional.
*/
// hydrate in background — don't block server startup
sessionManager.hydrate().catch(err => console.error('[startup] hydration failed:', err));

const wsManager = new WebSocketManager(io);
wsManager.register(sessionManager);

app.locals.sessionManager = sessionManager;
app.locals.wsManager = wsManager;
app.locals.io = io;

// routes
app.use('/api', chatRouter);
app.use('/api', expandRouter);
app.use('/api', sessionsRouter);
app.use('/api', submissionsRouter);

// backend port
const PORT = process.env.PORT || 2167;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});