import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home/Home'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Future screens — built in upcoming sessions */}
        <Route path="/host" element={<div>Host Dashboard — Coming Soon</div>} />
        <Route path="/join/:code" element={<div>Session — Coming Soon</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
