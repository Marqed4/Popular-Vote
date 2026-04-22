import express from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE' });

router.post('/chat', async (req, res) => {
  const { messages, sessionCode, sessionManager } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const session = req.app.locals.sessionManager?.getSession(sessionCode);
    const systemPrompt = buildClusterNarrative(session);

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { systemInstruction: systemPrompt }
    });

    res.json({ reply: response.text });

  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Chat unavailable. Try again.' });
  }
});

function buildClusterNarrative(session) {
  if (!session?.clusters?.length) {
    return `You are a helpful assistant for a Q&A session. No clusters have been generated yet.
            Encourage the user to submit questions and wait for the host to trigger clustering.`;
  }

  const tags = session.tags?.length
    ? `The session topic is: ${session.tags.join(', ')}.`
    : '';

  const clusterSummary = session.clusters.map((cluster, i) => {
    const originals = cluster.questions?.length
      ? `Original questions include: ${cluster.questions.slice(0, 5).join(' | ')}`
      : '';
    return `Theme ${i + 1}: "${cluster.representativeQuery}" — raised by approximately ${cluster.submissionCount} participants. ${originals}`;
  }).join('\n');

  return `You are a conversational assistant helping to explore the key themes that emerged from a group Q&A session.
${tags}

Here are the clustered themes from participant submissions:
${clusterSummary}

Your job:
- Help the user understand using group/topic context
- Draw connections between themes where relevant
- If asked about a specific theme, expand on what participants were likely trying to understand
- Suggest which themes and delve for clarity, what might be most important to address first based on submission counts?
- Keep responses concise and grounded in the actual clusters above, ask to rebase when things are convoluted
- Do not invent themes or questions without reviewing context, that's the most important constraint.`;
}

export default router;