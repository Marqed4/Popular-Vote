import { useState } from 'react';
import Home from './components/Home.jsx';
import HostView from './components/Host.jsx';
import ParticipantList from "./components/ParticipantList.jsx";
import './App.css';

export default function App() {
  const [view, setView] = useState(null);

  function handleNavigate(role, code) {
    console.log("[handleNavigate]", role, code);
    setView({ role, code });
  }

  if (view?.role === 'host') {
    return (
      <HostView
        code={view.code}
        onBack={() => setView(null)}
      />
    );
  }

  if (view?.role === 'participant') {
    return (
      <div className="app-view">
        <button className="app-back-btn" onClick={() => setView(null)}>← back</button>
        <p className="app-view-label">
          Participant view · session <strong>{view.code}</strong>
        </p>
      </div>
    );
  }

  // Home -> 
  return <Home onNavigate={handleNavigate} />;
}
