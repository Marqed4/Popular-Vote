import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Home.module.css'

const CODE_REGEX = /^[A-Za-z0-9]{6}$/

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function handleCodeChange(e) {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode(value)
    if (error) setError('')
  }

  function handleJoin(e) {
    e.preventDefault()
    if (!CODE_REGEX.test(code)) {
      setError('Enter the 6-character code your host shared.')
      return
    }
    navigate(`/join/${code}`)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoMark}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="#6366f1" />
            <path
              d="M9 10h14M9 16h10M9 22h12"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className={styles.appName}>Popular Vote</h1>
        <p className={styles.tagline}>
          Every voice heard. Every question organized.
        </p>
      </header>

      <main className={styles.cards}>
        {/* Host card */}
        <div className={styles.card}>
          <div className={styles.cardIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Host a Session</h2>
          <p className={styles.cardDescription}>
            Create a session for your group. Share the code, collect anonymous questions, and let AI organize them.
          </p>
          <button
            className={styles.primaryButton}
            onClick={() => navigate('/host')}
          >
            Create Session
          </button>
        </div>

        <div className={styles.divider} aria-hidden="true">
          <span>or</span>
        </div>

        {/* Participant card */}
        <div className={styles.card}>
          <div className={styles.cardIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Join a Session</h2>
          <p className={styles.cardDescription}>
            Got a session code? Enter it below to join and submit your questions anonymously.
          </p>
          <form onSubmit={handleJoin} className={styles.joinForm} noValidate>
            <div className={styles.inputRow}>
              <input
                className={`${styles.codeInput} ${error ? styles.codeInputError : ''}`}
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder="ABC123"
                aria-label="Session code"
                autoComplete="off"
                spellCheck="false"
              />
              <button type="submit" className={styles.joinButton}>
                Join
              </button>
            </div>
            {error && (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            )}
          </form>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>Questions are anonymous and deleted when the session ends.</p>
      </footer>
    </div>
  )
}
