import { useState } from 'react'
import { Drawer, Empty, FilterLocation, Heading, Timeline } from './components'
import { amount, calendarDate, eventDate, inventory, kg, locations, onHand, timeline } from './inventory'
import type { Position, Transaction } from './inventory'
import type { CountSheet } from './stocktake'

function total(rows: Position[], key: 'available' | 'held' | 'spoiled' | 'transit') {
  return rows.reduce((sum, row) => sum + row[key], 0)
}

const colors = ['#1f685b', '#6fae8e', '#dea963', '#6078a6']

export function Dashboard({ data, sheets, location, onLocation, onOpen }: {
  data: Transaction[]; sheets: CountSheet[]; location: string; onLocation: (city: string) => void; onOpen: (t: Transaction) => void
}) {
  const allRows = inventory(data)
  const rows = allRows.filter(row => !location || row.location === location)
  const scopedData = data.filter(t => !location || [t.location, t.destination].includes(location))
  const scopedSheets = sheets.filter(sheet => !location || sheet.location === location)
  const scope = location ? '?city=' + encodeURIComponent(location) : ''
  const cities = (location ? [location] : locations).map(city => {
    const stock = allRows.filter(row => row.location === city)
    return { city, physical: stock.reduce((sum, row) => sum + onHand(row), 0), available: total(stock, 'available'), transit: total(stock, 'transit') }
  })
  const highestCity = Math.max(1, ...cities.map(city => city.physical))
  const available = total(rows, 'available')
  const held = total(rows, 'held')
  const spoiled = total(rows, 'spoiled')
  const transit = total(rows, 'transit')
  const physical = available + held + spoiled
  const pending = scopedData.filter(t => t.status === 'Pending review').length +
    scopedSheets.filter(sheet => sheet.status === 'Pending review').length
  const states = [
    { label: 'Available', value: available }, { label: 'On hold', value: held },
    { label: 'Spoiled', value: spoiled }, { label: 'In transit', value: transit },
  ]
  const allStock = physical + transit
  let cursor = 0
  const stops = states.map(({ value }, i) => {
    const start = cursor
    cursor += allStock ? value * 100 / allStock : 0
    return colors[i] + ' ' + start + '% ' + cursor + '%'
  })
  const history = timeline(scopedData)
  const trend = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + i)
    const iso = calendarDate(date)
    const day = history.filter(({ event }) => eventDate(event) === iso)
    const movement = (kind: 'receive' | 'issue') => day.filter(({ t }) => t.kind === kind)
      .reduce((sum, { event }) => sum + event.deltas.reduce((x, d) => x + Math.abs(d.quantity), 0), 0)
    return { iso, label: new Intl.DateTimeFormat('en-MY', { weekday: 'short' }).format(date), received: movement('receive'), issued: movement('issue') }
  })
  const max = Math.max(...trend.flatMap(d => [d.received, d.issued]), 1000)
  const step = Math.max(10_000, Math.ceil(max / 4 / 10_000) * 10_000)
  const ceiling = step * 4

  return <>
    <Heading title="Dashboard" subtitle={location ? 'Inventory overview for ' + location + '.' : 'Inventory overview across all four cities.'}
      action={<FilterLocation value={location} onChange={onLocation} locations={locations} />} />
    <nav className="dashboard-shortcuts" aria-label="Dashboard shortcuts">
      {([['inventory', 'Inventory'], ['stock-receive', 'Stock Receive'], ['stock-issue', 'Stock Issue'], ['reports', 'Reports']] as const).map(([id, label]) =>
        <a key={id} className="secondary button-link" href={'#' + id + scope}>{label}<span aria-hidden="true">→</span></a>)}
    </nav>
    <div className="kpis">
      <article><span>On hand</span><strong>{kg(physical)}</strong><small>{location ? 'Physically in ' + location : 'Physically at all locations'}</small></article>
      <article><span>Available to issue</span><strong>{kg(available)}</strong><small>{rows.filter(p => p.available > 0).length} batch locations with available stock</small></article>
      <article><span>In transit</span><strong>{kg(transit)}</strong><small>{location ? 'Dispatched from ' + location : 'Dispatched and awaiting receipt'}</small></article>
      <article><span>Pending review</span><strong>{pending}</strong><small>Transactions and stocktakes</small></article>
    </div>
    <div className="chart-grid">
      <section className="panel chart-card">
        <div className="chart-heading"><div><h2>Stock movements</h2><p>Receipts and issues over the last 7 days</p></div>
          <div className="chart-key"><span><i />Received</span><span><i />Issued</span></div></div>
        <div className="bar-chart" role="img" aria-label={trend.map(d => d.label + ': received ' + kg(d.received) + ', issued ' + kg(d.issued)).join('; ')}>
          <div className="axis" aria-hidden="true">{[4, 3, 2, 1, 0].map(x => <span key={x}>{amount(x * step)}</span>)}</div>
          <div className="chart-main" aria-hidden="true">
            <div className="plot">{trend.map(d => <div className="bar-group" key={d.iso} title={d.label + ' · ' + kg(d.received) + ' received · ' + kg(d.issued) + ' issued'}>
              <div className="bar received" style={{ height: d.received / ceiling * 100 + '%' }} />
              <div className="bar issued" style={{ height: d.issued / ceiling * 100 + '%' }} />
            </div>)}</div>
            <div className="days">{trend.map(d => <span key={d.iso}>{d.label}</span>)}</div>
          </div>
        </div>
      </section>
      <section className="panel chart-card stock-chart">
        <div className="chart-heading"><div><h2>Stock by status</h2><p>On hand and in transit</p></div></div>
        <div className="donut" aria-hidden="true" style={{ background: allStock ? 'conic-gradient(' + stops.join(', ') + ')' : '#edf0ec' }}>
          <div><strong>{amount(allStock)}</strong><span>kg tracked</span></div>
        </div>
        <ul className="donut-key">{states.map((state, i) => <li key={state.label}><span><i style={{ background: colors[i] }} />{state.label}</span><strong>{kg(state.value)}</strong></li>)}</ul>
      </section>
    </div>
    <div className="dashboard-lower">
      <section className="panel city-panel"><div className="panel-heading"><h2>{location ? 'City balance' : 'Stock by city'}</h2>
        {location && <button type="button" className="text-button city-clear" onClick={() => onLocation('')}>Show all cities</button>}</div>
        <ul className="city-balances">{cities.map(city => <li key={city.city}>
          <div><button className="text-button" type="button" onClick={() => onLocation(city.city)}>{city.city}</button><strong>{kg(city.physical)}</strong></div>
          <div className="city-bar" aria-hidden="true"><i style={{ width: city.physical / highestCity * 100 + '%' }} /></div>
          <small>{kg(city.available)} available · {kg(city.transit)} in transit from this city</small>
        </li>)}</ul>
      </section>
      <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><a className="text-link" href={'#audit-trail' + scope}>View audit trail →</a></div>
        <Timeline data={scopedData} limit={6} onOpen={onOpen} />
      </section>
    </div>
  </>
}

export function Inventory({ data, initialLocation, onOpen }: { data: Transaction[]; initialLocation: string; onOpen: (t: Transaction) => void }) {
  const [location, setLocation] = useState(initialLocation)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Position>()
  const rows = inventory(data).filter(p => onHand(p) || p.transit)
  const filtered = rows.filter(p => (!location || p.location === location) &&
    (p.lot + ' ' + p.species).toLowerCase().includes(query.trim().toLowerCase()))
  const detail = selected && rows.find(p => p.lot === selected.lot && p.location === selected.location)
  return <>
    <Heading title="Inventory" subtitle="Inspect stock quantities, storage locations and batch histories." />
    <section className="panel">
      <div className="panel-heading toolbar"><h2>Batch balances <span className="count">{filtered.length}</span></h2>
        <div className="filters"><label className="compact-field">Search batches<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Batch or species" /></label>
          <FilterLocation value={location} onChange={setLocation} locations={locations} /></div></div>
      {filtered.length ? <div className="table-scroll"><table>
        <thead><tr><th>Batch / Species</th><th>Location</th><th className="num">On hand</th><th className="num">Available</th><th className="num">Held</th><th className="num">Spoiled</th><th className="num">In transit</th></tr></thead>
        <tbody>{filtered.map(p => <tr key={p.lot + p.location}>
          <td><button className="text-button" onClick={() => setSelected(p)}>{p.lot}</button><small>{p.species}</small></td><td>{p.location}</td>
          {[onHand(p), p.available, p.held, p.spoiled, p.transit].map((quantity, i) => <td key={i} className="num">{kg(quantity)}</td>)}
        </tr>)}</tbody>
      </table></div> : <Empty>No stock matches the selected filters.</Empty>}
    </section>
    {detail && <Drawer title={detail.lot} onClose={() => setSelected(undefined)}>
      <p className="drawer-subtitle">{detail.species} · {detail.location}</p>
      <dl className="details-grid">{[['On hand', onHand(detail)], ['Available', detail.available], ['Held', detail.held], ['Spoiled', detail.spoiled], ['In transit', detail.transit]].map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{kg(Number(value))}</dd></div>)}</dl>
      <h3>Batch history</h3>
      <Timeline data={data.filter(t => t.lot === detail.lot)} onOpen={t => { setSelected(undefined); onOpen(t) }} />
    </Drawer>}
  </>
}

