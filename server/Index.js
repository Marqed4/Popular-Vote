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

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, 'database/.env') });

// console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
// console.log('SUPABASE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY);

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

// serve frontend in production
app.use(express.static(join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// backend port
const PORT = process.env.PORT || 2167;
 
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});