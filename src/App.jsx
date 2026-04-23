// import { useState } from 'react'
// import Home from './components/Home.jsx'
// import './App.css'

// export default function App() {
//   const [view, setView] = useState(null)

//   function handleNavigate(role, code) {
//     setView({ role, code })
//   }

//   if (view) {
//     return (
//       <div className="app-view">
//         <button className="app-back-btn" onClick={() => setView(null)}>
//           ← Back
//         </button>
//         <p className="app-view-label">
//           {view.role} view · session <strong>{view.code}</strong>
//         </p>
//       </div>
//     )
//   }

//   return <Home onNavigate={handleNavigate} />
// }

import { useState } from 'react'
import Home from './components/Home.jsx'
import HostDashboard from './components/HostDashboard.jsx'
import { useSession } from './context/SessionContext.jsx'
import './App.css'

export default function App() {
  const [view, setView] = useState(null)
  const { initSession, clearSession } = useSession()

  function handleNavigate(role, code) {
    initSession(code, role)
    setView({ role, code })
  }

  function handleBack() {
    clearSession()
    setView(null)
  }

  if (view?.role === 'host') {
    return <HostDashboard sessionCode={view.code} onBack={handleBack} />
  }

  if (view?.role === 'participant') {
    return (
      <div style={{ padding: '2rem', fontFamily: 'Georgia, serif' }}>
        <button onClick={handleBack}>← Back</button>
        <p style={{ marginTop: '1rem' }}>Participant view coming soon · session <strong>{view.code}</strong></p>
      </div>
    )
  }

  return <Home onNavigate={handleNavigate} />
}