import { useState } from 'react';
import Home from './components/Home.jsx';
import HostView from './components/Host.jsx';
import Participant from './components/Participant.jsx';
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
      <Participant
        code={view.code}
        onBack={() => setView(null)}
      />
    );
  }

  // Home -> 
  return <Home onNavigate={handleNavigate} />;
}
