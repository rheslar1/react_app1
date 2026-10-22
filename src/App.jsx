import { useCallback, useEffect, useState } from 'react'
import './App.css'

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return body
}

function Icon({ name }) {
  let path
  if (name === 'grid') path = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
  else if (name === 'pulse') path = <path d="M3 12h4l3-8 4 16 3-8h4" />
  else if (name === 'arrow') path = <path d="M7 17 17 7M7 7h10v10" />
  else if (name === 'logout') path = <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>
  else path = <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
}

function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 8 || password.length > 72) {
      setError('Use a password between 8 and 72 characters.')
      return
    }
    setPending(true)
    try {
      const result = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) })
      onAuthenticated(result.user)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setPending(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-label="Product introduction">
        <div className="brand"><span className="brand-mark"><span /></span><span>Relay<span className="brand-light">/</span>Ops</span></div>
        <div className="intro-copy">
          <p className="eyebrow">OPERATIONS, IN FOCUS</p>
          <h1>Know what’s<br />running. <em>Know it’s real.</em></h1>
          <p className="intro-lede">A clear view of your deployment, the services behind it, and the signals that tell you they’re healthy.</p>
        </div>
        <div className="intro-foot"><span className="live-dot" /> A calmer way to stay on top of production</div>
      </section>
      <section className="auth-panel">
        <div className="mobile-brand"><span className="brand-mark"><span /></span><span>Relay<span className="brand-light">/</span>Ops</span></div>
        <div className="auth-card">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to check in on your deployment.' : 'Get your operations workspace started.'}</p>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => changeMode('login')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'selected' : ''} onClick={() => changeMode('register')}>Create account</button>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
            <div className="password-label"><label htmlFor="password">Password</label>{mode === 'register' && <span>At least 8 characters</span>}</div>
            <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••••" minLength={8} maxLength={72} required />
            {error && <p className="form-message error" role="alert">{error}</p>}
            {notice && <p className="form-message" role="status">{notice}</p>}
            <button className="submit-button" type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in to Relay' : 'Create account'}<span aria-hidden="true">→</span></button>
          </form>
          <p className="security-note"><span aria-hidden="true">⌑</span> Your session is protected with an httpOnly cookie.</p>
        </div>
        <footer className="auth-footer">Built for a clearer signal <span>·</span> Relay/ Ops</footer>
      </section>
    </main>
  )
}

function StatusPill({ healthy, label, unknown = false }) {
  return <span className={`status-pill ${unknown ? 'unknown' : healthy ? 'healthy' : 'unavailable'}`}><i />{label}</span>
}

function Dashboard({ user, onLogout, onSessionExpired }) {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
    } catch {
      setLogoutError('Could not end your session. Please try signing out again.')
    }
  }

  const loadHealth = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      setHealth(await request('/health'))
    } catch (loadError) {
      if (loadError.status === 401) onSessionExpired()
      else {
        setHealth(null)
        setError(loadError.message)
      }
    } finally {
      setRefreshing(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    const timer = window.setTimeout(loadHealth, 0)
    const interval = window.setInterval(loadHealth, 30_000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [loadHealth])

  const databaseHealthy = health?.database === 'healthy'
  const apiHealthy = health?.api === 'healthy'
  const overall = apiHealthy && databaseHealthy
  const metadata = health?.deployment || {}

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Relay Ops home"><span className="brand-mark"><span /></span><span>Relay<span className="brand-light">/</span>Ops</span></a>
        <p className="side-label">WORKSPACE</p>
        <a className="nav-item active" href="#overview"><Icon name="grid" />Overview</a>
        <div className="sidebar-bottom"><div className="side-status"><span className={health ? 'live-dot' : error ? 'signal-dot signal-down' : 'signal-dot'} />{health ? 'Monitoring connected' : error ? 'Health signal unavailable' : 'Connecting to monitoring'}</div><p>DEPLOYMENT CONSOLE <span>v1.0</span></p></div>
      </aside>
      <main className="dashboard-main" id="overview">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div><div className="account-menu"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span><span className="account-email">{user.email}</span><button className="logout-button" onClick={handleLogout} aria-label="Sign out"><Icon name="logout" /></button></div></header>
        <div className="content-wrap">
          <div className="welcome-row"><div><p className="eyebrow">DEPLOYMENT OVERVIEW</p><h1>Good to see you, <span>{user.email.split('@')[0]}</span></h1><p className="page-subtitle">Here’s the latest signal from your application.</p></div><button className="refresh-button" onClick={loadHealth} disabled={refreshing}><span className={refreshing ? 'spin' : ''}>↻</span> Refresh status</button></div>
          {logoutError && <div className="dashboard-error" role="alert">{logoutError}<button onClick={handleLogout}>Retry</button></div>}
          {error && <div className="dashboard-error" role="alert">{error} <button onClick={loadHealth}>Retry</button></div>}
          <section className={`deployment-banner ${health ? (overall ? 'is-healthy' : 'is-warning') : error ? 'is-warning' : 'is-loading'}`} aria-label="Deployment health">
            <div className="banner-orbit"><span /><span /><span /><div className="orbit-core"><Icon name="pulse" /></div></div>
            <div className="banner-copy"><p className="eyebrow">CURRENT DEPLOYMENT</p><h2>{health ? overall ? 'All systems operational' : 'Attention needed' : error ? 'Status check failed' : 'Checking your deployment'}</h2><p>{health ? overall ? 'The API and database are responding normally.' : 'One or more services are unavailable. Check service status below.' : error ? 'The latest check failed. Current service health is unknown.' : 'Connecting to live service health…'}</p></div>
            <StatusPill healthy={Boolean(overall)} unknown={!health} label={health ? overall ? 'Operational' : 'Degraded' : error ? 'Unknown' : 'Checking'} />
          </section>
          <section className="section-heading"><div><p className="eyebrow">LIVE SIGNALS</p><h2>Service health</h2></div><span className="updated-label">{health?.checkedAt ? `Checked ${new Date(health.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : error ? 'Status check failed' : 'Awaiting first check'}</span></section>
          <div className="service-grid">
            <article className="service-card"><div className="service-title"><span className="service-icon"><Icon name="pulse" /></span><span className="service-name">Application API</span><StatusPill healthy={apiHealthy} unknown={!health} label={health ? apiHealthy ? 'Healthy' : 'Unavailable' : error ? 'Unknown' : 'Checking'} /></div><p className="service-detail">Authenticated API and application services</p><div className="service-meta"><span>Service</span><code>relay-api</code></div></article>
            <article className="service-card"><div className="service-title"><span className="service-icon"><Icon name="database" /></span><span className="service-name">MySQL database</span><StatusPill healthy={databaseHealthy} unknown={!health} label={health ? databaseHealthy ? 'Healthy' : 'Unavailable' : error ? 'Unknown' : 'Checking'} /></div><p className="service-detail">Primary persistence and session store</p><div className="service-meta"><span>Service</span><code>mysql</code></div></article>
          </div>
          <section className="section-heading release-heading"><div><p className="eyebrow">RUNTIME CONTEXT</p><h2>Release details</h2></div></section>
          <section className="release-card"><div className="release-top"><div className="release-badge"><Icon name="arrow" /></div><div><p className="eyebrow">APPLICATION VERSION</p><strong>{metadata.version || 'Not configured'}</strong></div><span className="release-env">{metadata.environment || 'Environment not configured'}</span></div><div className="release-facts"><div><span>Revision</span><code>{metadata.revision || '—'}</code></div><div><span>Image digest</span><code className="digest">{metadata.imageDigest || 'Not available'}</code></div><div><span>Environment</span><code>{metadata.environment || 'Not configured'}</code></div></div><p className="metadata-note">{health ? metadata.configured ? 'Deployment metadata is supplied by the running API.' : 'Release metadata is not configured. Set APP_VERSION, APP_REVISION, APP_IMAGE_DIGEST, and APP_ENVIRONMENT on the API to display it.' : 'Deployment metadata will appear when the API is reachable.'}</p></section>
          <footer className="dashboard-footer"><span>Relay/ Ops</span><span>Runtime health only · no estimated metrics</span></footer>
        </div>
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [restoreError, setRestoreError] = useState('')

  const restoreSession = useCallback(async () => {
    setRestoring(true)
    setRestoreError('')
    try {
      const { user: currentUser } = await request('/auth/me')
      setUser(currentUser)
    } catch (error) {
      setUser(null)
      if (error.status !== 401) setRestoreError(error.message)
    } finally {
      setRestoring(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await request('/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const expireSession = useCallback(() => setUser(null), [])

  useEffect(() => {
    const timer = window.setTimeout(restoreSession, 0)
    return () => window.clearTimeout(timer)
  }, [restoreSession])

  if (restoring) return <main className="boot-screen"><span className="brand-mark"><span /></span><p>Checking your session…</p></main>
  if (restoreError) return <main className="boot-screen"><span className="brand-mark"><span /></span><p role="alert">{restoreError}</p><button className="refresh-button" onClick={restoreSession}>Retry connection</button></main>
  return user ? <Dashboard user={user} onLogout={logout} onSessionExpired={expireSession} /> : <AuthView onAuthenticated={setUser} />
}

export default App
