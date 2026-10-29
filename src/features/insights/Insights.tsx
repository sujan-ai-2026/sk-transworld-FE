import { useMemo, useState } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { deriveAlerts, calculateFinancialStatements, calculateDashboardKpis } from '../../domain/calculations.ts'
import { useAppState } from '../../state/AppContext.tsx'

const tone = (severity: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => severity === 'High' ? 'danger' : severity === 'Medium' ? 'warning' : 'info'

export function AlertsPage({ navigate }: { navigate: (path: string) => void }) {
  const { state } = useAppState()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const alerts = useMemo(() => deriveAlerts(state), [state])
  const visible = alerts.filter((alert) => (filter === 'all' || alert.type === filter) && `${alert.title} ${alert.description} ${alert.recipientRole ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const alertTypes = [...new Set(alerts.map((alert) => alert.type))]
  return <><PageHeader eyebrow="Insights" title="Alerts & Follow-ups" description="Deterministic alerts derived from shared records and the configurable demo date. Resolving a source condition removes or updates its alert." /><Card><div className="filter-bar"><input aria-label="Search alerts" onChange={(event) => setQuery(event.target.value)} placeholder="Search title, source or recipient..." value={query} /><select aria-label="Filter alerts" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">All alert types</option>{alertTypes.map((type) => <option key={type} value={type}>{type.replaceAll('-', ' ')}</option>)}</select><StatusBadge tone="warning">{visible.length} active</StatusBadge></div><DataTable headers={['Severity', 'Alert', 'Source record', 'Job Number', 'Due date', 'Recipient', 'Status', 'Action']} rows={visible.map((alert) => [<StatusBadge tone={tone(alert.severity)}>{alert.severity}</StatusBadge>, <div><strong>{alert.title}</strong><small className="table-secondary">{alert.description}</small></div>, `${alert.sourceRecordType ?? alert.type} · ${alert.sourceRecordId ?? '—'}`, alert.jobId ? state.jobs.find((job) => job.id === alert.jobId)?.jobNumber : '—', alert.dueDate ?? '—', alert.recipientRole ?? 'operations', <StatusBadge tone={alert.resolved ? 'success' : 'warning'}>{alert.resolved ? 'Resolved' : 'Active'}</StatusBadge>, alert.actionPath ? <Button variant="ghost" onClick={() => navigate(alert.actionPath!)}>Open source</Button> : '—'])} /></Card></>
}

export function AssumptionsPage() {
  const { state } = useAppState()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const rows = state.assumptions.filter((assumption) => (status === 'all' || assumption.status === status) && `${assumption.id} ${assumption.description} ${assumption.reason} ${assumption.affectedModules.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <><PageHeader eyebrow="Administration" title="Assumptions Register" description="Demo behaviours and unresolved client decisions. Simulations are not represented as production integrations or compliance." /><Card><div className="filter-bar"><input aria-label="Search assumptions" onChange={(event) => setQuery(event.target.value)} placeholder="Search assumptions..." value={query} /><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="demo-assumption">Demo assumption</option><option value="awaiting-confirmation">Awaiting confirmation</option></select></div><DataTable headers={['Assumption ID', 'Description', 'Reason', 'Affected module', 'Demo behaviour', 'Configurable value', 'Status']} rows={rows.map((assumption) => [assumption.id, assumption.description, assumption.reason, assumption.affectedModules.join(', '), assumption.demoBehaviour, assumption.value ?? '—', <StatusBadge tone={assumption.status === 'demo-assumption' ? 'info' : 'warning'}>{assumption.status}</StatusBadge>])} /></Card></>
}

export function ReportsPage() {
  const { state } = useAppState()
  const kpis = calculateDashboardKpis(state)
  const [period, setPeriod] = useState(state.demoDate.slice(0, 7))
  const financials = calculateFinancialStatements(state, period)
  const periodTrips = state.trips.filter((trip) => (trip.actualPickup ?? trip.plannedPickup ?? state.demoDate).startsWith(period))
  const periodCharges = state.charges.filter((charge) => (charge.createdAt ?? state.demoDate).startsWith(period))
  return <><PageHeader eyebrow="Insights" title="Operational & Financial Reports" description="Management summaries use shared mock records and deterministic calculations." /><div className="filter-bar"><FormField label="Reporting period"><input onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></FormField><StatusBadge tone="warning">Simulated management reporting</StatusBadge></div><div className="kpi-grid kpi-grid--dense">{[['Deliveries', kpis.deliveriesToday], ['Containers at port', kpis.containersArriving], ['Customs pending', kpis.customsPending], ['Unbilled charges', kpis.uninvoicedCharges]].map(([label, value]) => <Card className="kpi-card" key={label}><p>{label}</p><strong>{value}</strong></Card>)}</div><div className="content-grid content-grid--wide"><Card><p className="eyebrow">Operational performance · {period}</p><h2>Trips and shipment follow-ups</h2><DataTable headers={['Trip', 'Job', 'Status', 'Billing', 'Costs']} rows={periodTrips.map((trip) => [trip.tripNumber, state.jobs.find((job) => job.id === trip.jobId)?.jobNumber, trip.status, `RM ${trip.billingAmount}`, `RM ${trip.truckingCost + trip.tollCost + trip.otherCost}`])} /></Card><Card><p className="eyebrow">Financial snapshot</p><h2>Shared ledger totals</h2><DataTable headers={['Measure', 'Amount']} rows={[['Recognised invoice revenue', `RM ${financials.revenue.toLocaleString('en-MY')}`], ['Approved / posted supplier costs', `RM ${financials.costs.toLocaleString('en-MY')}`], ['Gross profit indicator', `RM ${financials.grossProfit.toLocaleString('en-MY')}`], ['Receivables', `RM ${financials.receivables.toLocaleString('en-MY')}`], ['Supplier payables', `RM ${financials.payables.toLocaleString('en-MY')}`], ['Charges created this period', String(periodCharges.length)]]} /></Card></div></>
}
