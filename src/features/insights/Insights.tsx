import { useMemo, useState } from 'react'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import type { ChartOptions } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { deriveAlerts, calculateFinancialStatements, calculateDashboardKpis } from '../../domain/calculations.ts'
import { useAppState } from '../../state/AppContext.tsx'
import './Insights.css'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

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
  const reportableTrips = periodTrips.filter((trip) => trip.status !== 'cancelled')
  const tripResults = reportableTrips.map((trip) => {
    const costs = trip.truckingCost + trip.tollCost + trip.otherCost
    return { trip, costs, profit: trip.billingAmount - costs }
  })
  const periodCharges = state.charges.filter((charge) => (charge.createdAt ?? state.demoDate).startsWith(period))
  const trucksDeployed = new Set(reportableTrips.map((trip) => trip.truckId).filter((truckId): truckId is string => Boolean(truckId))).size
  const completedDeliveries = reportableTrips.filter((trip) => trip.status === 'completed').length
  const totalTripProfit = tripResults.reduce((total, result) => total + result.profit, 0)
  const lossMakingTrips = tripResults.filter((result) => result.profit < 0).length
  const currency = (amount: number) => `RM ${amount.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`
  const weeklyBuckets = [
    { label: '1-7', start: 1, end: 7 },
    { label: '8-14', start: 8, end: 14 },
    { label: '15-21', start: 15, end: 21 },
    { label: '22-28', start: 22, end: 28 },
    { label: '29-31', start: 29, end: 31 },
  ]
  const volumeData = {
    labels: weeklyBuckets.map((bucket) => bucket.label),
    datasets: [
      {
        label: 'Trips',
        data: weeklyBuckets.map((bucket) => reportableTrips.filter((trip) => {
          const day = Number((trip.actualPickup ?? trip.plannedPickup ?? state.demoDate).slice(8, 10))
          return day >= bucket.start && day <= bucket.end
        }).length),
        backgroundColor: '#3783FF',
        borderRadius: 5,
      },
      {
        label: 'Completed deliveries',
        data: weeklyBuckets.map((bucket) => reportableTrips.filter((trip) => {
          const day = Number((trip.actualPickup ?? trip.plannedPickup ?? state.demoDate).slice(8, 10))
          return trip.status === 'completed' && day >= bucket.start && day <= bucket.end
        }).length),
        backgroundColor: '#37A878',
        borderRadius: 5,
      },
    ],
  }
  const fleetData = {
    labels: ['Available', 'Assigned', 'Maintenance'],
    datasets: [{
      data: [
        state.trucks.filter((truck) => truck.status === 'available').length,
        state.trucks.filter((truck) => truck.status === 'assigned').length,
        state.trucks.filter((truck) => truck.status === 'maintenance').length,
      ],
      backgroundColor: ['#37A878', '#3783FF', '#EFB54A'],
      borderColor: '#FFFFFF',
      borderWidth: 3,
    }],
  }
  const profitData = {
    labels: tripResults.map(({ trip }) => trip.tripNumber),
    datasets: [{
      label: 'Profit / loss',
      data: tripResults.map(({ profit }) => profit),
      backgroundColor: tripResults.map(({ profit }) => profit < 0 ? '#D96966' : '#37A878'),
      borderRadius: 5,
    }],
  }
  const volumeOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  }
  const fleetOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
  }
  const profitOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (context) => ` ${currency(Number(context.raw))}` } },
    },
    scales: {
      x: { grid: { color: '#E8EDF5' }, ticks: { callback: (value) => currency(Number(value)) } },
      y: { grid: { display: false } },
    },
  }
  return <>
    <PageHeader eyebrow="Insights" title="Operational & Financial Reports" description="Management summaries use shared mock records and deterministic calculations." />
    <div className="filter-bar"><FormField label="Reporting period"><input onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></FormField><StatusBadge tone="warning">Simulated management reporting</StatusBadge></div>
    <div className="kpi-grid kpi-grid--dense">
      <Card className="kpi-card"><p>Completed deliveries</p><strong>{completedDeliveries}</strong></Card>
      <Card className="kpi-card"><p>Trucks deployed</p><strong>{trucksDeployed}</strong></Card>
      <Card className="kpi-card"><p>Trip profit / (loss)</p><strong>{currency(totalTripProfit)}</strong></Card>
      <Card className="kpi-card"><p>Loss-making trips</p><strong>{lossMakingTrips}</strong></Card>
    </div>
    <div className="reports-chart-grid">
      <Card className="reports-chart-card">
        <p className="eyebrow">Operational performance · {period}</p>
        <h2>Trips and completed deliveries</h2>
        <div className="reports-chart" role="img" aria-label={`Trips and completed deliveries by week for ${period}`}>
          <Bar data={volumeData} options={volumeOptions} />
        </div>
      </Card>
      <Card className="reports-chart-card">
        <p className="eyebrow">Fleet snapshot</p>
        <h2>Truck availability</h2>
        <div className="reports-chart reports-chart--doughnut" role="img" aria-label="Truck availability by current fleet status">
          <Doughnut data={fleetData} options={fleetOptions} />
        </div>
      </Card>
      <Card className="reports-chart-card reports-chart-card--wide">
        <p className="eyebrow">Trip economics · {period}</p>
        <h2>Profit and loss by trip</h2>
        {tripResults.length
          ? <div className="reports-chart reports-chart--profit" style={{ height: `${Math.min(360, Math.max(220, 48 + 36 * tripResults.length))}px` }} role="img" aria-label={`Profit or loss for each trip in ${period}`}>
            <Bar data={profitData} options={profitOptions} />
          </div>
          : <p className="reports-chart-empty">No trips recorded for this reporting period.</p>}
      </Card>
    </div>
    <div className="content-grid content-grid--wide">
      <Card><p className="eyebrow">Operational performance · {period}</p><h2>Trips and shipment follow-ups</h2><DataTable headers={['Trip', 'Job', 'Status', 'Billing', 'Costs']} rows={periodTrips.map((trip) => [trip.tripNumber, state.jobs.find((job) => job.id === trip.jobId)?.jobNumber, trip.status, currency(trip.billingAmount), currency(trip.truckingCost + trip.tollCost + trip.otherCost)])} /></Card>
      <Card><p className="eyebrow">Financial snapshot</p><h2>Shared ledger totals</h2><DataTable headers={['Measure', 'Amount']} rows={[['Recognised invoice revenue', currency(financials.revenue)], ['Approved / posted supplier costs', currency(financials.costs)], ['Gross profit indicator', currency(financials.grossProfit)], ['Receivables', currency(financials.receivables)], ['Supplier payables', currency(financials.payables)], ['Charges created this period', String(periodCharges.length)], ['Containers at port', String(kpis.containersArriving)], ['Customs pending', String(kpis.customsPending)], ['Unbilled charges', String(kpis.uninvoicedCharges)]]} /></Card>
    </div>
  </>
}
