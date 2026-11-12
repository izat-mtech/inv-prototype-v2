import { calendarDate, inventory, kg, locations, onHand, reference } from './inventory'
import type { Role, Transaction } from './inventory'

export type CountEvent = { action: string; role: Role; at: string; note?: string; lot?: string }
export type CountLine = {
  lot: string
  species: string
  snapshot: number
  observation?: { actual: number; expected: number; at: string }
}
export type CountStatus = 'Counting' | 'Pending review' | 'Returned' | 'Completed' | 'Rejected'
export type CountSheet = {
  id: number
  location: string
  status: CountStatus
  startedAt: string
  note: string
  lines: CountLine[]
  events: CountEvent[]
  adjustments?: string[]
}
export type CountDecision = 'approve' | 'return' | 'reject'
type CountResult = { ok: true; sheets: CountSheet[]; data: Transaction[]; id: number } | { ok: false; error: string }
const fail = (error: string): CountResult => ({ ok: false, error })
export const countRef = (id: number) => 'CNT-' + String(id).padStart(4, '0')
export const editable = (sheet: CountSheet) => sheet.status === 'Counting' || sheet.status === 'Returned'
export const variance = (line: CountLine) => line.observation ? line.observation.actual - line.observation.expected : 0
export const signedKg = (quantity: number) => quantity > 0 ? '+' + kg(quantity) : quantity < 0 ? '−' + kg(-quantity) : kg(0)

function save(sheets: CountSheet[], data: Transaction[], sheet: CountSheet): CountResult {
  return { ok: true, sheets: sheets.some(s => s.id === sheet.id) ? sheets.map(s => s.id === sheet.id ? sheet : s) : [...sheets, sheet], data, id: sheet.id }
}

export function startCount(sheets: CountSheet[], data: Transaction[], role: Role, location: string, note: string, at = new Date().toISOString()): CountResult {
  if (role !== 'Store Officer') return fail('Switch to Store Officer to start a stocktake.')
  if (!locations.some(city => city === location)) return fail('Select a valid city.')
  if (sheets.some(sheet => sheet.location === location && !['Completed', 'Rejected'].includes(sheet.status))) return fail('Finish the open stocktake for this city before starting another.')
  const lines = inventory(data).filter(row => row.location === location && onHand(row) > 0)
    .map(row => ({ lot: row.lot, species: row.species, snapshot: onHand(row) }))
  if (!lines.length) return fail('There are no on-hand batches to count in this city.')
  const id = Math.max(0, ...sheets.map(sheet => sheet.id)) + 1
  return save(sheets, data, {
    id, location, status: 'Counting', startedAt: at, note: note.trim(), lines,
    events: [{ action: 'Stocktake snapshot opened', role, at, note: lines.length + ' batches in scope' }],
  })
}

export function captureCount(sheets: CountSheet[], data: Transaction[], role: Role, id: number, lot: string, actual: number, at = new Date().toISOString()): CountResult {
  const sheet = sheets.find(item => item.id === id)
  const line = sheet?.lines.find(item => item.lot === lot)
  if (role !== 'Store Officer' || !sheet || !line || !editable(sheet)) return fail('This count is not open for entry.')
  if (!Number.isSafeInteger(actual) || actual < 0 || actual > 100_000_000) return fail('Enter a quantity from 0 to 100,000 kg with up to three decimal places.')
  const row = inventory(data).find(item => item.lot === lot && item.location === sheet.location)
  const observation = { actual, expected: row ? onHand(row) : 0, at }
  const events = [...sheet.events, { action: 'Physical count recorded', role, at, lot, note: kg(actual) + ' counted' }]
  return save(sheets, data, { ...sheet, lines: sheet.lines.map(item => item.lot === lot ? { ...item, observation } : item), events })
}

export function submitCount(sheets: CountSheet[], data: Transaction[], role: Role, id: number, at = new Date().toISOString()): CountResult {
  const sheet = sheets.find(item => item.id === id)
  if (role !== 'Store Officer' || !sheet || !editable(sheet)) return fail('This stocktake cannot be submitted.')
  if (sheet.lines.some(line => !line.observation)) return fail('Record every batch count before submitting.')
  return save(sheets, data, { ...sheet, status: 'Pending review',
    events: [...sheet.events, { action: 'Stocktake submitted for review', role, at }] })
}

export function reviewCount(sheets: CountSheet[], data: Transaction[], role: Role, id: number, decision: CountDecision, note: string, at = new Date().toISOString()): CountResult {
  const sheet = sheets.find(item => item.id === id)
  if (role !== 'Supervisor' || sheet?.status !== 'Pending review') return fail('Only a Supervisor can review a pending stocktake.')
  if (decision !== 'approve' && !note.trim()) return fail('Enter a reason for the decision.')
  if (decision !== 'approve') {
    const returned = decision === 'return'
    return save(sheets, data, {
      ...sheet, status: returned ? 'Returned' : 'Rejected',
      events: [...sheet.events, { action: returned ? 'Stocktake returned for recount' : 'Stocktake rejected', role, at, note: note.trim() }],
    })
  }
  if (sheet.lines.some(line => !line.observation)) return fail('The sheet is missing a physical count.')
  const positions = inventory(data)
  const corrections = sheet.lines.filter(line => variance(line) !== 0)
  for (const line of corrections) {
    const current = positions.find(row => row.lot === line.lot && row.location === sheet.location)
    if ((current?.available ?? 0) + variance(line) < 0) {
      return fail(line.lot + ': the variance exceeds available stock now. Return the sheet for recount or reconcile held and spoiled stock before approval.')
    }
  }
  const nextId = Math.max(0, ...data.map(t => t.id)) + 1
  const posted: Transaction[] = corrections.map((line, index) => {
    const difference = variance(line)
    const quantity = Math.abs(difference)
    return {
      id: nextId + index, kind: 'adjust', location: sheet.location, lot: line.lot, species: line.species,
      quantity, destination: '', party: '', reason: 'Stocktake ' + countRef(id),
      notes: 'Counted ' + kg(line.observation!.actual) + ' against ' + kg(line.observation!.expected) + ' at the count time.',
      direction: difference > 0 ? 'increase' : 'decrease', date: calendarDate(new Date(at)), status: 'Completed', processed: quantity,
      events: [{ action: 'Stocktake variance posted', role, at, note: countRef(id),
        deltas: [{ location: sheet.location, bucket: 'available', quantity: difference }] }],
    }
  })
  const adjustments = posted.map(reference)
  const reviewNote = [note.trim(), adjustments.length ? 'Adjustments: ' + adjustments.join(', ') : 'No variance to post.'].filter(Boolean).join(' · ')
  return save(sheets, [...data, ...posted], { ...sheet, status: 'Completed', adjustments,
    events: [...sheet.events, { action: 'Stocktake reconciled', role, at, note: reviewNote }] })
}
