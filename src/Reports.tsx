import { useState } from 'react'
import { Empty, FilterLocation, Heading } from './components'
import { calendarDate, eventDate, eventTime, inventory, labels, locations, onHand, reference, timeline } from './inventory'
import type { Transaction } from './inventory'
import type { AuditEntry, RecordTarget } from './workspace'

const reports = ['Inventory', 'Movement', 'Spoilage', 'Audit'] as const
type Report = typeof reports[number]
type Row = { cells: string[]; target?: RecordTarget }
const headers: Record<Report, string[]> = {
  Inventory: ['Batch', 'Species', 'Location', 'On hand (kg)', 'Available (kg)', 'Held (kg)', 'Spoiled (kg)', 'In transit (kg)'],
  Movement: ['Date', 'Reference', 'Batch', 'Movement', 'Location', 'Stock status', 'Change (kg)'],
  Spoilage: ['Date', 'Reference', 'Batch', 'Location', 'Type', 'Reported (kg)', 'Confirmed (kg)', 'Reason', 'Status'],
  Audit: ['Time', 'Reference', 'Batch', 'Location', 'Category', 'Action', 'Profile', 'Note'],
}

function download(report: Report, rows: Row[]) {
  function escape(value: string) {
    const safe = /^\s*[=+\-@\t\r\n]/.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value) ? "'" + value : value
    return '"' + safe.replaceAll('"', '""') + '"'
  }
  const csv = [headers[report], ...rows.map(row => row.cells)].map(row => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'fish-inventory-' + report.toLowerCase() + '-' + calendarDate() + '.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

const rawKg = (quantity: number) => String(quantity / 1000)

export function Reports({ data, audit, initialLocation, onOpen, onExport }: {
  data: Transaction[]; audit: AuditEntry[]; initialLocation: string; onOpen: (target: RecordTarget) => void
  onExport: (report: Report, location: string, format: 'CSV' | 'print') => void
}) {
  const [report, setReport] = useState<Report>('Inventory')
  const [location, setLocation] = useState(initialLocation)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const validRange = !from || !to || from <= to
  const inDateRange = (date: string) => validRange && (!from || date >= from) && (!to || date <= to)
  const atLocation = (...places: string[]) => !location || places.includes(location)
  const events = timeline(data)
  let rows: Row[]
  switch (report) {
    case 'Inventory':
      rows = inventory(data).filter(p => atLocation(p.location) && (onHand(p) || p.transit)).map(p => ({
        cells: [p.lot, p.species, p.location, rawKg(onHand(p)), rawKg(p.available), rawKg(p.held), rawKg(p.spoiled), rawKg(p.transit)],
      }))
      break
    case 'Movement':
      rows = events.filter(({ event }) => inDateRange(eventDate(event))).flatMap(({ t, event }) => event.deltas
        .filter(d => atLocation(d.location)).map(d => ({
          cells: [eventDate(event), reference(t), t.lot, event.action, d.location, d.bucket, rawKg(d.quantity)], target: { type: 'transaction', id: t.id },
        })))
      break
    case 'Spoilage':
      rows = [...data].reverse().filter(t => (t.kind === 'spoil' || t.kind === 'dispose') && inDateRange(t.date) && atLocation(t.location))
        .map(t => ({ cells: [t.date, reference(t), t.lot, t.location, labels[t.kind], rawKg(t.quantity), rawKg(t.processed), t.reason, t.status], target: { type: 'transaction', id: t.id } }))
      break
    case 'Audit':
      rows = audit.filter(entry => inDateRange(eventDate(entry)) && atLocation(entry.location ?? '', entry.destination ?? '')).map(entry => ({
        cells: [eventTime(entry), entry.ref ?? '', entry.lot ?? '', [entry.location, entry.destination].filter(Boolean).join(' → '),
          entry.category, entry.action, entry.role, entry.note ?? ''], target: entry.target,
      }))
  }
  return <>
    <Heading title="Reports" subtitle="Review, export and print live reports from the demo records." action={<div className="button-row no-print">
      <button className="secondary" onClick={() => { onExport(report, location, 'print'); window.print() }} disabled={!rows.length}>Print / PDF</button>
      <button className="primary" onClick={() => { download(report, rows); onExport(report, location, 'CSV') }} disabled={!rows.length}>Download CSV</button>
    </div>} />
    <div className="segment no-print" aria-label="Report type">{reports.map(name =>
      <button key={name} aria-pressed={report === name} onClick={() => setReport(name)}>{name}</button>)}</div>
    <section className="panel report-panel">
      <div className="panel-heading toolbar"><h2>{report} report <span className="count">{rows.length}</span></h2>
        <div className="filters no-print">
          {report !== 'Inventory' && <>
            <label className="compact-field">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="compact-field">To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          </>}
          <FilterLocation value={location} onChange={setLocation} locations={locations} />
        </div>
      </div>
      <p className="report-context">{location || 'All locations'} · {report === 'Inventory' ? 'Current posted balances' : (from || to) ? (from || 'Earliest') + ' to ' + (to || 'Latest') : 'All dates'}</p>
      {report === 'Movement' && <p className="report-context">Each line shows a stock status change. A single transfer can create more than one line.</p>}
      {!validRange && report !== 'Inventory' && <p className="form-error report-context" role="alert">The end date must be on or after the start date.</p>}
      {rows.length ? <div className="table-scroll"><table>
        <thead><tr>{headers[report].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.cells.map((value, j) =>
          <td key={j}>{j === 1 && row.target ? <button className="text-button" onClick={() => onOpen(row.target!)}>{value}</button> : value || '—'}</td>)}</tr>)}</tbody>
      </table></div> : <Empty>No report records match the filters.</Empty>}
    </section>
  </>
}
