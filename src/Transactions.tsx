import { useState } from 'react'
import type { FormEvent } from 'react'
import { Badge, Drawer, Empty, FilterLocation, Heading, Timeline } from './components'
import { calendarDate, commands, inventory, kg, labels, locations, parseQuantity, reference, species } from './inventory'
import type { Command, Entry, Kind, Role, Transaction } from './inventory'

const copy: Record<Kind, { title: string; subtitle: string; button: string; party?: string }> = {
  receive: { title: 'Stock Receive', subtitle: 'Record incoming fish, review receipts and post accepted batches.', button: 'New receipt', party: 'Supplier or source' },
  issue: { title: 'Stock Issue', subtitle: 'Record who receives the stock and confirm the physical handover.', button: 'New issue', party: 'Recipient' },
  transfer: { title: 'Stock Transfer', subtitle: 'Move stock between locations, reconcile deliveries and record adjustments.', button: 'New transfer' },
  adjust: { title: 'Stock Transfer', subtitle: 'Move stock between locations, reconcile deliveries and record adjustments.', button: 'New adjustment' },
  spoil: { title: 'Spoilage', subtitle: 'Hold suspect batches, confirm spoilage and document disposal.', button: 'Report spoilage' },
  dispose: { title: 'Spoilage', subtitle: 'Hold suspect batches, confirm spoilage and document disposal.', button: 'Request disposal' },
}

export function EntryForm({ kind, data, record, defaultLocation, onSave, onCancel }: {
  kind: Kind; data: Transaction[]; record?: Transaction; defaultLocation?: string; onSave: (entry: Entry, correction?: string) => string | undefined; onCancel: () => void
}) {
  const [site, setSite] = useState(record?.location ?? (defaultLocation || locations[0]))
  const [selectedLot, setSelectedLot] = useState(record?.lot ?? '')
  const [error, setError] = useState('')
  const fixedHold = record?.kind === 'spoil'
  const rows = inventory(data).filter(row => row.location === site && (row.lot === record?.lot ||
    (kind === 'dispose' ? row.spoiled > 0 : kind === 'adjust' || row.available > 0)))
  const lot = rows.some(p => p.lot === selectedLot) ? selectedLot : rows[0]?.lot ?? ''
  const selected = rows.find(row => row.lot === lot)
  const isReceive = kind === 'receive'
  const read = (form: FormData, field: string) => String(form.get(field) ?? '').trim()
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const entry: Entry = {
      kind, location: site, lot, species: read(form, 'species'), date: read(form, 'date'),
      quantity: fixedHold ? record.quantity : parseQuantity(read(form, 'quantity')), destination: read(form, 'destination'),
      party: read(form, 'party'), reason: read(form, 'reason'), notes: read(form, 'notes'),
      condition: read(form, 'condition'), documentRef: read(form, 'documentRef'),
      direction: read(form, 'direction') === 'increase' ? 'increase' : 'decrease',
    }
    setError(onSave(entry, read(form, 'correction')) ?? '')
  }
  return <form className="entry-form" onSubmit={save}>
    <div className="field-grid">
      <label>{kind === 'transfer' ? 'Source location' : 'Storage location'}
        <select value={site} disabled={fixedHold} onChange={e => { setSite(e.target.value); setSelectedLot('') }}>
          {locations.map(location => <option key={location}>{location}</option>)}
        </select>
      </label>
      {isReceive ? <label>Fish species<select name="species" defaultValue={record?.species ?? species[0]}>
        {species.map(fish => <option key={fish}>{fish}</option>)}</select></label> :
        <label>Batch<select value={lot} required disabled={fixedHold} onChange={e => setSelectedLot(e.target.value)}>
          {!rows.length && <option value="">No eligible batch</option>}
          {rows.map(row => <option key={row.lot} value={row.lot}>{row.lot} · {row.species}</option>)}
        </select></label>}
      {kind === 'transfer' && <label>Destination<select name="destination" key={site}
        defaultValue={record?.destination !== site ? record?.destination : undefined} required>
        {locations.filter(location => location !== site).map(location => <option key={location}>{location}</option>)}
      </select></label>}
      {kind === 'adjust' && <label>Adjustment type<select name="direction" defaultValue={record?.direction ?? 'decrease'}>
        <option value="decrease">Decrease available stock</option><option value="increase">Increase available stock</option>
      </select></label>}
      <label>Quantity (kg)<input name="quantity" inputMode="decimal" required disabled={fixedHold}
        defaultValue={record ? record.quantity / 1000 : undefined} placeholder="e.g. 25" /></label>
      <label>Transaction date<input type="date" name="date" required max={calendarDate()} defaultValue={record?.date ?? calendarDate()} /></label>
      {copy[kind].party && <label className="wide">{copy[kind].party}<input name="party" maxLength={100} required defaultValue={record?.party} /></label>}
      {isReceive && <>
        <label>Condition<select name="condition" defaultValue={record?.condition || 'Good'}><option>Good</option><option>Chilled</option><option>Frozen</option></select></label>
        <label>Delivery reference <span>(optional)</span><input name="documentRef" maxLength={80} defaultValue={record?.documentRef} /></label>
      </>}
      {!isReceive && <label className="wide">{kind === 'issue' ? 'Purpose of issue' : kind === 'spoil' ? 'Spoilage cause' : 'Reason'}
        <input name="reason" maxLength={140} required defaultValue={record?.reason} /></label>}
      <label className="wide">Notes <span>(optional)</span><textarea name="notes" rows={3} maxLength={500} defaultValue={record?.notes} /></label>
      {record && <label className="wide">Correction note<textarea name="correction" rows={2} required maxLength={300} /></label>}
    </div>
    {selected && <p className="hint">{kg(kind === 'dispose' ? selected.spoiled : selected.available)} {kind === 'dispose' ? 'spoiled' : 'available'} at {site}.</p>}
    {kind === 'spoil' && !record && <p className="hint">Submitting places this quantity on hold immediately while the Supervisor reviews the incident.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row"><button className="primary" type="submit" disabled={!isReceive && !lot}>{record ? 'Resubmit for review' : 'Submit for review'}</button>
      <button className="secondary" type="button" onClick={onCancel}>Cancel</button></div>
  </form>
}

export function TransactionPage({ initialKind, initialLocation, data, role, onOpen, onCreate }: {
  initialKind: Kind; initialLocation: string; data: Transaction[]; role: Role; onOpen: (t: Transaction) => void; onCreate: (entry: Entry) => string | undefined
}) {
  const [kind, setKind] = useState(initialKind)
  const [filter, setFilter] = useState('all')
  const [site, setSite] = useState(initialLocation)
  const [newRecord, setNewRecord] = useState(false)
  const group = initialKind === 'transfer' ? ['transfer', 'adjust'] as const : initialKind === 'spoil' ? ['spoil', 'dispose'] as const : null
  const records = data.filter(t => t.kind === kind)
  const pending = records.filter(t => t.status === 'Pending review').length
  const filtered = records.filter(t => (!site || [t.location, t.destination].includes(site)) &&
    (filter === 'all' || (filter === 'pending' ? t.status === 'Pending review' : !['Completed', 'Rejected', 'Released'].includes(t.status)))).reverse()

  return <>
    <Heading title={copy[kind].title} subtitle={copy[kind].subtitle} action={role === 'Store Officer' &&
      <button className="primary" type="button" onClick={() => setNewRecord(true)}>{copy[kind].button}</button>} />
    {group && <div className="segment" aria-label="Transaction type">{group.map(key =>
      <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key); setFilter('all') }}>
        {{ transfer: 'Transfers', adjust: 'Adjustments', spoil: 'Spoilage incidents', dispose: 'Disposals' }[key]}
        {data.some(t => t.kind === key && t.status === 'Pending review') && <span className="dot" aria-label="Pending review" />}
      </button>)}</div>}
    <section className="panel">
      <div className="panel-heading toolbar"><div className="filters record-filters">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All records</button>
        <button aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Pending review <span className="count">{pending}</span></button>
        <button aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open</button></div>
        <FilterLocation value={site} onChange={setSite} locations={locations} /></div>
      {filtered.length ? <div className="table-scroll"><table>
        <thead><tr><th>Reference</th><th>Batch / Species</th><th>Location</th><th className="num">Quantity</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{filtered.map(t => <tr key={t.id}>
          <td><button className="text-button" onClick={() => onOpen(t)}>{reference(t)}</button></td>
          <td>{t.lot}<small>{t.species}</small></td><td>{t.location}{t.destination && ' → ' + t.destination}</td>
          <td className="num">{t.kind === 'adjust' && (t.direction === 'increase' ? '+' : '−')}{kg(t.quantity)}</td>
          <td><Badge text={t.status} /></td><td>{t.date}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No records match this view.</Empty>}
    </section>
    {newRecord && <Drawer title={copy[kind].button} onClose={() => setNewRecord(false)}><EntryForm kind={kind} data={data} defaultLocation={site}
      onSave={entry => { const error = onCreate(entry); if (!error) setNewRecord(false); return error }}
      onCancel={() => setNewRecord(false)} /></Drawer>}
  </>
}

const actionLabels: Record<Command, string> = {
  approve: 'Approve', return: 'Return for correction', reject: 'Reject',
  handover: 'Confirm handover', dispatch: 'Confirm dispatch', receive: 'Receive at destination',
  'confirm disposal': 'Confirm physical disposal', 'close shortage': 'Resolve as shortage', 'release hold': 'Release hold',
}

export function TransactionDetail({ t, data, role, workflowHref, onClose, onCommand, onRevise }: {
  t: Transaction; data: Transaction[]; role: Role; workflowHref?: string; onClose: () => void
  onCommand: (id: number, command: Command, note: string, quantity: number) => string | undefined
  onRevise: (id: number, entry: Entry, note: string) => string | undefined
}) {
  const [command, setCommand] = useState<Command>()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const options = workflowHref ? [] : commands(t, role)
  const active = command && options.includes(command) ? command : undefined
  const hasQuantity = active === 'receive' || active === 'confirm disposal'
  const reasonRequired = active === 'return' || active === 'reject' || active === 'close shortage' || active === 'release hold'
  const remaining = t.quantity - t.processed
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active) return
    const form = new FormData(event.currentTarget)
    const error = onCommand(t.id, active, String(form.get('note') ?? ''), parseQuantity(String(form.get('quantity') ?? '')))
    setError(error ?? '')
    if (!error) setCommand(undefined)
  }
  return <Drawer title={reference(t)} onClose={onClose}>
    <p className="drawer-subtitle">{labels[t.kind]} · {t.lot} · {t.species}</p>
    <Badge text={t.status} />
    <dl className="details-grid">
      <div><dt>Quantity</dt><dd>{t.kind === 'adjust' && (t.direction === 'increase' ? '+' : '−')}{kg(t.quantity)}</dd></div>
      <div><dt>Location</dt><dd>{t.location}{t.destination && ' → ' + t.destination}</dd></div>
      <div><dt>Transaction date</dt><dd>{t.date}</dd></div>
      {t.party && <div><dt>{copy[t.kind].party}</dt><dd>{t.party}</dd></div>}
      {t.condition && <div><dt>Condition</dt><dd>{t.condition}</dd></div>}
      {t.documentRef && <div><dt>Delivery reference</dt><dd>{t.documentRef}</dd></div>}
      {t.reason && <div className="wide"><dt>Reason</dt><dd>{t.reason}</dd></div>}
      {t.notes && <div className="wide"><dt>Notes</dt><dd>{t.notes}</dd></div>}
      {t.kind === 'transfer' && t.status !== 'Pending review' && t.status !== 'Returned' && t.status !== 'Rejected' &&
        <div><dt>Received at destination</dt><dd>{kg(t.processed)}</dd></div>}
      {t.kind === 'transfer' && (t.status === 'In transit' || t.status === 'Partially received') &&
        <div><dt>Still in transit</dt><dd>{kg(remaining)}</dd></div>}
      {t.kind === 'dispose' && (t.status === 'Approved' || t.status === 'Completed') &&
        <div><dt>Disposal confirmed</dt><dd>{kg(t.processed)}</dd></div>}
    </dl>
    {workflowHref && <a className="secondary button-link" href={workflowHref}>Open in {copy[t.kind].title} →</a>}
    {!workflowHref && role === 'Store Officer' && t.status === 'Returned' && !editing && <button className="primary" onClick={() => setEditing(true)}>Correct and resubmit</button>}
    {editing && t.status === 'Returned' && <EntryForm record={t} kind={t.kind} data={data} onCancel={() => setEditing(false)}
      onSave={(entry, note) => { const error = onRevise(t.id, entry, note ?? ''); if (!error) setEditing(false); return error }} />}
    {options.length > 0 && !active && <div className="button-row">{options.map((option, i) =>
      <button className={i ? 'secondary' : 'primary'} key={option} onClick={() => { setError(''); setCommand(option) }}>{actionLabels[option]}</button>)}</div>}
    {active && <form className="decision-form" key={active} onSubmit={confirm}>
      <h3>{actionLabels[active]}</h3>
      {hasQuantity && <label>Quantity confirmed (kg)<input name="quantity" required inputMode="decimal" defaultValue={remaining / 1000} /></label>}
      {active === 'close shortage' && <p>Record the remaining {kg(remaining)} as a shortage. This removes it from in-transit stock.</p>}
      <label>{reasonRequired ? 'Reason' : 'Note (optional)'}<textarea name="note" rows={2} required={reasonRequired} maxLength={300} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row"><button type="submit" className="primary">Confirm {active === 'approve' ? 'approval' : 'action'}</button>
        <button type="button" className="secondary" onClick={() => setCommand(undefined)}>Cancel</button></div>
    </form>}
    <h3>Activity history</h3>
    <Timeline data={[t]} />
  </Drawer>
}
