import { demoData, loadLegacyTransactions, reference } from './inventory'
import { countRef } from './stocktake'
import type { Role, Transaction } from './inventory'
import type { CountSheet } from './stocktake'

export type Activity = { at: string; role: Role; action: string; location?: string; note?: string }
export type RecordTarget = { type: 'transaction' | 'count'; id: number }
export type AuditEntry = Activity & { key: string; ref?: string; lot?: string; destination?: string; target?: RecordTarget; category: 'Transaction' | 'Stocktake' | 'User activity' }
export type Workspace = { data: Transaction[]; sheets: CountSheet[]; activity: Activity[] }

const key = 'fish-inventory-city-v3'
export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.data) && Array.isArray(parsed.sheets) && Array.isArray(parsed.activity)) return parsed
    }
  } catch { /* Demo is usable when browser storage is unavailable. */ }
  return { data: loadLegacyTransactions(), sheets: [], activity: [] }
}
export function resetWorkspace(role: Role): Workspace {
  return { data: demoData(), sheets: [], activity: [{ at: new Date().toISOString(), role, action: 'Demo data reset' }] }
}
export function persistWorkspace(workspace: Workspace) {
  try { localStorage.setItem(key, JSON.stringify(workspace)) }
  catch { /* Keep the demo usable during this session. */ }
}

export function auditEntries(workspace: Workspace): AuditEntry[] {
  const events: AuditEntry[] = []
  for (const t of workspace.data) {
    t.events.forEach((event, i) => events.push({
      key: 'transaction-' + t.id + '-' + i, at: event.at, role: event.role, action: event.action, note: event.note,
      ref: reference(t), lot: t.lot, location: t.location, destination: t.destination, category: 'Transaction', target: { type: 'transaction', id: t.id },
    }))
  }
  for (const sheet of workspace.sheets) {
    sheet.events.forEach((event, i) => events.push({
      key: 'count-' + sheet.id + '-' + i, at: event.at, role: event.role, action: event.action, note: event.note,
      ref: countRef(sheet.id), lot: event.lot, location: sheet.location, category: 'Stocktake', target: { type: 'count', id: sheet.id },
    }))
  }
  workspace.activity.forEach((event, i) => events.push({ ...event, key: 'activity-' + i, category: 'User activity' }))
  return events.reverse().sort((a, b) => b.at.localeCompare(a.at))
}
