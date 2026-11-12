import { useState } from 'react'
import type { FormEvent } from 'react'
import { Badge, Drawer, Empty, FilterLocation, Heading } from './components'
import { eventTime, kg, locations, parseQuantity } from './inventory'
import type { Role } from './inventory'
import { countRef, editable, signedKg, variance } from './stocktake'
import type { CountDecision, CountLine, CountSheet } from './stocktake'

export function Stocktaking({ sheets, role, initialLocation, onStart, onOpen }: {
  sheets: CountSheet[]; role: Role; initialLocation: string
  onStart: (location: string, note: string) => string | undefined; onOpen: (id: number) => void
}) {
  const [location, setLocation] = useState(initialLocation)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const rows = [...sheets].reverse().filter(sheet => !location || sheet.location === location)
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const error = onStart(String(values.get('location')), String(values.get('note') ?? ''))
    setError(error ?? '')
    if (!error) setCreating(false)
  }
  return <>
    <Heading title="Stocktaking" subtitle="Count stock by city, compare it with the system balance, and reconcile differences." action={role === 'Store Officer' &&
      <button className="primary" onClick={() => { setError(''); setCreating(true) }}>Start stocktake</button>} />
    <section className="panel">
      <div className="panel-heading"><h2>Stocktakes <span className="count">{rows.length}</span></h2><FilterLocation value={location} onChange={setLocation} locations={locations} /></div>
      {rows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Reference</th><th>City</th><th>Progress</th><th>Status</th><th>Started</th></tr></thead>
        <tbody>{rows.map(sheet => <tr key={sheet.id}>
          <td><button className="text-button" onClick={() => onOpen(sheet.id)}>{countRef(sheet.id)}</button></td>
          <td>{sheet.location}</td><td>{sheet.lines.filter(line => line.observation).length} / {sheet.lines.length} batches counted</td>
          <td><Badge text={sheet.status} /></td><td>{eventTime({ at: sheet.startedAt })}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No stocktakes for this location yet.</Empty>}
    </section>
    {creating && <Drawer title="Start stocktake" onClose={() => setCreating(false)}>
      <p className="drawer-subtitle">This captures the batches physically on hand in one city. Stock movements stay open during counting.</p>
      <form className="entry-form" onSubmit={start}>
        <div className="field-grid">
          <label className="wide">City<select name="location" defaultValue={location || locations[0]}>{locations.map(city => <option key={city}>{city}</option>)}</select></label>
          <label className="wide">Count note (optional)<textarea name="note" rows={3} maxLength={300} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="button-row"><button type="submit" className="primary">Capture snapshot</button>
          <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>
    </Drawer>}
  </>
}

function CountRow({ line, onRecord }: { line: CountLine; onRecord: (lot: string, actual: number) => string | undefined }) {
  const [error, setError] = useState('')
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const raw = String(new FormData(event.currentTarget).get('quantity') ?? '').trim()
    const zero = /^0+(\.0{1,3})?$/.test(raw)
    const quantity = parseQuantity(raw)
    if (!zero && !quantity) { setError('Enter a valid physical weight, including 0 if none is present.'); return }
    setError(onRecord(line.lot, quantity) ?? '')
  }
  return <tr>
    <td><strong>{line.lot}</strong><small>{line.species}</small></td>
    <td>{line.observation ? <>{kg(line.observation.actual)}<small>{eventTime(line.observation)}</small></> : 'Awaiting count'}</td>
    <td><form className="count-entry" onSubmit={save}>
      <input aria-label={'Physical kg for ' + line.lot} name="quantity" inputMode="decimal" required
        defaultValue={line.observation ? line.observation.actual / 1000 : undefined} placeholder="kg" />
      <button className="secondary" type="submit">{line.observation ? 'Recount' : 'Record'}</button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </form></td>
  </tr>
}

const decisionLabels: Record<CountDecision, string> = { approve: 'Approve reconciliation', return: 'Return for recount', reject: 'Reject stocktake' }

export function StocktakeDetail({ sheet, role, workflowHref, onRecord, onSubmit, onReview, onClose }: {
  sheet: CountSheet; role: Role; workflowHref?: string; onRecord: (lot: string, actual: number) => string | undefined
  onSubmit: () => string | undefined; onReview: (decision: CountDecision, note: string) => string | undefined; onClose: () => void
}) {
  const [error, setError] = useState('')
  const [decision, setDecision] = useState<CountDecision>()
  const counting = !workflowHref && role === 'Store Officer' && editable(sheet)
  const canReview = !workflowHref && role === 'Supervisor' && sheet.status === 'Pending review'
  const observed = sheet.lines.filter(line => line.observation).length
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!decision) return
    const error = onReview(decision, String(new FormData(event.currentTarget).get('note') ?? ''))
    setError(error ?? '')
    if (!error) setDecision(undefined)
  }
  return <Drawer wide title={countRef(sheet.id)} onClose={onClose}>
    <p className="drawer-subtitle">{sheet.location} · Snapshot {eventTime({ at: sheet.startedAt })}</p>
    <Badge text={sheet.status} />
    {sheet.note && <p className="hint">{sheet.note}</p>}
    {workflowHref && <div className="button-row count-actions"><a className="secondary button-link" href={workflowHref}>Open in Stocktaking →</a></div>}
    <h3>{counting ? 'Physical count' : 'Count reconciliation'}</h3>
    <p className="hint">{counting ? 'Record each weight at the time you count it. Include available, held and spoiled stock physically present.' :
      'The variance compares the physical count with expected stock at the count time. Approval applies only that variance to current available stock.'}</p>
    <div className="table-scroll count-table"><table>
      {counting ? <>
        <thead><tr><th>Batch / Species</th><th>Recorded count</th><th>Physical quantity (kg)</th></tr></thead>
        <tbody>{sheet.lines.map(line => <CountRow key={line.lot} line={line} onRecord={onRecord} />)}</tbody>
      </> : <>
        <thead><tr><th>Batch / Species</th><th className="num">Opening snapshot</th><th className="num">Movement before count</th><th className="num">Expected at count</th><th className="num">Counted</th><th className="num">Variance</th></tr></thead>
        <tbody>{sheet.lines.map(line => <tr key={line.lot}>
          <td><strong>{line.lot}</strong><small>{line.species}</small></td><td className="num">{kg(line.snapshot)}</td>
          <td className="num">{line.observation ? signedKg(line.observation.expected - line.snapshot) : '—'}</td>
          <td className="num">{line.observation ? kg(line.observation.expected) : '—'}</td>
          <td className="num">{line.observation ? <>{kg(line.observation.actual)}<small>{eventTime(line.observation)}</small></> : '—'}</td>
          <td className="num">{line.observation ? signedKg(variance(line)) : '—'}</td>
        </tr>)}</tbody>
      </>}
    </table></div>
    {counting && <div className="button-row count-actions">
      <button className="primary" disabled={observed !== sheet.lines.length} onClick={() => setError(onSubmit() ?? '')}>Submit stocktake for review</button>
      <span className="hint">{observed} of {sheet.lines.length} counted</span>
    </div>}
    {canReview && !decision && <div className="button-row count-actions">{(['approve', 'return', 'reject'] as const).map(key =>
      <button key={key} className={key === 'approve' ? 'primary' : 'secondary'} onClick={() => { setError(''); setDecision(key) }}>{decisionLabels[key]}</button>)}</div>}
    {canReview && decision && <form className="decision-form" onSubmit={review}>
      <h3>{decisionLabels[decision]}</h3>
      <label>{decision === 'approve' ? 'Note (optional)' : 'Reason'}<textarea name="note" rows={2} required={decision !== 'approve'} maxLength={300} /></label>
      <div className="button-row"><button type="submit" className="primary">Confirm {decision === 'approve' ? 'reconciliation' : 'decision'}</button>
        <button type="button" className="secondary" onClick={() => { setError(''); setDecision(undefined) }}>Cancel</button></div>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {sheet.adjustments?.length ? <p className="hint">Posted adjustments: {sheet.adjustments.join(', ')}</p> : null}
    <h3>Stocktake history</h3>
    <ul className="timeline">{[...sheet.events].reverse().map((event, i) => <li key={i}>
      <div className="timeline-dot" aria-hidden="true" />
      <div><strong>{event.action}</strong><p>{event.role}{event.lot && ' · ' + event.lot}</p>{event.note && <p className="activity-note">{event.note}</p>}</div>
      <time dateTime={event.at}>{eventTime(event)}</time>
    </li>)}</ul>
  </Drawer>
}
