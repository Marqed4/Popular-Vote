import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class ClusteringController {

  async cluster(submissions, tags = []) {
    if (!submissions || submissions.length === 0) {
      throw new Error('No submissions to cluster');
    }

    // treat multi-question submissions as separate questions
    const questions = submissions.map((s, i) => `${i + 1}. ${s.content}`).join('\n');
    const tagContext = tags.length ? `The session topic is: ${tags.join(', ')}.` : '';

    const prompt = `You are helping organize anonymous questions submitted during a group session.
${tagContext}

Here are all the submitted questions:
${questions}

Your task:
- Group semantically similar questions together into clusters
- For each cluster, write a single clear representative query that captures the theme
- Count approximately how many submissions contributed to each cluster
- List the original questions that belong to each cluster
- If a submission contains multiple questions, treat each as a separate question
- Aim for 3-7 clusters depending on how many questions there are

Respond ONLY with a valid JSON array, no markdown, no explanation, just the array:
[
  {
    "representativeQuery": "clear question representing this cluster",
    "submissionCount": 3,
    "questions": ["original question 1", "original question 2", "original question 3"]
  }
]`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const raw = response.text.trim();

      // strip markdown code because gemini returns a json
      const cleaned = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

      const clusters = JSON.parse(cleaned);

      if (!Array.isArray(clusters)) {
        throw new Error('Gemini did not return anything');
      }

      return clusters;

    } catch (err) {
      console.error('ClusteringEngine error:', err);
      throw new Error('Clustering failed — ' + err.message);
    }
  }

  async regenerateRepresentativeQuery(cluster) {
    const questions = cluster.questions.join('\n');

    const prompt = `Given these questions from a group session:
${questions}

Write a single clear representative query that captures the main theme of these questions.
Respond with ONLY the query string, nothing else.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      return response.text.trim();

    } catch (err) {
      console.error('regenerateRepresentativeQuery error:', err);
      throw new Error('Failed to regenerate query — ' + err.message);
    }
  }
}