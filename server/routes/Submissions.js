import express from 'express';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Please wait a moment.' }
});

router.post('/sessions/:code/submit', submitLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const session = sessionManager.getSession(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'OPEN') return res.status(400).json({ error: 'Submission window is closed' });
    if (!content || content.trim() === '') return res.status(400).json({ error: 'Question is required' });
    if (content.length > 500) return res.status(400).json({ error: 'Question exceeds 500 character limit' });

    const submission = await sessionManager.addSubmission(req.params.code, content.trim());
    const io = req.app.locals.io;
    io.to(req.params.code).emit('submission:count', {
      count: session.submissions.length
    });

    res.json({ id: submission.id, content: submission.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit question' });
  }
});

router.delete('/sessions/:code/submit/:id', async (req, res) => {
  try {
    const { code, id } = req.params;
    const sessionManager = req.app.locals.sessionManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    await sessionManager.deleteSubmission(code, id);
    const io = req.app.locals.io;
    io.to(code).emit('submission:count', { count: session.submissions.length });

    res.json({ message: 'Submission deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// participant answers a specific submission
router.post('/sessions/:code/submit/:id/answer', submitLimiter, async (req, res) => {
  try {
    const { code, id } = req.params;
    const { answer } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!answer || answer.trim() === '') return res.status(400).json({ error: 'Answer is required' });
    if (answer.length > 500) return res.status(400).json({ error: 'Answer exceeds 500 character limit' });

    const submission = await sessionManager.answerSubmission(code, id, answer.trim());

    // broadcast the answered submission to all clients
    wsManager.toSession(code, 'submission:answered', { submissionId: id, answer: answer.trim() });

    res.json({ id: submission.id, answer: submission.participant_answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

export default router;