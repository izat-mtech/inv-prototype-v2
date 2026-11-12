import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { eventTime, reference, timeline } from './inventory'
import type { Transaction } from './inventory'

export function Heading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>
}

export function Badge({ text }: { text: string }) {
  return <span className={'badge ' + text.toLowerCase().replaceAll(' ', '-')}>{text}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Drawer({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={ref} className={wide ? 'drawer drawer-wide' : 'drawer'} aria-label={title} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="drawer-inner">
      <div className="drawer-title"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close details">×</button></div>
      {children}
    </div>
  </dialog>
}

export function Timeline({ data, limit, onOpen }: { data: Transaction[]; limit?: number; onOpen?: (t: Transaction) => void }) {
  const entries = timeline(data).slice(0, limit)
  if (!entries.length) return <Empty>No activity yet.</Empty>
  return <ul className="timeline">{entries.map(({ t, event, index }) => <li key={t.id + '-' + index}>
    <div className="timeline-dot" aria-hidden="true" />
    <div><strong>{event.action}</strong>
      <p>{onOpen ? <button className="text-button" onClick={() => onOpen(t)}>{reference(t)}</button> : reference(t)} · {t.lot} · {event.role}</p>
      {event.note && <p className="activity-note">{event.note}</p>}
    </div>
    <time dateTime={event.at}>{eventTime(event)}</time>
  </li>)}</ul>
}

export function FilterLocation({ value, onChange, locations }: { value: string; onChange: (value: string) => void; locations: readonly string[] }) {
  return <label className="compact-field">Location<select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">All locations</option>{locations.map(location => <option key={location}>{location}</option>)}
  </select></label>
}
