import { useState, type ReactElement } from 'react'
import { getNavigationItem, logisticsNavigation, portalLinks } from '../../app/navigation.ts'
import { calculateDashboardKpis, calculateInvoiceTotals, calculateJobFinancials, calculateQuotationTotals, deriveAlerts } from '../../domain/calculations.ts'
import type { ActivityEvent, Customer, Quotation, QuotationLine, QuotationRequest, ServiceType, Supplier } from '../../domain/types.ts'
import { Button, Card, DataTable, FormField, EmptyModule, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { useAppState } from '../../state/AppContext.tsx'
import { generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { JobManagement } from '../jobs/JobManagement.tsx'
import { OperationsModules } from '../operations/OperationsModules.tsx'
import { WarehouseDocuments } from '../warehouse/WarehouseDocuments.tsx'
import { BillingManagement } from '../billing/BillingManagement.tsx'
import { FinancialManagement } from '../finance/FinancialManagement.tsx'
import { AlertsPage, AssumptionsPage, ReportsPage } from '../insights/Insights.tsx'
import { DemoWalkthrough } from './DemoWalkthrough.tsx'

const serviceOptions: ServiceType[] = ['freight', 'customs', 'haulage', 'warehouse', 'other']
const toneForStatus = (status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' =>
  status === 'accepted' || status === 'approved' || status === 'active' ? 'success' : status === 'rejected' || status === 'inactive' ? 'danger' : status === 'sent' || status === 'quoted' || status === 'in-progress' ? 'info' : 'warning'
const nextId = (prefix: string, count: number) => `${prefix}-${String(count + 1).padStart(4, '0')}`
const addDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function Dashboard({ navigate }: { navigate: (path: string) => void }) {
  const [serviceFilter, setServiceFilter] = useState('all')
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('all')
  const { state, dispatch } = useAppState()
  const kpis = calculateDashboardKpis(state)
  const activeAlerts = deriveAlerts(state).filter((alert) => !alert.resolved)
  const edoPending = state.customsRecords.filter((record) => record.edoStatus === 'pending')
  const supplierPayables = state.supplierInvoices.filter((invoice) => invoice.paymentStatus !== 'paid').reduce((sum, invoice) => sum + invoice.amount, 0)
  const approvedInvoices = state.customerInvoices.filter((invoice) => ['approved', 'finalised', 'paid'].includes(invoice.status))
  const revenue = approvedInvoices.reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
  const revenueToday = state.customerInvoices.filter((invoice) => invoice.issueDate === state.demoDate && ['approved', 'finalised', 'paid'].includes(invoice.status)).reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
  const revenueMonth = state.customerInvoices.filter((invoice) => invoice.issueDate.startsWith(state.demoDate.slice(0, 7)) && ['approved', 'finalised', 'paid'].includes(invoice.status)).reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
  const profit = state.jobs.reduce((sum, job) => sum + calculateJobFinancials(state, job.id).grossProfit, 0)
  const shipments = state.shipments.filter((shipment) =>
    (serviceFilter === 'all' || state.jobs.find((job) => job.id === shipment.jobId)?.serviceType === serviceFilter) &&
    (shipmentStatusFilter === 'all' || shipment.status === shipmentStatusFilter),
  )
  const operationalMetrics = [
    ['Active jobs (Today)', String(state.jobs.filter((job) => !['completed', 'cancelled'].includes(job.status)).length), 'Work in progress', '/app/jobs'],
    ['Open quotation requests', String(state.quotationRequests.filter((request) => ['new', 'submitted', 'quoted', 'revision-requested'].includes(request.status)).length), 'Commercial review and customer response', '/app/quotations'],
    ['Containers at port (Today)', String(kpis.containersArriving), 'Movement and free-time monitoring', '/app/containers'],
    ['Customs pending (Today)', String(kpis.customsPending), `${edoPending.length} EDO release follow-ups`, '/app/customs'],
    ['Trips to deliver (Today)', String(kpis.trucksRequired), `${kpis.deliveriesToday} completed today`, '/app/haulage'],
  ]
  const financialMetrics = [
    ['Revenue · (Today)', revenueToday, 'Approved invoices issued on demo date'],
    ['Revenue · month to date (Today)', revenueMonth, `Invoice issue month ${state.demoDate.slice(0, 7)}`],
    ['Outstanding customer balance (Today)', kpis.outstandingBalance, 'Invoice total less posted receipts'],
    ['Supplier payables (Today)', supplierPayables, 'Unpaid supplier invoices'],
    ['Gross profit · all jobs (Today)', profit, 'Approved charges less approved actual costs'],
  ]
  const departments = ['freight', 'customs', 'haulage', 'warehouse', 'other'] as const
  const departmentRevenue = departments.map((service) => {
    const jobIds = new Set(state.jobs.filter((job) => job.serviceType === service).map((job) => job.id))
    const amount = approvedInvoices.filter((invoice) => jobIds.has(invoice.jobId)).reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
    return { service, amount }
  })
  const money = (amount: number) => `RM ${amount.toLocaleString('en-MY')}`
  const renderMetrics = (metrics: string[][]) => <div className="kpi-grid kpi-grid--dense">{metrics.map(([label, value, meta, path]) => <button aria-label={`${label}: ${value}. ${meta}. Open details.`} className="metric-card" key={label} onClick={() => navigate(path)} type="button"><span>{label}</span><strong>{value}</strong><small>{meta} ↗</small></button>)}</div>
  return <><PageHeader eyebrow="Management overview · demo data" title="Operations at a glance" description={``} /><Card className="executive-filters"><div><p className="eyebrow">Executive filters</p><strong>Review the shared operational picture</strong></div><div className="executive-filter-fields"><FormField label="Demo date"><input type="date" onChange={(event) => dispatch({ type: 'set-demo-date', date: event.target.value })} value={state.demoDate} /></FormField><FormField label="Service"><select onChange={(event) => setServiceFilter(event.target.value)} value={serviceFilter}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select></FormField><FormField label="Shipment status"><select onChange={(event) => setShipmentStatusFilter(event.target.value)} value={shipmentStatusFilter}><option value="all">All statuses</option><option value="Booked">Booked</option><option value="In-Transit">In transit</option><option value="delivered">Delivered</option><option value="delayed">Delayed</option></select></FormField></div></Card><div className="dashboard-quick-actions-top"><Card><div className="section-heading"><div><p className="eyebrow">Quick actions</p><h2>Start common tasks</h2></div></div><div className="quick-actions"><Button onClick={() => navigate('/app/jobs')}>＋ Create job</Button><Button variant="outline" onClick={() => navigate('/app/quotations')}>New quotation</Button><Button variant="outline" onClick={() => navigate('/app/billing')}>Review billing</Button><Button variant="outline" onClick={() => navigate('/app/alerts')}>View alerts ({activeAlerts.length})</Button></div></Card></div><section className="dashboard-section"><div className="section-heading"><div><h2>Operational KPIs</h2></div><StatusBadge tone="info">Live from shared records</StatusBadge></div>{renderMetrics(operationalMetrics)}</section><section className="dashboard-section"><div className="section-heading"><div><h2>Financial summary</h2></div><StatusBadge tone="success">{state.customerInvoices.length} invoices</StatusBadge></div><div className="financial-kpi-grid">{financialMetrics.map(([label, value, description], index) => <Card className={`financial-kpi financial-kpi--${index}`} key={label}><span>{label}</span><strong>{money(Number(value))}</strong><small>{description}</small></Card>)}</div></section><div className="dashboard-lower-grid"><Card><div className="section-heading"><div><h2>Department revenue</h2></div><Button variant="outline" onClick={() => navigate('/app/reports')}>View reports</Button></div><div className="department-revenue">{departmentRevenue.map(({ service, amount }) => <button key={service} onClick={() => navigate('/app/reports')} type="button"><span><i aria-hidden="true" />{service}</span><strong>{money(amount)}</strong></button>)}</div><p className="assumption-note">Revenue is grouped by job service from approved/finalised/paid customer invoices; invoice issue date filters above apply to summary cards only.</p></Card></div><Card className="dashboard-shipments"><div className="section-heading"><div><h2>Shipment activity</h2><p className="card-copy">Filtered by the controls above · select a shipment to review operations.</p></div><Button variant="outline" onClick={() => navigate('/app/forwarding')}>Open forwarding</Button></div>{shipments.length ? <DataTable headers={['Job Number', 'Shipment', 'Customer', 'Route', 'ETA', 'Status', 'Container', 'Action']} rows={shipments.map((shipment) => { const job = state.jobs.find((item) => item.id === shipment.jobId); return [job?.jobNumber ?? '—', shipment.reference, state.customers.find((item) => item.id === job?.customerId)?.name ?? '—', `${shipment.origin} → ${shipment.destination}`, shipment.eta, <StatusBadge tone={toneForStatus(shipment.status)}>{shipment.status}</StatusBadge>, state.containers.find((item) => item.shipmentId === shipment.id)?.containerNumber ?? '—', <Button variant="ghost" onClick={() => navigate('/app/forwarding')}>View</Button>] })} /> : <p className="empty-state">No shipments match the selected filters.</p>}</Card><div className="content-grid content-grid--wide dashboard-alerts"><Card><div className="section-heading"><div><h2>Items requiring attention</h2></div><Button variant="outline" onClick={() => navigate('/app/alerts')}>All alerts ({activeAlerts.length})</Button></div>{activeAlerts.length ? <DataTable headers={['Type', 'Source record', 'Job Number', 'Priority', 'Action']} rows={activeAlerts.slice(0, 6).map((alert) => [alert.type.replaceAll('-', ' '), alert.sourceRecordId ?? 'Cross-module', alert.jobId ? state.jobs.find((job) => job.id === alert.jobId)?.jobNumber ?? '—' : '—', <StatusBadge tone={alert.severity === 'High' ? 'danger' : 'warning'}>{alert.severity}</StatusBadge>, <Button variant="ghost" onClick={() => navigate(alert.actionPath ?? '/app/alerts')}>{alert.title}</Button>])} /> : <p className="empty-state">No active follow-ups. Operational records are up to date.</p>}</Card><Card><div className="section-heading"><div><h2>Invoice summary</h2></div></div><div className="finance-summary"><div><span>Today · issue date</span><strong>{money(revenueToday)}</strong></div><div><span>Month to date</span><strong>{money(revenueMonth)}</strong></div><div><span>Recognised · all time</span><strong>{money(revenue)}</strong></div></div><p className="assumption-note">Management reports use simplified demo accounting and shared mock records.</p><Button variant="outline" onClick={() => navigate('/app/financial-statements')}>Financial statements</Button></Card></div></>
}

function CustomerForm({ existing, onSave, onCancel }: { existing?: Customer; onSave: (customer: Customer) => void; onCancel: () => void }) {
  const { state } = useAppState()
  const [form, setForm] = useState<Customer>(existing ?? { id: nextId('cus', state.customers.length), code: `CUST-${String(state.customers.length + 1).padStart(3, '0')}`, name: '', contactName: '', email: '', paymentTermsDays: 30, storageRuleId: 'storage-cbm', status: 'active' })
  const [error, setError] = useState('')
  const update = (key: keyof Customer, value: string) => setForm((current) => ({ ...current, [key]: key === 'paymentTermsDays' ? Number(value) : value }))
  return <Card className="form-card"><div className="section-heading"><div><p className="eyebrow">Customer record</p><h2>{existing ? 'Edit customer' : 'New customer'}</h2></div></div><div className="form-grid"><FormField label="Customer name"><input value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField><FormField label="Billing contact"><input value={form.contactName} onChange={(event) => update('contactName', event.target.value)} /></FormField><FormField label="Billing email"><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField><FormField label="Payment terms (days)"><input min="0" type="number" value={form.paymentTermsDays} onChange={(event) => update('paymentTermsDays', event.target.value)} /></FormField><FormField label="Rate / tariff reference"><select value={form.storageRuleId ?? ''} onChange={(event) => update('storageRuleId', event.target.value)}><option value="storage-cbm">Customer A · RM 3/CBM/day · 3 free days</option><option value="storage-pallet">Customer B · RM 8/pallet/day</option><option value="storage-carton">Customer C · RM 5/carton/month</option></select></FormField><FormField label="Status"><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button onClick={() => { if (!form.name.trim() || !form.email.includes('@') || !form.contactName.trim()) { setError('Name, billing contact and a valid email are required.'); return } onSave(form) }}>Save customer</Button></div></Card>
}

function CustomersPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | Customer['status']>('all')
  const [selected, setSelected] = useState<Customer | undefined>()
  const [editing, setEditing] = useState(false)
  const customers = state.customers.filter((customer) => (!query || `${customer.name} ${customer.code} ${customer.email}`.toLowerCase().includes(query.toLowerCase())) && (status === 'all' || customer.status === status))
  if (editing) return <><PageHeader eyebrow="Master data" title={selected ? 'Edit customer' : 'Create customer'} description="Maintain the shared customer master record used by jobs, quotations and invoices." /><CustomerForm existing={selected} onCancel={() => setEditing(false)} onSave={(customer) => { dispatch({ type: selected ? 'update-customer' : 'add-customer', customer }); setEditing(false); setSelected(customer); showToast('Customer saved to the shared demo data.') }} /></>
  return <><PageHeader eyebrow="Master data" title="Customers" description="Search and maintain customer contacts, billing terms and rate references." actions={<Button onClick={() => { setSelected(undefined); setEditing(true) }}>＋ New customer</Button>} /><Card><div className="filter-bar"><input aria-label="Search customers" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID or email..." value={query} /><select aria-label="Filter customer status" onChange={(event) => setStatus(event.target.value as 'all' | Customer['status'])} value={status}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div><DataTable headers={['Customer ID', 'Name', 'Billing contact', 'Email', 'Terms', 'Tariff', 'Status', 'Action']} rows={customers.map((customer) => [customer.code, customer.name, customer.contactName, customer.email, `${customer.paymentTermsDays} days`, state.storageRules.find((rule) => rule.id === customer.storageRuleId)?.rate ? `RM ${state.storageRules.find((rule) => rule.id === customer.storageRuleId)?.rate}` : 'Standard', <StatusBadge tone={toneForStatus(customer.status)}>{customer.status}</StatusBadge>, <Button variant="ghost" onClick={() => { setSelected(customer); setEditing(true) }}>Edit</Button>])} /></Card></>
}

function SuppliersPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Supplier | undefined>()
  const suppliers = state.suppliers.filter((supplier) => `${supplier.name} ${supplier.code} ${supplier.serviceType}`.toLowerCase().includes(query.toLowerCase()))
  const save = (supplier: Supplier) => { dispatch({ type: selected ? 'update-supplier' : 'add-supplier', supplier }); setEditing(false); showToast('Supplier saved to the shared demo data.') }
  if (editing) return <><PageHeader eyebrow="Master data" title={selected ? 'Edit supplier' : 'Create supplier'} description="Maintain supplier service records separately from customer selling rates." actions={<Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>} /><SupplierForm existing={selected} onSave={save} /></>
  return <><PageHeader eyebrow="Master data" title="Suppliers" description="Manage service providers, supplier costs and payable references." actions={<Button onClick={() => { setSelected(undefined); setEditing(true) }}>＋ New supplier</Button>} /><Card><div className="filter-bar"><input aria-label="Search suppliers" onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers..." value={query} /></div><DataTable headers={['Supplier ID', 'Supplier', 'Service', 'Contact', 'Costs', 'Invoices', 'Action']} rows={suppliers.map((supplier) => [supplier.code, supplier.name, supplier.serviceType, supplier.contactName, `RM ${state.supplierCosts.filter((cost) => cost.supplierId === supplier.id).reduce((sum, cost) => sum + cost.amount, 0).toLocaleString('en-MY')}`, String(state.supplierInvoices.filter((invoice) => invoice.supplierId === supplier.id).length), <Button variant="ghost" onClick={() => { setSelected(supplier); setEditing(true) }}>Edit</Button>])} /></Card></>
}

function SupplierForm({ existing, onSave }: { existing?: Supplier; onSave: (supplier: Supplier) => void }) {
  const { state } = useAppState()
  const [form, setForm] = useState<Supplier>(existing ?? { id: nextId('sup', state.suppliers.length), code: `SUP-${String(state.suppliers.length + 1).padStart(3, '0')}`, name: '', serviceType: 'haulage', contactName: '', email: '', status: 'active' })
  const update = (key: keyof Supplier, value: string) => setForm((current) => ({ ...current, [key]: value }))
  return <Card className="form-card"><div className="form-grid"><FormField label="Supplier name"><input value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField><FormField label="Contact"><input value={form.contactName} onChange={(event) => update('contactName', event.target.value)} /></FormField><FormField label="Email"><input value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField><FormField label="Service category"><select value={form.serviceType} onChange={(event) => update('serviceType', event.target.value)}>{serviceOptions.map((option) => <option key={option}>{option}</option>)}</select></FormField><FormField label="Status"><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField></div><div className="form-actions"><Button onClick={() => form.name.trim() && form.contactName.trim() && form.email.includes('@') ? onSave(form) : undefined}>Save supplier</Button></div></Card>
}

function QuotationForm({ existing, onDone }: { existing?: Quotation; onDone: () => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [customerId, setCustomerId] = useState(existing?.customerId ?? state.customers[0]?.id ?? '')
  const [reference, setReference] = useState(existing?.reference ?? `QT-${state.demoDate.replaceAll('-', '').slice(2)}-${String(state.quotations.length + 1).padStart(3, '0')}`)
  const [validUntil, setValidUntil] = useState(existing?.validUntil ?? '2026-11-28')
  const [lines, setLines] = useState<QuotationLine[]>(existing?.lines ?? [{ id: 'line-1', description: '', serviceType: 'haulage', quantity: 1, unit: 'trip', unitPrice: 0, discount: 0, taxRate: 0 }])
  const totals = calculateQuotationTotals(lines)
  const updateLine = (id: string, key: keyof QuotationLine, value: string) => setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: ['quantity', 'unitPrice', 'discount', 'taxRate'].includes(key) ? Number(value) : value } : line))
  const save = (status: Quotation['status']) => { if (!customerId || !reference.trim() || !validUntil || lines.some((line) => !line.description.trim() || line.quantity <= 0 || line.unitPrice < 0)) { showToast('Complete the customer, validity date and all line fields.'); return } const quotation: Quotation = { id: existing?.id ?? nextId('quo', state.quotations.length), reference, customerId, issueDate: existing?.issueDate ?? state.demoDate, validUntil, status, lines }; dispatch({ type: existing ? 'update-quotation' : 'add-quotation', quotation }); showToast(status === 'draft' ? 'Quotation draft saved.' : 'Quotation submitted for simulated review.'); onDone() }
  return <Card className="form-card"><div className="form-grid form-grid--three"><FormField label="Customer"><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></FormField><FormField label="Quotation reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></FormField><FormField label="Valid until"><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></FormField></div><div className="section-heading line-heading"><div><p className="eyebrow">Selling rates</p><h2>Quotation lines</h2></div><Button variant="secondary" onClick={() => setLines((current) => [...current, { id: `line-${current.length + 1}`, description: '', serviceType: 'haulage', quantity: 1, unit: 'trip', unitPrice: 0, discount: 0, taxRate: 0 }])}>＋ Add line</Button></div><div className="quotation-lines">{lines.map((line, index) => <div className="quotation-line" key={line.id}><span className="line-number">{index + 1}</span><FormField label="Description"><input value={line.description} onChange={(event) => updateLine(line.id, 'description', event.target.value)} /></FormField><FormField label="Service"><select value={line.serviceType} onChange={(event) => updateLine(line.id, 'serviceType', event.target.value)}>{serviceOptions.map((option) => <option key={option}>{option}</option>)}</select></FormField><FormField label="Qty"><input min="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, 'quantity', event.target.value)} /></FormField><FormField label="Unit"><input value={line.unit} onChange={(event) => updateLine(line.id, 'unit', event.target.value)} /></FormField><FormField label="Rate (RM)"><input min="0" type="number" value={line.unitPrice} onChange={(event) => updateLine(line.id, 'unitPrice', event.target.value)} /></FormField><FormField label="Discount"><input min="0" type="number" value={line.discount} onChange={(event) => updateLine(line.id, 'discount', event.target.value)} /></FormField><button aria-label={`Remove line ${index + 1}`} className="remove-line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} type="button">×</button></div>)}</div><div className="quote-total"><span>Subtotal <strong>RM {totals.subtotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span><span>Tax <strong>RM {totals.tax.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span><span>Total <strong>RM {totals.total.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span></div><div className="form-actions"><Button variant="secondary" onClick={() => save('draft')}>Save draft</Button><Button onClick={() => save('sent')}>Submit / send</Button></div></Card>
}

function RequestQuotationEditor({ request, onClose }: { request: QuotationRequest; onClose: () => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const relatedQuotes = state.quotations.filter((quotation) => quotation.requestId === request.id).sort((a, b) => (a.version ?? 1) - (b.version ?? 1))
  const draft = [...relatedQuotes].reverse().find((quotation) => quotation.status === 'draft')
  const previous = draft?.replacesQuotationId
    ? relatedQuotes.find((quotation) => quotation.id === draft.replacesQuotationId)
    : [...relatedQuotes].reverse().find((quotation) => quotation.status === 'revision-requested')
  const dateCode = state.demoDate.replaceAll('-', '').slice(2)
  let nextReferenceNumber = state.quotations.length + 1
  let defaultReference = `QT-${dateCode}-${String(nextReferenceNumber).padStart(3, '0')}`
  while (state.quotations.some((quotation) => quotation.reference === defaultReference)) {
    nextReferenceNumber += 1
    defaultReference = `QT-${dateCode}-${String(nextReferenceNumber).padStart(3, '0')}`
  }
  const latestLines = previous?.lines
  const [reference, setReference] = useState(draft?.reference ?? defaultReference)
  const [validUntil, setValidUntil] = useState(draft?.validUntil ?? addDays(state.demoDate, 14))
  const [lines, setLines] = useState<QuotationLine[]>(draft?.lines ?? (latestLines
    ? latestLines.map((line, index) => ({ ...line, id: generateStableId('ql', [...state.quotations.flatMap((quotation) => quotation.lines), ...latestLines.slice(0, index)]) }))
    : [{ id: generateStableId('ql', state.quotations.flatMap((quotation) => quotation.lines)), description: `${request.serviceType} service · ${request.origin} to ${request.destination}`, serviceType: request.serviceType, quantity: request.containerQuantity || 1, unit: request.mode === 'FCL' ? 'container' : 'shipment', unitPrice: 0, discount: 0, taxRate: 0 }]))
  const totals = calculateQuotationTotals(lines)
  const updateLine = (id: string, key: keyof QuotationLine, value: string) => setLines((current) => current.map((line) => line.id === id
    ? { ...line, [key]: ['quantity', 'unitPrice', 'discount'].includes(key) ? Number(value) : value }
    : line))
  const appendLine = () => setLines((current) => [...current, { id: generateStableId('ql', state.quotations.flatMap((quotation) => quotation.lines).concat(current)), description: '', serviceType: request.serviceType, quantity: 1, unit: 'service', unitPrice: 0, discount: 0, taxRate: 0 }])

  const save = (send: boolean) => {
    const invalidLines = lines.some((line) => !line.description.trim() || !line.unit.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.discount) || line.discount < 0 || line.discount > line.quantity * line.unitPrice || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 1)
    if (!reference.trim() || !validUntil || validUntil < state.demoDate || invalidLines) {
      showToast('Add a valid reference, future validity date and complete service line rates, discounts and tax rates.')
      return
    }
    const version = draft?.version ?? (relatedQuotes.reduce((highest, quotation) => Math.max(highest, quotation.version ?? 1), 0) + 1)
    const quotation: Quotation = {
      id: draft?.id ?? generateRecordId(state, 'quotations'),
      reference: reference.trim(),
      customerId: request.customerId,
      requestId: request.id,
      version,
      replacesQuotationId: draft?.replacesQuotationId ?? previous?.id,
      issueDate: draft?.issueDate ?? state.demoDate,
      validUntil,
      status: send ? 'sent' : 'draft',
      lines,
    }
    const activity: ActivityEvent = {
      id: generateRecordId(state, 'activity'),
      entityType: 'quotation-request',
      entityId: request.id,
      action: send ? `Quotation ${quotation.reference} v${version} sent to customer` : `Quotation ${quotation.reference} v${version} saved as draft`,
      actor: 'Aina Noor',
      occurredAt: `${state.demoDate}T09:00:00Z`,
    }
    dispatch({ type: 'save-request-quotation', requestId: request.id, quotation, send, activity })
    showToast(send ? `Quotation ${quotation.reference} sent to the customer portal.` : `Quotation ${quotation.reference} draft saved.`)
    onClose()
  }

  const customer = state.customers.find((item) => item.id === request.customerId)
  return (
    <Card className="request-quotation-editor">
      <div className="section-heading"><div><p className="eyebrow">Request {request.requestNumber} · quotation {draft ? `v${draft.version}` : `v${relatedQuotes.length + 1}`}</p><h2>{customer?.name ?? 'Customer'} · {request.serviceType}</h2></div><Button variant="secondary" onClick={onClose}>Back to requests</Button></div>
      <div className="request-summary-grid">
        <span>Route<strong>{request.origin} → {request.destination}</strong></span>
        <span>Direction / mode<strong>{request.direction ?? '—'} · {request.mode ?? '—'}</strong></span>
        <span>Cargo<strong>{request.cargoDescription}</strong></span>
        <span>Requested dates<strong>{request.requestedPickupDate ?? '—'} → {request.requestedDeliveryDate ?? '—'}</strong></span>
        <span>Warehouse<strong>{request.warehouseRequired ? 'Required' : 'Not required'}</strong></span>
        <span>Instructions<strong>{request.instructions || 'None'}</strong></span>
      </div>
      {request.status === 'revision-requested' && <p className="form-hint">Customer revision feedback: {state.quotations.find((quotation) => quotation.id === request.quotationId)?.responseNote || 'Review the requested changes and prepare the next version.'}</p>}
      <div className="form-grid form-grid--three">
        <FormField label="Customer"><input readOnly value={customer?.name ?? ''} /></FormField>
        <FormField label="Quotation reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></FormField>
        <FormField label="Valid until"><input min={state.demoDate} type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></FormField>
      </div>
      <div className="section-heading line-heading"><div><p className="eyebrow">Customer pricing · surcharges can be separate lines</p><h3>Service lines and applicable taxes</h3></div><Button variant="secondary" onClick={appendLine}>＋ Add line</Button></div>
      <div className="quotation-lines">{lines.map((line, index) => <div className="quotation-line request-quotation-line" key={line.id}>
        <span className="line-number">{index + 1}</span>
        <FormField label="Service / surcharge"><input value={line.description} onChange={(event) => updateLine(line.id, 'description', event.target.value)} /></FormField>
        <FormField label="Service type"><select value={line.serviceType} onChange={(event) => updateLine(line.id, 'serviceType', event.target.value)}>{serviceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></FormField>
        <FormField label="Quantity"><input min="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, 'quantity', event.target.value)} /></FormField>
        <FormField label="Unit"><input value={line.unit} onChange={(event) => updateLine(line.id, 'unit', event.target.value)} /></FormField>
        <FormField label="Rate (RM)"><input min="0" type="number" value={line.unitPrice} onChange={(event) => updateLine(line.id, 'unitPrice', event.target.value)} /></FormField>
        <FormField label="Discount (RM)"><input min="0" type="number" value={line.discount} onChange={(event) => updateLine(line.id, 'discount', event.target.value)} /></FormField>
        <FormField label="Tax (%)"><input max="100" min="0" step="0.01" type="number" value={line.taxRate * 100} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, taxRate: Number(event.target.value) / 100 } : item))} /></FormField>
        <button aria-label={`Remove quotation line ${index + 1}`} className="remove-line" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} type="button">×</button>
      </div>)}</div>
      <div className="quote-total"><span>Subtotal <strong>RM {totals.subtotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span><span>Tax <strong>RM {totals.tax.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span><span>Total <strong>RM {totals.total.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong></span></div>
      <div className="form-actions"><Button variant="secondary" onClick={() => save(false)}>Save draft</Button><Button onClick={() => save(true)}>Save & send quotation</Button></div>
    </Card>
  )
}

function QuotationRequestWorkflow({ navigate }: { navigate: (path: string) => void }) {
  const { state } = useAppState()
  const [selectedId, setSelectedId] = useState('')
  const selected = state.quotationRequests.find((request) => request.id === selectedId)
  if (selected) {
    const revisions = state.quotations.filter((quotation) => quotation.requestId === selected.id).sort((a, b) => (a.version ?? 1) - (b.version ?? 1))
    const editable = ['new', 'submitted', 'revision-requested'].includes(selected.status) || revisions.some((quotation) => quotation.status === 'draft')
    const currentQuote = selected.quotationId && state.quotations.find((quotation) => quotation.id === selected.quotationId)
    return <section className="quotation-request-workflow">
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Customer quotation inbox</p><h2>{selected.requestNumber} · {selected.origin} → {selected.destination}</h2></div><Button variant="ghost" onClick={() => setSelectedId('')}>← All requests</Button></div>
        {editable
          ? <RequestQuotationEditor key={`${selected.id}-${revisions.filter((quote) => quote.status === 'draft').at(-1)?.id ?? revisions.length}`} request={selected} onClose={() => setSelectedId('')} />
          : currentQuote
            ? <div className="request-quote-readonly"><p className="detail-meta">{currentQuote.reference} · version {currentQuote.version ?? 1} · {currentQuote.status.replaceAll('-', ' ')} · valid until {currentQuote.validUntil}</p><DataTable headers={['Service line', 'Qty', 'Rate', 'Tax', 'Total']} rows={currentQuote.lines.map((line) => [line.description, `${line.quantity} ${line.unit}`, `RM ${line.unitPrice.toLocaleString('en-MY')}`, `${(line.taxRate * 100).toLocaleString('en-MY')}%`, `RM ${((line.quantity * line.unitPrice - line.discount) * (1 + line.taxRate)).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`])} /><details className="quotation-history" open><summary>Quotation version history · {revisions.length}</summary><ol>{revisions.map((quote) => <li key={quote.id}>v{quote.version ?? 1} · {quote.reference} · {quote.status.replaceAll('-', ' ')}</li>)}</ol></details></div>
            : <p className="form-hint">This request is {selected.status} and cannot be changed.</p>}
      </Card>
    </section>
  }
  return <section className="quotation-request-workflow">
    <Card>
      <div className="section-heading"><div><h2>Quotation request inbox</h2><p className="card-copy">Review a customer’s shipment details, prepare versioned rates and send them to the same customer account.</p></div><StatusBadge tone="info">{state.quotationRequests.filter((request) => !['accepted', 'rejected', 'converted'].includes(request.status)).length} open</StatusBadge></div>
      {state.quotationRequests.length ? <DataTable headers={['Request', 'Customer', 'Service / route', 'Cargo', 'Requested dates', 'Status', 'Quotation / job', 'Action']} rows={state.quotationRequests.map((request) => {
        const customer = state.customers.find((item) => item.id === request.customerId)
        const job = state.jobs.find((item) => item.id === request.jobId || item.quotationRequestId === request.id)
        const latest = request.quotationId && state.quotations.find((quotation) => quotation.id === request.quotationId)
        const status = request.status === 'new' || request.status === 'submitted' ? 'New Request' : request.status.replaceAll('-', ' ')
        return [
          request.requestNumber,
          customer?.name ?? 'Unknown',
          `${request.serviceType} · ${request.origin ?? '—'} → ${request.destination ?? '—'}`,
          request.cargoDescription,
          `${request.requestedPickupDate ?? '—'} → ${request.requestedDeliveryDate ?? '—'}`,
          <StatusBadge tone={toneForStatus(request.status)}>{status}</StatusBadge>,
          job ? <Button variant="ghost" onClick={() => navigate(`/app/jobs?jobId=${job.id}`)}>{job.jobNumber}</Button> : latest ? `${latest.reference} · v${latest.version ?? 1}` : 'Not quoted',
          job
            ? <Button variant="secondary" onClick={() => navigate(`/app/jobs?jobId=${job.id}`)}>Open job detail</Button>
            : ['accepted', 'rejected', 'converted'].includes(request.status)
              ? 'Closed'
              : <Button variant={request.status === 'revision-requested' || request.status === 'new' || request.status === 'submitted' ? 'primary' : 'secondary'} onClick={() => setSelectedId(request.id)}>{state.quotations.some((quotation) => quotation.requestId === request.id && quotation.status === 'draft') ? 'Continue draft' : latest && request.status === 'quoted' ? 'View quote' : 'Review / quote'}</Button>,
        ]
      })} /> : <p className="customer-empty">Customer quotation requests will appear here when submitted.</p>}
    </Card>
  </section>
}

function QuotationsPage({ navigate }: { navigate: (path: string) => void }) {
  const { state } = useAppState()
  const [filter, setFilter] = useState<'all' | Quotation['status']>('all')
  const [editing, setEditing] = useState<Quotation | null | undefined>(undefined)
  const [selected, setSelected] = useState<Quotation | undefined>()
  const rows = state.quotations.filter((quote) => filter === 'all' || quote.status === filter)
  const selectedJob = selected && state.jobs.find((job) => job.quotationId === selected.id)
  if (editing !== undefined) return <><PageHeader eyebrow="Commercial" title={editing ? 'Edit quotation' : 'New quotation'} description="Customer selling rates are kept separate from supplier costs and tariffs." actions={<Button variant="secondary" onClick={() => setEditing(undefined)}>← Back to list</Button>} /><QuotationForm existing={editing ?? undefined} onDone={() => setEditing(undefined)} /></>
  return <>
    <PageHeader eyebrow="Commercial" title="Quotations & Rates" description="Review customer requests, prepare customer rates, and preserve each sent quotation version." actions={<Button onClick={() => setEditing(null)}>＋ New quotation</Button>} />
    <Card>
      <div className="filter-bar">
        <select aria-label="Filter quotation status" onChange={(event) => setFilter(event.target.value as 'all' | Quotation['status'])} value={filter}>
          <option value="all">All statuses</option>
          {(['draft', 'sent', 'accepted', 'rejected', 'revision-requested', 'revised'] as Quotation['status'][]).map((status) => <option key={status} value={status}>{status.replaceAll('-', ' ')}</option>)}
        </select>
        <span className="filter-note">Customer responses are recorded in the Customer Portal. Supplier tariffs are maintained separately.</span>
      </div>
      <DataTable headers={['Reference / version', 'Customer', 'Request', 'Valid until', 'Lines', 'Total incl. tax', 'Status', 'Actions']} rows={rows.map((quote) => {
        const customer = state.customers.find((item) => item.id === quote.customerId)
        const request = quote.requestId ? state.quotationRequests.find((item) => item.id === quote.requestId) : undefined
        const linkedJob = state.jobs.find((job) => job.quotationId === quote.id)
        const total = calculateQuotationTotals(quote.lines).total
        return [
          `${quote.reference}${quote.version ? ` · v${quote.version}` : ''}`,
          customer?.name ?? 'Unknown',
          request?.requestNumber ?? '—',
          quote.validUntil,
          String(quote.lines.length),
          `RM ${total.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
          <StatusBadge tone={toneForStatus(quote.status)}>{quote.status.replaceAll('-', ' ')}</StatusBadge>,
          <div className="table-actions">
            <Button variant="ghost" onClick={() => setSelected(quote)}>Details</Button>
            {quote.status === 'draft' && !quote.requestId && <Button variant="ghost" onClick={() => setEditing(quote)}>Edit</Button>}
            {quote.status === 'sent' && <span className="form-hint">Awaiting customer response</span>}
            {linkedJob && <Button variant="ghost" onClick={() => navigate(`/app/jobs?jobId=${linkedJob.id}`)}>Job · {linkedJob.jobNumber}</Button>}
          </div>,
        ]
      })} />
    </Card>
    {selected && <Card className="detail-card">
      <div className="section-heading"><div><p className="eyebrow">Quotation detail · version {selected.version ?? 1}</p><h2>{selected.reference}</h2></div><Button variant="ghost" onClick={() => setSelected(undefined)}>Close</Button></div>
      <p className="detail-meta">{state.customers.find((customer) => customer.id === selected.customerId)?.name} · {selected.status.replaceAll('-', ' ')} · valid until {selected.validUntil}</p>
      {selected.requestId && <p className="form-hint">Request {state.quotationRequests.find((request) => request.id === selected.requestId)?.requestNumber}. Earlier versions remain in the quotation history.</p>}
      {selectedJob && <p className="form-hint">Linked job: {selectedJob.jobNumber}.</p>}
      <DataTable headers={['Description', 'Service', 'Qty', 'Rate', 'Discount', 'Tax', 'Line total']} rows={selected.lines.map((line) => [line.description, line.serviceType, `${line.quantity} ${line.unit}`, `RM ${line.unitPrice}`, `RM ${line.discount}`, `${(line.taxRate * 100).toLocaleString('en-MY')}%`, `RM ${(line.quantity * line.unitPrice - line.discount).toLocaleString('en-MY')}`])} />
      {selected.requestId && <details className="quotation-history"><summary>Request revision history</summary><ol>{state.quotations.filter((quote) => quote.requestId === selected.requestId).sort((a, b) => (a.version ?? 1) - (b.version ?? 1)).map((quote) => <li key={quote.id}>v{quote.version ?? 1} · {quote.reference} · {quote.status.replaceAll('-', ' ')} · valid to {quote.validUntil}</li>)}</ol></details>}
      <div className="activity-strip">Created {selected.issueDate}{selected.responseNote ? ` · Customer feedback: ${selected.responseNote}` : ''}</div>
    </Card>}
  </>
}

export function LogisticsPortal({ pathname, navigate, selectedJobId, selectedTripId }: { pathname: string; navigate: (path: string) => void; selectedJobId?: string; selectedTripId?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed] = useState(() => localStorage.getItem('clms-sidebar-collapsed') === 'true')
  const [search, setSearch] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const showToast = useToast()
  const current = getNavigationItem(pathname)
  const { state, resetDemo } = useAppState()
  const activeAlerts = deriveAlerts(state).filter((alert) => !alert.resolved)
  const filtered = logisticsNavigation.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
  const page = pathname === '/app/dashboard' ? <Dashboard navigate={navigate} /> : pathname === '/app/customers' ? <CustomersPage /> : pathname === '/app/suppliers' ? <SuppliersPage /> : pathname === '/app/quotations' ? <><QuotationRequestWorkflow navigate={navigate} /><QuotationsPage navigate={navigate} /></> : pathname === '/app/jobs' ? <JobManagement navigate={navigate} initialJobId={selectedJobId} /> : pathname === '/app/forwarding' ? <OperationsModules kind="forwarding" initialJobId={selectedJobId} /> : pathname === '/app/customs' ? <OperationsModules kind="customs" /> : pathname === '/app/containers' ? <OperationsModules kind="containers" /> : pathname === '/app/haulage' ? <OperationsModules kind="haulage" initialJobId={selectedJobId} initialTripId={selectedTripId} /> : pathname === '/app/warehouse' ? <WarehouseDocuments kind="warehouse" /> : pathname === '/app/documents' ? <WarehouseDocuments kind="documents" /> : pathname === '/app/billing' ? <BillingManagement /> : pathname === '/app/expenses' ? <FinancialManagement kind="expenses" /> : pathname === '/app/vouchers' ? <FinancialManagement kind="vouchers" /> : pathname === '/app/reconciliation' ? <FinancialManagement kind="reconciliation" /> : pathname === '/app/job-costing' ? <FinancialManagement kind="job-costing" /> : pathname === '/app/financial-statements' ? <FinancialManagement kind="statements" /> : pathname === '/app/reports' ? <ReportsPage /> : pathname === '/app/alerts' ? <AlertsPage navigate={navigate} /> : pathname === '/app/assumptions' ? <AssumptionsPage /> : <ModulePage path={pathname} />
  const NavIcon = ({ label }: { label: string }) => {
    const icons: Record<string, ReactElement> = {
      Dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
      'Customers': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      'Suppliers': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>,
      'Quotations & Rates': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
      'Jobs & Dockets': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>, // a simplified box icon
      'Freight Forwarding': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8"/><path d="M3 16l4 4 4-4"/><path d="M11 16l4 4 4-4"/><path d="M7 12V7"/><path d="M12 12V7"/><path d="M17 12V7"/></svg>,
      'Customs Clearance': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
      'Container Tracking': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
      'Haulage & Trips': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="13" width="22" height="8" rx="2"/><circle cx="7" cy="21" r="2"/><circle cx="17" cy="21" r="2"/><path d="M17 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/></svg>,
      'Warehouse & Inventory': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M3 8v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8"/><path d="M10 12H14"/><path d="M10 16H14"/><path d="M4 12H6"/><path d="M4 16H6"/></svg>,
      'Documents': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
      'Billing & Invoices': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
      'Expenses': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      'Payment Vouchers': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>,
      'Bank Reconciliation': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5"/><path d="m7 14 5-5 5 5"/></svg>,
      'Job Costing': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
      'Financial Statements': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17H9"/><path d="M18 13H9"/><path d="M18 9H9"/></svg>,
      'Reports': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
      'Alerts & Follow-ups': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h12.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      'Assumptions Register': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    };
    return icons[label] ?? <span className="nav-icon-fallback">{label.slice(0, 1)}</span>;
  };

  return <div className={`portal-shell${sidebarCollapsed ? ' portal-shell--collapsed' : ''}`}><aside className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`}><div className="sidebar-brand"><img src="/sk-logo.png" alt="SK Transworld Logo" className="brand-mark" />
  </div><div className="demo-pill"><span /> </div><nav className="sidebar-nav" aria-label="Logistics portal navigation">{['Overview', 'Master data', 'Commercial', 'Operations', 'Finance', 'Insights', 'Administration'].map((group) => { const items = filtered.filter((item) => item.group === group); return items.length ? <div className="nav-group" key={group}><p>{group}</p>{items.map((item) => <button aria-label={item.label} className={item.path === pathname ? 'nav-item nav-item--active' : 'nav-item'} key={item.path} onClick={() => { navigate(item.path); setMobileOpen(false) }} title={item.label} type="button"><span className="nav-icon" aria-hidden="true"><NavIcon label={item.label} /></span><span className="nav-label">{item.label}</span></button>)}</div> : null })}</nav><div className="sidebar-footer"><button className="portal-switch" onClick={() => navigate(portalLinks[0].path)} title="Customer Portal" type="button"><span>↗</span><div><strong>Customer Portal</strong><small>Open demo view</small></div></button><button className="portal-switch" onClick={() => navigate(portalLinks[1].path)} title="Driver App" type="button"><span>▣</span><div><strong>Driver App</strong><small>Open mobile view</small></div></button></div></aside>{mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" type="button" />}<main className="main-column"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" type="button">☰</button><div className="breadcrumb"><span>Logistics Portal</span><b>/</b><strong>{current.label}</strong></div>
  <div className="topbar-actions"><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Global search" onChange={(event) => setSearch(event.target.value)} placeholder="Search modules..." value={search} /></label><DemoWalkthrough navigate={navigate} /><button className="icon-button" aria-label={`Notifications: ${activeAlerts.length} active`} onClick={() => navigate('/app/alerts')} type="button">
  <span className="alert-icon-wrap">
    <svg className="alert-bell-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
    {activeAlerts.length > 0 && <span className="notification-indicator" />}
  </span>
</button><div className="user-menu-wrap"><button aria-expanded={userMenuOpen} className="user-menu" onClick={() => setUserMenuOpen((open) => !open)} type="button"><span className="avatar">AN</span><span className="user-copy"><strong>Aina Noor</strong><small>Operations admin</small></span><span aria-hidden="true">⌄</span></button>{userMenuOpen && <div className="user-menu-popover" role="menu"><p>SIMULATED AUTHENTICATION</p><strong>Aina Noor</strong><small>Operations admin · Demo role</small><button onClick={() => navigate('/customer')} type="button">Switch to Customer Portal <span>↗</span></button><button onClick={() => navigate('/driver')} type="button">Switch to Driver App <span>↗</span></button><button onClick={() => { if (window.confirm('Reset all shared CLMS demo data to the original seed?')) { resetDemo(); navigate('/app/dashboard'); setUserMenuOpen(false); showToast('Demo data restored to the deterministic seed.') } }} type="button">Reset demo data</button></div>}</div></div></header><div className="page-content">{page}</div></main></div>
}

function ModulePage({ path }: { path: string }) {
  const item = getNavigationItem(path)
  return <><PageHeader eyebrow={item.group} title={item.label} description={item.description} /><EmptyModule title={`${item.label} workspace`} description="This connected module will be implemented in a subsequent phase. Shared CLMS data is already available to the application." /></>
}
