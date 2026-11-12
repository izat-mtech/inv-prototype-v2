import { useState } from 'react'
import { Badge, Empty, FilterLocation, Heading } from './components'
import { eventDate, eventTime, kg, labels, locations, reference } from './inventory'
import { countRef } from './stocktake'
import type { Role } from './inventory'
import type { RecordTarget, AuditEntry, Workspace } from './workspace'

type ReviewRow = {
  target: RecordTarget; ref: string; location: string; destination?: string; description: string; status: string; at: string; type: string
}

export function Approvals({ workspace, role, initialLocation, onOpen }: {
  workspace: Workspace; role: Role; initialLocation: string; onOpen: (target: RecordTarget) => void
}) {
  const [location, setLocation] = useState(initialLocation)
  const [kind, setKind] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const reviews: ReviewRow[] = [
    ...workspace.data.map(t => ({
      target: { type: 'transaction' as const, id: t.id }, ref: reference(t), location: t.location, destination: t.destination,
      description: t.lot + ' · ' + kg(t.quantity), status: t.status, at: t.events.at(-1)!.at, type: labels[t.kind],
    })),
    ...workspace.sheets.filter(sheet => sheet.status !== 'Counting').map(sheet => ({
      target: { type: 'count' as const, id: sheet.id }, ref: countRef(sheet.id), location: sheet.location,
      description: sheet.lines.length + ' batches', status: sheet.status, at: sheet.events.at(-1)!.at, type: 'Stocktake',
    })),
  ]
  const pending = reviews.filter(row => row.status === 'Pending review').length
  const rows = reviews.filter(row => (reviewed ? row.status !== 'Pending review' : row.status === 'Pending review') &&
    (!location || [row.location, row.destination].includes(location)) && (!kind || row.type === kind))
    .sort((a, b) => b.at.localeCompare(a.at))
  return <>
    <Heading title="Approvals" subtitle={role === 'Supervisor' ? 'Review pending transactions, adjustments and stocktakes in one queue.' :
      'Track submitted records. Switch to Supervisor to make a review decision.'} />
    <div className="segment">
      <button aria-pressed={!reviewed} onClick={() => setReviewed(false)}>Pending review <span className="count">{pending}</span></button>
      <button aria-pressed={reviewed} onClick={() => setReviewed(true)}>Reviewed</button>
    </div>
    <section className="panel">
      <div className="panel-heading toolbar"><h2>{reviewed ? 'Reviewed records' : 'Review queue'}</h2><div className="filters">
        <label className="compact-field">Record type<select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">All types</option>{[...Object.values(labels), 'Stocktake'].map(type => <option key={type}>{type}</option>)}</select></label>
        <FilterLocation value={location} onChange={setLocation} locations={locations} />
      </div></div>
      {rows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Reference</th><th>Type / Details</th><th>City</th><th>Status</th><th>Last activity</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.ref}>
          <td><button className="text-button" onClick={() => onOpen(row.target)}>{row.ref}</button></td>
          <td>{row.type}<small>{row.description}</small></td><td>{row.location}{row.destination && ' → ' + row.destination}</td>
          <td><Badge text={row.status} /></td><td>{eventTime(row)}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No records match the review filters.</Empty>}
    </section>
  </>
}

export function AuditTrail({ entries, initialLocation, onOpen }: {
  entries: AuditEntry[]; initialLocation: string; onOpen: (target: RecordTarget) => void
}) {
  const [location, setLocation] = useState(initialLocation)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')
  const [query, setQuery] = useState('')
  const rows = entries.filter(row => (!location || [row.location, row.destination].includes(location)) &&
    (!category || row.category === category) && (!date || eventDate(row) === date) &&
    [row.ref, row.lot, row.action, row.note, row.role].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    <Heading title="Audit Trail" subtitle="Trace transaction events, stocktake decisions and demo user activity." />
    <section className="panel">
      <div className="panel-heading toolbar"><h2>Activity log <span className="count">{rows.length}</span></h2><div className="filters">
        <label className="compact-field">Search audit<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Reference or action" /></label>
        <label className="compact-field">Category<select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option><option>Transaction</option><option>Stocktake</option><option>User activity</option></select></label>
        <label className="compact-field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <FilterLocation value={location} onChange={setLocation} locations={locations} />
      </div></div>
      {rows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Time</th><th>Reference / Batch</th><th>City</th><th>Action</th><th>Profile</th><th>Note</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}>
          <td>{eventTime(row)}</td><td>{row.target ? <button className="text-button" onClick={() => onOpen(row.target!)}>{row.ref}</button> : '—'}
            {row.lot && <small>{row.lot}</small>}</td>
          <td>{row.location || '—'}{row.destination && ' → ' + row.destination}</td>
          <td>{row.action}<small>{row.category}</small></td><td>{row.role}</td><td>{row.note || '—'}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No activity matches the filters.</Empty>}
    </section>
  </>
}
