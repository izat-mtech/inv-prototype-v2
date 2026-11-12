import { useEffect, useRef, useState } from 'react'
import { Dashboard, Inventory } from './StockViews'
import { TransactionDetail, TransactionPage } from './Transactions'
import { Reports } from './Reports'
import { Approvals, AuditTrail } from './Oversight'
import { Stocktaking, StocktakeDetail } from './StocktakingView'
import { apply, locations, reference, revise, submit } from './inventory'
import { captureCount, countRef, reviewCount, startCount, submitCount } from './stocktake'
import { auditEntries, loadWorkspace, persistWorkspace, resetWorkspace } from './workspace'
import type { Command, Entry, Kind, Result, Role, Transaction } from './inventory'
import type { CountDecision } from './stocktake'
import type { Activity, RecordTarget } from './workspace'
import './App.css'

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'inventory', label: 'Inventory', icon: 'stack' },
  { id: 'stock-receive', label: 'Stock Receive', icon: 'down' },
  { id: 'stock-issue', label: 'Stock Issue', icon: 'up' },
  { id: 'stock-transfer', label: 'Stock Transfer', icon: 'swap' },
  { id: 'spoilage', label: 'Spoilage', icon: 'warning' },
  { id: 'stocktaking', label: 'Stocktaking', icon: 'count-icon' },
  { id: 'approvals', label: 'Approvals', icon: 'check-icon' },
  { id: 'audit-trail', label: 'Audit Trail', icon: 'audit-icon' },
  { id: 'reports', label: 'Reports', icon: 'doc' },
] as const
type Tab = typeof tabs[number]['id']
const transactionTabs: Partial<Record<Tab, Kind>> = {
  'stock-receive': 'receive', 'stock-issue': 'issue', 'stock-transfer': 'transfer', spoilage: 'spoil',
}
const kindTab: Record<Kind, Tab> = {
  receive: 'stock-receive', issue: 'stock-issue', transfer: 'stock-transfer', adjust: 'stock-transfer',
  spoil: 'spoilage', dispose: 'spoilage',
}
const profiles: Record<Role, { name: string; initials: string }> = {
  'Store Officer': { name: 'Aina Rahman', initials: 'AR' }, Supervisor: { name: 'Daniel Tan', initials: 'DT' },
}
function readRoute() {
  const [path, query] = window.location.hash.slice(1).split('?')
  const [name, id] = path.split('/')
  const tab: Tab = tabs.find(item => item.id === name)?.id ?? 'dashboard'
  const city = new URLSearchParams(query).get('city') ?? ''
  const location = locations.some(item => item === city) ? city : ''
  const selected: RecordTarget | undefined = /^\d+$/.test(id ?? '') ?
    { type: tab === 'stocktaking' ? 'count' : 'transaction', id: Number(id) } : undefined
  return { tab, location, selected }
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [role, setRole] = useState<Role>('Store Officer')
  const [route, setRoute] = useState(readRoute)
  const [dashboardCity, setDashboardCity] = useState(() => readRoute().location)
  const [selected, setSelected] = useState<RecordTarget | undefined>(() => readRoute().selected)
  const [message, setMessage] = useState('')
  const profileMenu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const onHash = () => {
      const next = readRoute()
      setRoute(next)
      setSelected(next.selected)
      if (next.tab === 'dashboard' && next.location) setDashboardCity(next.location)
      setMessage('')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => persistWorkspace(workspace), [workspace])

  const { data, sheets } = workspace
  const { tab, location } = route
  const scopeKey = tab + ':' + location
  const audit = auditEntries(workspace)
  const profile = profiles[role]
  const screen = tabs.find(item => item.id === tab)!
  const kind = transactionTabs[tab]
  const selectedTransaction = selected?.type === 'transaction' ? data.find(t => t.id === selected.id) : undefined
  const selectedCount = selected?.type === 'count' ? sheets.find(sheet => sheet.id === selected.id) : undefined

  function commit(result: Result, note: string, open = false) {
    if (!result.ok) return result.error
    setWorkspace(current => ({ ...current, data: result.data }))
    setMessage(note)
    if (open) setSelected({ type: 'transaction', id: result.id })
    return undefined
  }
  function create(entry: Entry) {
    const result = submit(data, role, entry)
    return commit(result, result.ok ? reference(result.data[result.data.length - 1]) + ' submitted for review.' : '', true)
  }
  function action(id: number, command: Command, note: string, quantity: number) {
    const result = apply(data, role, id, command, note, quantity)
    const updated = result.ok ? result.data.find(t => t.id === id) : undefined
    return commit(result, updated ? reference(updated) + ' · ' + updated.events.at(-1)?.action + '.' : '')
  }
  function correction(id: number, entry: Entry, note: string) {
    return commit(revise(data, role, id, entry, note), 'Correction submitted for review.')
  }
  function commitCount(result: ReturnType<typeof startCount>, message: string, open = false) {
    if (!result.ok) return result.error
    setWorkspace(current => ({ ...current, data: result.data, sheets: result.sheets }))
    setMessage(countRef(result.id) + ' · ' + message)
    if (open) setSelected({ type: 'count', id: result.id })
    return undefined
  }
  function review(id: number, decision: CountDecision, note: string) {
    return commitCount(reviewCount(sheets, data, role, id, decision, note),
      decision === 'approve' ? 'Stocktake reconciled.' : decision === 'return' ? 'Returned for recount.' : 'Stocktake rejected.')
  }
  function log(action: string, note?: string, location?: string) {
    const event: Activity = { at: new Date().toISOString(), role, action, note, location }
    setWorkspace(current => ({ ...current, activity: [...current.activity, event] }))
  }
  function close() {
    setSelected(undefined)
    if (route.selected) {
      window.history.replaceState(null, '', '#' + tab + (location ? '?city=' + encodeURIComponent(location) : ''))
      setRoute({ ...route, selected: undefined })
    }
  }
  function switchProfile(next: Role) {
    if (next !== role) log('Switched demo profile', role + ' → ' + next)
    setRole(next)
    setMessage('')
    close()
    if (profileMenu.current) profileMenu.current.open = false
  }
  function reset() {
    if (!window.confirm('Reset the fictional transactions and counts in this browser?')) return
    setWorkspace(resetWorkspace(role))
    setRole('Store Officer')
    close()
    setMessage('Demo data reset.')
    if (profileMenu.current) profileMenu.current.open = false
  }
  const open = (record: Transaction) => setSelected({ type: 'transaction', id: record.id })
  const openCount = (id: number) => setSelected({ type: 'count', id })
  const stockPending = sheets.filter(sheet => sheet.status === 'Pending review').length
  const txnPending = data.filter(t => t.status === 'Pending review')

  return <div className="app">
    <aside className="sidebar">
      <details className="profile" ref={profileMenu}>
        <summary aria-label={'Active profile: ' + role}>
          <span className="avatar" aria-hidden="true">{profile.initials}</span>
          <span className="profile-name"><strong>{profile.name}</strong><small>{role}</small></span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="profile-options">
          {(Object.keys(profiles) as Role[]).map(option => <button type="button" key={option}
            aria-pressed={option === role} onClick={() => switchProfile(option)}>{option}</button>)}
          <button type="button" className="reset" onClick={reset}>Reset demo data</button>
        </div>
      </details>
      <nav aria-label="Main navigation">
        {tabs.map(item => {
          const count = item.id === 'approvals' ? txnPending.length + stockPending : item.id === 'stocktaking' ? stockPending :
            txnPending.filter(t => kindTab[t.kind] === item.id).length
          return <a key={item.id} href={'#' + item.id} aria-current={tab === item.id ? 'page' : undefined}>
            <span className={'nav-icon ' + item.icon} aria-hidden="true" />{item.label}
            {count > 0 && role === 'Supervisor' && <span className="nav-count" aria-label={count + ' pending'}>{count}</span>}
          </a>
        })}
      </nav>
      <div className="sidebar-footer">Fish Inventory<span>Fictional demo records</span></div>
    </aside>
    <main>
      <div className="topbar"><span>Fish Inventory <span className="crumb">/ {screen.label}</span></span><span className="demo-tag"><i />Prototype</span></div>
      <div className="content">
        <div className="notice no-print" role="status">{message}</div>
        {tab === 'dashboard' && <Dashboard data={data} sheets={sheets} location={dashboardCity} onLocation={setDashboardCity} onOpen={open} />}
        {tab === 'inventory' && <Inventory key={scopeKey} initialLocation={location} data={data} onOpen={open} />}
        {kind && <TransactionPage key={scopeKey} initialKind={kind} initialLocation={location} role={role} data={data} onOpen={open} onCreate={create} />}
        {tab === 'stocktaking' && <Stocktaking key={scopeKey} initialLocation={location} sheets={sheets} role={role} onOpen={openCount}
          onStart={(city, note) => commitCount(startCount(sheets, data, role, city, note), 'Snapshot captured.', true)} />}
        {tab === 'approvals' && <Approvals key={scopeKey} initialLocation={location} workspace={workspace} role={role} onOpen={setSelected} />}
        {tab === 'audit-trail' && <AuditTrail key={scopeKey} initialLocation={location} entries={audit} onOpen={setSelected} />}
        {tab === 'reports' && <Reports key={scopeKey} initialLocation={location} data={data} audit={audit} onOpen={setSelected}
          onExport={(report, city, format) => log(format === 'CSV' ? 'Downloaded CSV report' : 'Opened print preview', report + ' report', city || undefined)} />}
      </div>
    </main>
    {selectedTransaction && <TransactionDetail key={'transaction-' + selectedTransaction.id} t={selectedTransaction} data={data}
      role={role} workflowHref={tab !== kindTab[selectedTransaction.kind] && !(tab === 'approvals' && selectedTransaction.status === 'Pending review') ?
        '#' + kindTab[selectedTransaction.kind] + '/' + selectedTransaction.id : undefined}
      onClose={close} onCommand={action} onRevise={correction} />}
    {selectedCount && <StocktakeDetail key={'count-' + selectedCount.id} sheet={selectedCount} role={role}
      workflowHref={tab !== 'stocktaking' && !(tab === 'approvals' && selectedCount.status === 'Pending review') ? '#stocktaking/' + selectedCount.id : undefined}
      onRecord={(lot, actual) => commitCount(captureCount(sheets, data, role, selectedCount.id, lot, actual), 'Count recorded.')}
      onSubmit={() => commitCount(submitCount(sheets, data, role, selectedCount.id), 'Submitted for review.')}
      onReview={(decision, note) => review(selectedCount.id, decision, note)} onClose={close} />}
  </div>
}
