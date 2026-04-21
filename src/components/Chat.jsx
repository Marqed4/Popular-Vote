import { useState, useRef, useEffect } from 'react';

export default function Chat({ sessionContext = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: { sessionContext } })
      });

      const data = await res.json();
      const reply = data.reply || data.error || 'Something went wrong.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.role === 'user' ? 'var(--color-background-info)' : 'var(--color-background-secondary)',
            color: m.role === 'user' ? 'var(--color-text-info)' : 'var(--color-text-primary)',
            padding: '8px 12px',
            borderRadius: 'var(--border-radius-lg)',
            maxWidth: '75%',
            fontSize: '14px',
            lineHeight: 1.5
          }}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--color-text-secondary)', fontSize: '13px', padding: '4px 12px' }}>
            thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '0.75rem 1rem', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask something..."
          rows={1}
          style={{ flex: 1, resize: 'none', fontSize: '14px', padding: '8px 12px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)' }}
        />
        <button onClick={send} disabled={!input.trim() || loading}>
          Send
        </button>
      </div>
    </div>
  );
}