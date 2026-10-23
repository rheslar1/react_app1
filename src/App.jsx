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
          <p className="eyebrow">TEST OPERATIONS, IN FOCUS</p>
          <h1>Know the station.<br /><em>Know the state.</em></h1>
          <p className="intro-lede">Explore operator station and supervisor line-console previews. Station, run, and alert data are illustrative—not connected to equipment.</p>
        </div>
        <div className="intro-foot"><span className="signal-dot" /> Clear states · safe decisions · sample data</div>
      </section>
      <section className="auth-panel">
        <div className="mobile-brand"><span className="brand-mark"><span /></span><span>Relay<span className="brand-light">/</span>Ops</span></div>
        <div className="auth-card">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to open the test-floor console preview.' : 'Create an account to explore the console preview.'}</p>
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

const stateByCode = new Map([[0, 'ready'], [1, 'running'], [2, 'pass'], [3, 'fail'], [4, 'error'], [5, 'maintenance'], [6, 'idle']])
const stateLabels = new Map([['ready', 'READY'], ['running', 'RUNNING'], ['pass', 'PASS'], ['fail', 'FAIL'], ['error', 'ERROR'], ['maintenance', 'MAINT.'], ['idle', 'IDLE']])
const stateTitles = new Map([['ready', 'Ready'], ['running', 'Running'], ['pass', 'Pass'], ['fail', 'Fail'], ['error', 'Error'], ['maintenance', 'Maintenance'], ['idle', 'Idle']])
const operatorActionLabels = new Map([
  ['ready', 'Start sample run'],
  ['running', 'Complete sample run'],
  ['pass', 'Load next sample unit'],
  ['fail', 'Acknowledge sample failure'],
  ['error', 'Request sample technician'],
])
const sampleOperators = ['M. Chen', 'A. Patel', 'J. Rivera', 'S. Brooks', 'K. Nguyen']
const sampleDurations = ['02:14', '08:36', '—', '01:52', '—', '—', '—']
const stations = [0, 0, 1, 2, 0, 3, 0, 4, 0, 5, 1, 2, 0, 6, 0, 0, 3, 1, 0, 2, 0, 4, 0, 0, 5, 2, 0, 1, 3, 0, 0, 2, 0, 6, 1, 0, 4, 0, 3, 2, 0, 0, 5, 1, 0, 2, 0, 0, 3, 0].map((stateCode, index) => ({
  id: index + 1,
  state: stateByCode.get(stateCode),
  operator: sampleOperators[index % sampleOperators.length],
  duration: sampleDurations[index % sampleDurations.length],
}))
const initialAlerts = [
  { id: 1, severity: 'critical', title: 'ST-07 · Insulation resistance below limit', time: '2 min ago', acknowledged: false },
  { id: 2, severity: 'warning', title: 'ST-18 · Calibration due in 3 days', time: '18 min ago', acknowledged: false },
  { id: 3, severity: 'info', title: 'ST-42 · Fixture check required', time: '41 min ago', acknowledged: true },
]

function StateTag({ state }) {
  return <span className={`state-tag state-${state}`}>{stateLabels.get(state) || state}</span>
}

function DemoStatus({ health, error, refreshing, onRefresh }) {
  const apiHealthy = health?.api === 'healthy'
  const databaseHealthy = health?.database === 'healthy'
  const healthText = health ? (apiHealthy && databaseHealthy ? 'Healthy' : 'Attention needed') : error ? 'Unknown' : 'Checking'
  return (
    <details className="api-health">
      <summary><span className={`health-lamp ${health ? apiHealthy && databaseHealthy ? 'health-ok' : 'health-warn' : 'health-unknown'}`} /><span>API health · {healthText}</span></summary>
      <div className="health-popover">
        <p><span>Application API</span><strong>{health ? apiHealthy ? 'Healthy' : 'Unavailable' : error ? 'Unknown' : 'Checking'}</strong></p>
        <p><span>MySQL database</span><strong>{health ? databaseHealthy ? 'Healthy' : 'Unavailable' : error ? 'Unknown' : 'Checking'}</strong></p>
        {error && <p className="health-error" role="alert">{error}</p>}
        <button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Checking…' : 'Refresh API health'}</button>
      </div>
    </details>
  )
}

function OperatorPreview() {
  const [state, setState] = useState('ready')
  const [called, setCalled] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [sampleSerial, setSampleSerial] = useState('ATS-240618-0081')
  const stepState = state === 'running' ? 'active' : state === 'pass' || state === 'fail' ? 'complete' : ''
  const actionLabel = state === 'fail' && reviewed ? 'Sample failure reviewed' : operatorActionLabels.get(state)

  function runDemoAction() {
    if (state === 'ready') setState('running')
    else if (state === 'running') setState('pass')
    else if (state === 'pass') {
      setState('ready')
      setSampleSerial((previous) => `${previous.slice(0, -4)}${String(Number(previous.slice(-4)) + 1).padStart(4, '0')}`)
    }
    else if (state === 'fail') setReviewed(true)
    else setCalled(true)
  }

  return (
    <section className={`operator-console op-${state}`} aria-label="Operator console preview">
      <header className="station-heading">
        <div><p className="console-kicker">OPERATOR STATION <span>·</span> SAMPLE CONSOLE</p><h2>ST-04 <span>Voltage &amp; continuity</span></h2><p>Family A7-240 · Shift A · {sampleSerial}</p></div>
        <div className="operator-header-actions"><label className="sample-state-picker">Preview sample state<select aria-label="Preview sample state" value={state} onChange={(event) => { setState(event.target.value); setCalled(false); setReviewed(false) }}><option value="ready">Ready</option><option value="running">Running</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="error">Error / refused</option></select></label><div className="operator-person"><span className="person-initial">MC</span><span><strong>M. Chen</strong><small>Sample operator</small></span></div></div>
      </header>
      <div className="operator-state-row">
        <div className={`operator-state-display state-${state}`} aria-live="polite">
          <div className="state-symbol" aria-hidden="true">{state === 'ready' ? '✓' : state === 'running' ? '↻' : state === 'pass' ? '✓' : state === 'fail' ? '!' : '×'}</div>
          <div><p>{state === 'ready' ? 'STATION READY' : state === 'running' ? 'TEST IN PROGRESS' : state === 'pass' ? 'TEST PASSED' : state === 'fail' ? 'TEST FAILED' : 'STATION ERROR · REFUSED'}</p><h3>{state === 'ready' ? 'Ready for unit' : state === 'running' ? 'Running test sequence' : state === 'pass' ? 'All limits passed' : state === 'fail' ? 'Result outside limit' : 'Safety interlock open'}</h3><span>{state === 'ready' ? 'Checks complete. Load the unit and scan its traveler.' : state === 'running' ? 'Station agent is evaluating the active procedure.' : state === 'pass' ? 'Sample unit meets configured acceptance criteria.' : state === 'fail' ? 'Insulation resistance measured 18.2 MΩ; minimum is 20.0 MΩ.' : 'Fixture guard signal was not confirmed. Run is blocked.'}</span></div>
          <span className="state-code">DEMO · {state.toUpperCase()}</span>
        </div>
        <aside className="checks-panel">
          <p className="panel-label">PRE-RUN CHECKS <span>4 / 4</span></p>
          <ul>
            <li><i>✓</i> Self-test <small>Passed · 08:41</small></li>
            <li><i>✓</i> Calibration <small>Valid to Nov 12</small></li>
            <li><i>✓</i> Fixture <small>FX-04 detected</small></li>
            <li><i>✓</i> Interlocks <small>Closed · verified</small></li>
          </ul>
        </aside>
      </div>
      <div className="operator-work-grid">
        <section className="procedure-panel">
          <div className="panel-title-row"><div><p className="panel-label">ACTIVE PROCEDURE</p><h3>Continuity &amp; insulation · Rev 3.2</h3></div><span className="demo-chip">SAMPLE</span></div>
          <div className="unit-guidance"><strong>{state === 'ready' ? 'Load the unit' : state === 'running' ? 'Keep clear of the fixture' : state === 'pass' ? 'Remove the unit' : state === 'fail' ? 'Hold the unit for review' : 'Do not retry or bypass'}</strong><span>{state === 'ready' ? 'Place one unit in fixture FX-04, close the guard, then scan the traveler to confirm its serial before starting.' : state === 'running' ? 'Test sequence is sample-only. The station agent controls test decisions and interlocks.' : state === 'pass' ? 'Remove the unit and place it in the pass rack.' : state === 'fail' ? 'Keep the unit in the fixture and use the designated hold rack.' : 'Refusal belongs to the station agent. A supervisor cannot override it.'}</span></div>
          <div className="progress-caption"><span>RUN PROGRESS</span><strong>{state === 'running' ? 'Step 2 of 3' : state === 'pass' || state === 'fail' ? '3 of 3 steps' : '0 of 3 steps'}</strong></div>
          <div className="progress-track"><span style={{ width: state === 'running' ? '42%' : state === 'pass' || state === 'fail' ? '100%' : '0%' }} /></div>
          <ol className="test-steps">
            <li className="complete"><span>01</span><strong>Continuity check</strong><small>0.18 Ω</small></li>
            <li className={stepState}><span>02</span><strong>Insulation resistance</strong><small>{state === 'running' ? 'Sampling…' : state === 'fail' ? '18.2 MΩ · FAIL' : state === 'pass' ? '42.6 MΩ · PASS' : '—'}</small></li>
            <li><span>03</span><strong>Dielectric withstand</strong><small>—</small></li>
          </ol>
        </section>
        <aside className="result-panel">
          <p className="panel-label">RESULT &amp; DISPOSITION</p>
          <div className="result-value"><strong>{state === 'pass' ? 'PASS' : state === 'fail' ? 'FAIL' : state === 'error' ? 'REFUSED' : '—'}</strong><span>{state === 'pass' ? 'Pass rack · R-02' : state === 'fail' ? 'Hold rack · H-01' : state === 'error' ? 'No run started · interlock refusal' : 'Awaiting sample result'}</span></div>
          <div className="result-metric"><span>Measured</span><strong>{state === 'fail' ? '18.2 MΩ' : state === 'pass' ? '42.6 MΩ' : '—'}</strong></div>
          <div className="result-metric"><span>Acceptance</span><strong>≥ 20.0 MΩ</strong></div>
          <button className="call-tech-button" type="button" onClick={() => setCalled((value) => !value)} aria-pressed={called}>{called ? '✓ Sample call placed' : '＋ Call technician'}</button>
          <small className="local-note">Preview only · no real alert is sent.</small>
        </aside>
      </div>
      <div className="operator-actions">
        <div className="agent-authority"><span>i</span><p><strong>Station agent owns this decision.</strong> Test limits and safety interlocks are controlled by the station agent, not this preview.</p></div>
        <button type="button" className={`primary-action action-${state}`} onClick={runDemoAction}>{actionLabel} <span aria-hidden="true">→</span></button>
      </div>
      <p className="demo-footnote">Sample data only. This screen is not connected to equipment, test results, or station permissions.</p>
    </section>
  )
}

function handleStationGridKeyDown(event, setSelectedId) {
  const key = event.key
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return
  event.preventDefault()

  const grid = event.currentTarget.parentElement
  const columns = Number.parseInt(window.getComputedStyle(grid).getPropertyValue('--station-columns'), 10) || 10
  const currentIndex = Number(event.currentTarget.dataset.index)
  const column = currentIndex % columns
  let nextIndex

  if (key === 'ArrowLeft') nextIndex = column === 0 ? currentIndex + columns - 1 : currentIndex - 1
  else if (key === 'ArrowRight') nextIndex = column === columns - 1 ? currentIndex - columns + 1 : currentIndex + 1
  else if (key === 'ArrowUp') {
    nextIndex = currentIndex - columns
    if (nextIndex < 0) nextIndex = Math.min(Math.floor((stations.length - 1) / columns) * columns + column, stations.length - 1)
  } else {
    nextIndex = currentIndex + columns
    if (nextIndex >= stations.length) nextIndex = column
  }

  const nextStation = Array.from(grid.children).find((child) => Number(child.dataset.index) === nextIndex)
  if (nextStation) {
    setSelectedId(nextIndex + 1)
    nextStation.focus()
  }
}

function SupervisorPreview() {
  const [selectedId, setSelectedId] = useState(7)
  const [alerts, setAlerts] = useState(initialAlerts)
  const [assigned, setAssigned] = useState({})
  const [notes, setNotes] = useState({})
  const [oosRequested, setOosRequested] = useState(() => new Map())
  const selected = stations.find((station) => station.id === selectedId)
  const counts = stations.reduce((result, station) => {
    result[station.state] = (result[station.state] || 0) + 1
    return result
  }, {})
  function acknowledge(alertId) {
    setAlerts((current) => current.map((alert) => alert.id === alertId ? { ...alert, acknowledged: !alert.acknowledged } : alert))
  }

  return (
    <section className="supervisor-console" aria-label="Supervisor line overview preview">
      <div className="line-heading">
        <div><p className="console-kicker">LINE OVERVIEW <span>·</span> SAMPLE DATA</p><h2>Final test <span>·</span> Line 02</h2><p>Shift A · 06:00–14:00 · Supervisor: L. Morgan</p></div>
        <div className="line-context"><span><i className="health-lamp health-ok" />Shift active</span><span>Snapshot · 09:42:18</span></div>
      </div>
      <div className="kpi-strip" aria-label="Sample line summary">
        <div className="kpi kpi-running"><span>RUNNING</span><strong>{counts.running || 0}<small> / 50</small></strong></div>
        <div className="kpi kpi-ready"><span>READY</span><strong>{counts.ready || 0}<small> stations</small></strong></div>
        <div className="kpi kpi-alert"><span>NEEDS ATTENTION</span><strong>{(counts.fail || 0) + (counts.error || 0)}<small> stations</small></strong></div>
        <div className="kpi kpi-yield"><span>SHIFT FIRST-PASS</span><strong>96.8<small>%</small></strong><em>DEMO METRIC</em></div>
      </div>
      <div className="supervisor-columns">
        <div className="line-map-column">
          <section className="line-map-panel">
            <div className="panel-title-row"><div><p className="panel-label">STATION MAP</p><h3>Line 02 <span>·</span> 50 stations</h3></div><span className="demo-chip">SAMPLE SNAPSHOT</span></div>
            <div className="map-legend"><span><i className="legend-dot legend-ready" />Ready</span><span><i className="legend-dot legend-running" />Running</span><span><i className="legend-dot legend-pass" />Pass</span><span><i className="legend-dot legend-fail" />Fail / error</span><span><i className="legend-dot legend-maint" />Maintenance</span></div>
            <div className="station-grid" role="group" aria-label="50 sample stations. Use arrow keys to move between stations.">
              {stations.map((station, index) => <button type="button" key={station.id} data-index={index} tabIndex={selectedId === station.id ? 0 : -1} className={`station-tile tile-${station.state} ${selectedId === station.id ? 'selected' : ''}`} onClick={() => setSelectedId(station.id)} onKeyDown={(event) => handleStationGridKeyDown(event, setSelectedId)} aria-pressed={selectedId === station.id} aria-label={`Sample station ${String(station.id).padStart(2, '0')}, ${stateTitles.get(station.state)}, ${station.duration === '—' ? 'no run duration' : `run time ${station.duration}`}, operator ${station.operator}`}>
                <strong>{String(station.id).padStart(2, '0')}</strong><span>{stateLabels.get(station.state)}</span><small>{station.duration} · {station.operator.split(' ').map((part) => part[0]).join('')}</small>
              </button>)}
            </div>
            <div className="map-note"><span>Selected station: ST-{String(selectedId).padStart(2, '0')}</span><span>Tile values are simulated, not live.</span></div>
          </section>
          <section className="read-boundary"><strong>Read-only boundary</strong><span>Supervisor preview cannot start or stop runs, change limits or procedures, release stations, or override a refusal.</span></section>
          <section className="detail-panel">
            <div className="panel-title-row"><div><p className="panel-label">SELECTED STATION · SAMPLE</p><h3>ST-{String(selectedId).padStart(2, '0')} <span>·</span> Voltage &amp; continuity</h3></div><StateTag state={selected.state} /></div>
            <div className="detail-layout">
              <div className="mini-console"><div className="mini-console-head"><span>OPERATOR CONSOLE MIRROR</span><span className="demo-chip">READ ONLY</span></div><div className={`mini-state state-${selected.state}`}><strong>{stateTitles.get(selected.state).toUpperCase()}</strong><span>{selected.state === 'ready' ? 'Checks complete · awaiting unit' : selected.state === 'running' ? 'Sample sequence in progress' : selected.state === 'fail' ? 'Result outside sample limit' : selected.state === 'error' ? 'Sample interlock refusal' : selected.state === 'pass' ? 'Sample result passed' : selected.state === 'maintenance' ? 'Service window active' : 'No active sample run'}</span></div><p>Operator <strong>{selected.operator}</strong><span>Run time <strong>{selected.duration}</strong></span></p></div>
              <div className="station-facts"><p><span>Station health</span><strong>{selected.state === 'error' ? 'Attention' : selected.state === 'maintenance' ? 'Maintenance' : 'Sample healthy'}</strong></p><p><span>Last calibration</span><strong>Oct 12, 2026</strong></p><p><span>Calibration due</span><strong>{selected.id === 18 ? 'Oct 26, 2026' : 'Nov 12, 2026'}</strong></p><p><span>Last results</span><strong>PASS · PASS · {selected.state === 'fail' ? 'FAIL' : 'PASS'}</strong></p></div>
            </div>
            <p className="local-note">Health, results, operators, durations, and dates are all example values.</p>
          </section>
        </div>
        <aside className="line-side-column">
          <section className="side-work-panel alerts-panel">
            <div className="panel-title-row"><div><p className="panel-label">ACTIVE ALERTS</p><h3>Shift attention <span className="count-badge">{alerts.filter((alert) => !alert.acknowledged).length}</span></h3></div><span className="demo-chip">DEMO</span></div>
            <ul className="alert-list">{alerts.map((alert) => <li key={alert.id} className={`alert-item severity-${alert.severity} ${alert.acknowledged ? 'is-acknowledged' : ''}`}><span className="alert-mark">{alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '△' : 'i'}</span><div className="alert-body"><strong>{alert.title}</strong><small>{alert.time} · {alert.acknowledged ? 'Acknowledged locally' : 'Unacknowledged sample alert'}</small><label>Assign locally<select aria-label={`Assign ${alert.title}`} value={assigned[alert.id] || ''} onChange={(event) => setAssigned((current) => ({ ...current, [alert.id]: event.target.value }))}><option value="">Unassigned</option><option value="R. Diaz">R. Diaz</option><option value="T. Okafor">T. Okafor</option><option value="L. Morgan">L. Morgan</option></select></label><textarea aria-label={`Local note for ${alert.title}`} placeholder="Add a local preview note…" value={notes[alert.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [alert.id]: event.target.value }))} /></div><button className="ack-button" type="button" onClick={() => acknowledge(alert.id)} aria-pressed={alert.acknowledged}>{alert.acknowledged ? 'Undo' : 'Ack'}</button></li>)}</ul>
            <p className="local-note">Acknowledgements, assignment, and notes stay in this browser preview only.</p>
          </section>
          <section className="side-work-panel tech-panel">
            <div className="panel-title-row"><div><p className="panel-label">TECHNICIAN AVAILABILITY</p><h3>On shift <span className="count-badge">3</span></h3></div><span className="demo-chip">SAMPLE</span></div>
            <ul className="tech-list"><li><span className="tech-avatar">RD</span><strong>R. Diaz<small>Electrical · Zone A</small></strong><i className="tech-available">Available</i></li><li><span className="tech-avatar">TO</span><strong>T. Okafor<small>Fixture · Zone B</small></strong><i className="tech-busy">On call</i></li><li><span className="tech-avatar">JC</span><strong>J. Cole<small>Calibration · Zone C</small></strong><i className="tech-available">Available</i></li></ul>
          </section>
          <section className="side-work-panel failures-panel">
            <div className="panel-title-row"><div><p className="panel-label">TOP FAILURES · SHIFT</p><h3>By test step</h3></div><span className="demo-chip">SAMPLE</span></div>
            <ol><li><span>Insulation resistance</span><strong>4 <small>events</small></strong><i style={{ width: '78%' }} /></li><li><span>Continuity</span><strong>2 <small>events</small></strong><i style={{ width: '46%' }} /></li><li><span>Dielectric withstand</span><strong>1 <small>event</small></strong><i style={{ width: '24%' }} /></li></ol>
            <button className="oos-button" type="button" aria-pressed={Boolean(oosRequested.get(selectedId))} onClick={() => setOosRequested((current) => { const next = new Map(current); next.set(selectedId, !current.get(selectedId)); return next })}>{oosRequested.get(selectedId) ? '✓ Sample request noted' : 'Request out-of-service review'}</button>
            <p className="local-note">Local preview only · does not change station availability.</p>
          </section>
        </aside>
      </div>
    </section>
  )
}

function Dashboard({ user, onLogout, onSessionExpired }) {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [mode, setMode] = useState('operator')

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

  return (
    <div className="ops-shell">
      <header className="ops-topbar">
        <a className="ops-brand" href="#console" aria-label="Relay Ops test floor"><span className="ops-brand-mark">R</span><span>RELAY<span>/</span>OPS</span></a>
        <div className="ops-context"><span className="context-led" />TEST FLOOR <i>/</i> FINAL ASSEMBLY</div>
        <div className="ops-account"><DemoStatus health={health} error={error} refreshing={refreshing} onRefresh={loadHealth} /><span className="ops-user">{user.email}</span><button type="button" className="ops-signout" onClick={handleLogout} aria-label="Sign out"><Icon name="logout" /></button></div>
      </header>
      <main className="ops-main" id="console">
        <div className="console-intro">
          <div><p className="console-overline">RELAY/OPS · ENGINEERING TEST SYSTEM</p><h1>Station consoles</h1><p>Sample operator and supervisor consoles based on an automated test floor.</p></div>
          <div className="demo-banner"><span>DEMO ENVIRONMENT</span><strong>Sample data · no equipment connection</strong></div>
        </div>
        {logoutError && <div className="ops-error" role="alert">{logoutError}<button type="button" onClick={handleLogout}>Retry sign out</button></div>}
        {error && <div className="ops-error" role="alert">API health check failed: {error} <button type="button" onClick={loadHealth}>Retry</button></div>}
        <section className="mode-switch" aria-label="Console preview modes">
          <div><span>PREVIEW MODE</span><small>Switching views does not grant a role or permission.</small></div>
          <div className="mode-buttons" role="tablist" aria-label="Operator and supervisor preview">
            <button type="button" role="tab" aria-selected={mode === 'operator'} className={mode === 'operator' ? 'active' : ''} onClick={() => setMode('operator')}>Operator <span>Station console</span></button>
            <button type="button" role="tab" aria-selected={mode === 'supervisor'} className={mode === 'supervisor' ? 'active' : ''} onClick={() => setMode('supervisor')}>Supervisor <span>Line overview</span></button>
          </div>
        </section>
        {mode === 'operator' ? <OperatorPreview /> : <SupervisorPreview />}
        <footer className="ops-footer"><span>Relay/Ops <i>·</i> Test floor preview</span><span>All station and line data shown here is illustrative, not live or authorized.</span></footer>
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
