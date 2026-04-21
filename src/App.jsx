import { useState } from 'react'
import Home from './components/Home.jsx'
import './App.css'

export default function App() {
  const [view, setView] = useState(null)

  function handleNavigate(role, code) {
    setView({ role, code })
  }

  if (view) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <button onClick={() => setView(null)} style={{ alignSelf: 'flex-start', margin: '0.75rem 1rem' }}>
          ← Back
        </button>
        <p style={{ padding: '1rem', fontFamily: 'monospace' }}>
          {view.role} view · session <strong>{view.code}</strong>
        </p>
      </div>
    )
  }

  return <Home onNavigate={handleNavigate} />
}