export const locations = ['Kuching', 'Miri', 'Sibu', 'Bintulu'] as const
export const species = ['Asian seabass', 'Red snapper', 'Tilapia', 'Mackerel'] as const
export const kinds = ['receive', 'issue', 'transfer', 'adjust', 'spoil', 'dispose'] as const
export type Kind = typeof kinds[number]
export type Role = 'Store Officer' | 'Supervisor'
export type Bucket = 'available' | 'held' | 'spoiled' | 'transit'
export type Status = 'Pending review' | 'Returned' | 'Rejected' | 'Approved' | 'In transit' | 'Partially received' | 'Completed' | 'Released'
export type Entry = {
  kind: Kind
  location: string
  lot: string
  species: string
  quantity: number
  destination: string
  party: string
  reason: string
  notes: string
  condition?: string
  documentRef?: string
  direction: 'increase' | 'decrease'
  date: string
}
type Delta = { location: string; bucket: Bucket; quantity: number }
export type Event = {
  action: string
  role: Role
  at: string
  note?: string
  deltas: Delta[]
}
export type Transaction = Entry & {
  id: number
  status: Status
  processed: number
  events: Event[]
}
export type Position = { lot: string; species: string; location: string } & Record<Bucket, number>
export type Command = 'approve' | 'return' | 'reject' | 'handover' | 'dispatch' | 'receive' | 'confirm disposal' | 'close shortage' | 'release hold'
export type Result = { ok: true; data: Transaction[]; id: number } | { ok: false; error: string }
export const labels: Record<Kind, string> = {
  receive: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjust: 'Adjustment', spoil: 'Spoilage', dispose: 'Disposal',
}
const prefixes: Record<Kind, string> = { receive: 'RCV', issue: 'ISS', transfer: 'TRF', adjust: 'ADJ', spoil: 'SPL', dispose: 'DSP' }
export const reference = (t: Transaction) => prefixes[t.kind] + '-' + String(t.id).padStart(4, '0')
export const amount = (g: number) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: 3 }).format(g / 1000)
export const kg = (g: number) => amount(g) + ' kg'
export const onHand = (p: Position) => p.available + p.held + p.spoiled
export const calendarDate = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
export const eventDate = (event: Pick<Event, 'at'>) => calendarDate(new Date(event.at))
export const eventTime = (event: Pick<Event, 'at'>) => new Intl.DateTimeFormat('en-MY', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(event.at))
const validQuantity = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000
export function parseQuantity(raw: string) {
  const value = raw.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return 0
  const grams = Math.round(Number(value) * 1000)
  return validQuantity(grams) ? grams : 0
}
const delta = (location: string, bucket: Bucket, quantity: number): Delta => ({ location, bucket, quantity })
const fail = (error: string): Result => ({ ok: false, error })

export function inventory(data: Transaction[]): Position[] {
  const positions = new Map<string, Position>()
  for (const transaction of data) {
    for (const event of transaction.events) {
      for (const movement of event.deltas) {
        const key = transaction.lot + ':' + movement.location
        const position = positions.get(key) ?? {
          lot: transaction.lot, species: transaction.species, location: movement.location,
          available: 0, held: 0, spoiled: 0, transit: 0,
        }
        position[movement.bucket] += movement.quantity
        positions.set(key, position)
      }
    }
  }
  return [...positions.values()].sort((a, b) => a.lot.localeCompare(b.lot) || a.location.localeCompare(b.location))
}

function position(data: Transaction[], lot: string, location: string) {
  return inventory(data).find(row => row.lot === lot && row.location === location)
}

function validate(data: Transaction[], entry: Entry, now: string, existingHold = 0) {
  if (!validQuantity(entry.quantity)) return 'Enter a quantity between 0.001 and 100,000 kg, using up to three decimal places.'
  if (!locations.some(location => location === entry.location)) return 'Select a valid storage location.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || entry.date > calendarDate(new Date(now))) {
    return 'Choose a valid transaction date up to today.'
  }
  if ((entry.kind === 'receive' || entry.kind === 'issue') && !entry.party.trim()) return 'Enter a supplier or recipient.'
  if (entry.kind !== 'receive' && !entry.reason.trim()) return 'Enter a purpose or reason.'
  if (entry.kind === 'receive' && !species.some(item => item === entry.species)) return 'Select a fish species.'
  if (entry.kind === 'transfer' && (!locations.some(location => location === entry.destination) || entry.destination === entry.location)) {
    return 'Select a destination different from the source.'
  }
  const stock = position(data, entry.lot, entry.location)
  if (entry.kind !== 'receive' && !stock) return 'Select a batch at this location.'
  if (entry.kind === 'dispose' && entry.quantity > (stock?.spoiled ?? 0)) return 'The quantity exceeds spoiled stock at this location.'
  if (['issue', 'transfer', 'spoil'].includes(entry.kind) || (entry.kind === 'adjust' && entry.direction === 'decrease')) {
    if (entry.quantity > (stock?.available ?? 0) + existingHold) return 'The quantity exceeds available stock at this location.'
  }
  return ''
}

export function submit(data: Transaction[], role: Role, entry: Entry, now = new Date().toISOString()): Result {
  if (role !== 'Store Officer') return fail('Switch to Store Officer to submit a transaction.')
  const error = validate(data, entry, now)
  if (error) return fail(error)
  const stock = position(data, entry.lot, entry.location)
  const id = Math.max(0, ...data.map(record => record.id)) + 1
  const lot = entry.kind === 'receive' ? 'LOT-' + String(id).padStart(4, '0') : entry.lot
  const deltas = entry.kind === 'spoil' ? [
    delta(entry.location, 'available', -entry.quantity), delta(entry.location, 'held', entry.quantity),
  ] : []
  const transaction: Transaction = {
    ...entry, lot, species: stock?.species ?? entry.species, id, status: 'Pending review', processed: 0,
    events: [{ action: 'Submitted for review', role, at: now, deltas }],
  }
  return { ok: true, data: [...data, transaction], id }
}

export function revise(data: Transaction[], role: Role, id: number, entry: Entry, note: string, now = new Date().toISOString()): Result {
  const original = data.find(t => t.id === id)
  if (role !== 'Store Officer' || original?.status !== 'Returned' || original.kind !== entry.kind) return fail('This record is unavailable for correction.')
  if (!note.trim()) return fail('Describe what was corrected.')
  if (entry.kind === 'spoil' && (entry.lot !== original.lot || entry.location !== original.location || entry.quantity !== original.quantity)) {
    return fail('Ask a Supervisor to release the hold before changing the batch or quantity.')
  }
  const error = validate(data, entry, now, entry.kind === 'spoil' ? original.quantity : 0)
  if (error) return fail(error)
  const fields = { ...entry, lot: entry.kind === 'receive' ? original.lot : entry.lot }
  const stock = position(data, fields.lot, fields.location)
  const changes = [
    original.quantity !== fields.quantity ? kg(original.quantity) + ' to ' + kg(fields.quantity) : '',
    original.lot !== fields.lot ? original.lot + ' to ' + fields.lot : '',
    original.location !== fields.location ? original.location + ' to ' + fields.location : '',
  ].filter(Boolean)
  const event: Event = { action: 'Corrected and resubmitted', role, at: now, note: [note.trim(), ...changes].join(' · '), deltas: [] }
  const updated: Transaction = { ...original, ...fields, species: stock?.species ?? fields.species, status: 'Pending review', events: [...original.events, event] }
  return { ok: true, id, data: data.map(t => t.id === id ? updated : t) }
}

export function commands(t: Transaction, role: Role): Command[] {
  if (role === 'Supervisor') {
    if (t.status === 'Pending review') return ['approve', 'return', 'reject']
    if (t.kind === 'transfer' && (t.status === 'In transit' || t.status === 'Partially received')) return ['close shortage']
    if (t.kind === 'spoil' && (t.status === 'Returned' || t.status === 'Rejected')) return ['release hold']
    return []
  }
  if (t.status === 'Approved' && t.kind === 'issue') return ['handover']
  if (t.status === 'Approved' && t.kind === 'transfer') return ['dispatch']
  if (t.status === 'Approved' && t.kind === 'dispose') return ['confirm disposal']
  if (t.kind === 'transfer' && (t.status === 'In transit' || t.status === 'Partially received')) return ['receive']
  return []
}

export function apply(data: Transaction[], role: Role, id: number, command: Command, note = '', quantity = 0, now = new Date().toISOString()): Result {
  const t = data.find(item => item.id === id)
  if (!t || !commands(t, role).includes(command)) return fail('This action is unavailable for the current role or status.')
  if (['return', 'reject', 'close shortage', 'release hold'].includes(command) && !note.trim()) {
    return fail('Enter a reason or correction note.')
  }

  const stock = position(data, t.lot, t.location)
  const remaining = t.quantity - t.processed
  let status: Status = t.status
  let processed = t.processed
  let action = ''
  const moves: Delta[] = []
  const requireAvailable = () => t.quantity <= (stock?.available ?? 0)

  switch (command) {
    case 'return': status = 'Returned'; action = 'Returned for correction'; break
    case 'reject': status = 'Rejected'; action = 'Rejected'; break
    case 'approve':
      status = 'Approved'
      action = 'Approved'
      if (t.kind === 'receive' || t.kind === 'adjust' || t.kind === 'spoil') {
        if (t.kind === 'adjust' && t.direction === 'decrease' && !requireAvailable()) return fail('Stock changed. The adjustment would exceed available stock.')
        if (t.kind === 'spoil') {
          if (t.quantity > (stock?.held ?? 0)) return fail('The held quantity is no longer available for this decision.')
          moves.push(delta(t.location, 'held', -t.quantity), delta(t.location, 'spoiled', t.quantity))
        } else {
          moves.push(delta(t.location, 'available', t.kind === 'adjust' && t.direction === 'decrease' ? -t.quantity : t.quantity))
        }
        status = 'Completed'
        processed = t.quantity
        action = t.kind === 'spoil' ? 'Spoilage confirmed' : 'Approved and posted'
      }
      break
    case 'handover':
    case 'dispatch':
      if (!requireAvailable()) return fail('Stock changed. The requested quantity exceeds available stock.')
      moves.push(delta(t.location, 'available', -t.quantity))
      if (command === 'dispatch') {
        moves.push(delta(t.location, 'transit', t.quantity))
        status = 'In transit'
        action = 'Dispatched'
      } else {
        status = 'Completed'
        processed = t.quantity
        action = 'Handover confirmed'
      }
      break
    case 'receive':
    case 'confirm disposal':
      if (!validQuantity(quantity) || quantity > remaining) return fail('Enter a positive quantity up to ' + kg(remaining) + '.')
      processed += quantity
      if (command === 'receive') {
        moves.push(delta(t.location, 'transit', -quantity), delta(t.destination, 'available', quantity))
        status = processed === t.quantity ? 'Completed' : 'Partially received'
        action = 'Destination received ' + kg(quantity)
      } else {
        if (quantity > (stock?.spoiled ?? 0)) return fail('The quantity exceeds the spoiled stock still on hand.')
        moves.push(delta(t.location, 'spoiled', -quantity))
        status = processed === t.quantity ? 'Completed' : 'Approved'
        action = 'Disposal confirmed · ' + kg(quantity)
      }
      break
    case 'close shortage':
      moves.push(delta(t.location, 'transit', -remaining))
      status = 'Completed'
      action = 'Shortage recorded · ' + kg(remaining)
      break
    case 'release hold':
      if (t.quantity > (stock?.held ?? 0)) return fail('The hold is no longer available.')
      moves.push(delta(t.location, 'held', -t.quantity), delta(t.location, 'available', t.quantity))
      status = 'Released'
      action = 'Hold released'
      break
  }

  const updated: Transaction = {
    ...t, status, processed,
    events: [...t.events, { action, role, at: now, note: note.trim() || undefined, deltas: moves }],
  }
  return { ok: true, data: data.map(item => item.id === id ? updated : item), id }
}

export const timeline = (data: Transaction[]) => data.flatMap(t => t.events.map((event, index) => ({ t, event, index })))
  .sort((a, b) => b.event.at.localeCompare(a.event.at) || b.t.id - a.t.id || b.index - a.index)

export function demoData(): Transaction[] {
  let data: Transaction[] = []
  const when = (days: number, hour = 10) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    date.setHours(hour, 0, 0, 0)
    return date.toISOString()
  }
  function record(entry: Partial<Entry>, days: number, posted = false, handover?: Command) {
    const at = when(days)
    const result = submit(data, 'Store Officer', {
      kind: 'receive', lot: '', species: 'Asian seabass', location: 'Kuching', destination: '', quantity: 100_000,
      party: 'Demo supplier', reason: '', notes: '', condition: 'Good', direction: 'decrease', date: calendarDate(new Date(at)), ...entry,
    }, at)
    if (!result.ok) throw new Error(result.error)
    data = result.data
    if (posted) complete(result.id, 'approve', days)
    if (handover) complete(result.id, handover, days)
    return data.find(item => item.id === result.id)!
  }
  function complete(id: number, command: Command, days: number, quantity = 0) {
    const role = command === 'approve' ? 'Supervisor' : 'Store Officer'
    const result = apply(data, role, id, command, '', quantity, when(days, 12))
    if (!result.ok) throw new Error(result.error)
    data = result.data
  }
  const seabass = record({ quantity: 360_000 }, 6, true)
  const snapper = record({ species: 'Red snapper', location: 'Miri', quantity: 260_000 }, 5, true)
  const tilapia = record({ species: 'Tilapia', location: 'Sibu', quantity: 180_000 }, 4, true)
  record({ species: 'Mackerel', location: 'Bintulu', quantity: 145_000 }, 3, true)
  record({ kind: 'issue', lot: seabass.lot, quantity: 45_000, party: 'Training kitchen', reason: 'Demonstration issue' }, 3, true, 'handover')
  const transfer = record({ kind: 'transfer', lot: seabass.lot, destination: 'Miri', quantity: 60_000, reason: 'Rebalance storage' }, 2, true, 'dispatch')
  complete(transfer.id, 'receive', 2, 55_000)
  record({ kind: 'spoil', lot: tilapia.lot, location: 'Sibu', quantity: 12_000, reason: 'Condition deterioration' }, 2, true)
  const disposal = record({ kind: 'dispose', lot: tilapia.lot, location: 'Sibu', quantity: 4_000, reason: 'Sample disposal' }, 1, true)
  complete(disposal.id, 'confirm disposal', 1, 4_000)
  record({ kind: 'issue', lot: snapper.lot, location: 'Miri', quantity: 18_000, party: 'Demo recipient', reason: 'Scheduled handover' }, 1)
  record({ species: 'Mackerel', quantity: 100_000, notes: 'Fictional sample for receipt approval.' }, 0)
  return data
}

const storageKey = 'fish-inventory-demo-v2'
export function loadLegacyTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const value: unknown = JSON.parse(raw)
      if (Array.isArray(value) && value.length && value.every(t => t && Array.isArray(t.events) && kinds.includes(t.kind))) {
        const rename = (location: string) => ({ 'Site A': 'Kuching', 'Site B': 'Miri' }[location] ?? location)
        return (value as Transaction[]).map(t => ({
          ...t, location: rename(t.location), destination: rename(t.destination),
          events: t.events.map(event => ({ ...event, deltas: event.deltas.map(d => ({ ...d, location: rename(d.location) })) })),
        }))
      }
    }
  } catch { /* Use the demo data when storage is unavailable. */ }
  return demoData()
}
