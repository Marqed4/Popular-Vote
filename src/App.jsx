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
      <div className="app-view">
        <button className="app-back-btn" onClick={() => setView(null)}>
          ← Back
        </button>
        <p className="app-view-label">
          {view.role} view · session <strong>{view.code}</strong>
        </p>
      </div>
    )
  }

  return <Home onNavigate={handleNavigate} />
}