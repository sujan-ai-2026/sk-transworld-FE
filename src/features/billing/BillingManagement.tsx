import { useMemo, useState } from 'react'
import { Button, Card, DataTable, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateInvoiceTotals, getAllBillableCharges, getEligibleBillableCharges } from '../../domain/calculations.ts'
import { applyFinanceCommand, type FinanceCommand } from '../../domain/financeWorkflow.ts'
import type { ChargeCategory, CustomerInvoice } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { validateInvoice } from '../../domain/validators.ts'
import { generateRecordId, generateStableId } from '../../services/mockDataService.ts'

const categories: ChargeCategory[] = ['forwarding fee', 'documentation', 'EDI', 'customs clearance', 'storage', 'handling', 'loading/unloading', 'pallet', 'forklift', 'trucking', 'toll', 'waiting', 'detention', 'additional stops', 'freight', 'BL charges', 'THC', 'other carrier charges', 'other']
const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
const tone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => ['approved', 'finalised', 'accepted', 'sent'].includes(value) ? 'success' : ['rejected'].includes(value) ? 'danger' : ['draft', 'pending-approval', 'eligible'].includes(value) ? 'warning' : 'info'

export function BillingManagement() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [tab, setTab] = useState<'charges' | 'pending' | 'invoices'>('charges')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | undefined>()
  const [customerFilter, setCustomerFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [forceReject, setForceReject] = useState(false)
  const allCharges = getAllBillableCharges(state)
  const eligible = getEligibleBillableCharges(state)
  const filteredCharges = allCharges.filter((charge) => (customerFilter === 'all' || charge.customerId === customerFilter) && (categoryFilter === 'all' || charge.category === categoryFilter))
  const selectedCharges = eligible.filter((charge) => selectedIds.includes(charge.id))
  const totalPending = eligible.reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0)
  const createInvoice = () => {
    if (!selectedCharges.length) { showToast('Select eligible charges before creating an invoice draft.'); return }
    const first = selectedCharges[0]
    if (selectedCharges.some((charge) => charge.customerId !== first.customerId)) { showToast('An invoice draft can only contain one customer.'); return }
    const customer = state.customers.find((item) => item.id === first.customerId)
    const due = new Date(`${state.demoDate}T00:00:00Z`)
    due.setUTCDate(due.getUTCDate() + (customer?.paymentTermsDays ?? 30))
    const dueDate = due.toISOString().slice(0, 10)
    let existingLineIds = state.customerInvoices.flatMap((invoice) => invoice.lines.map((line) => ({ id: line.id })))
    const lines = selectedCharges.map((charge) => {
      const id = generateStableId('il', existingLineIds)
      existingLineIds = [...existingLineIds, { id }]
      return { id, chargeId: charge.id, description: charge.description, quantity: charge.quantity, unitPrice: charge.unitPrice, taxRate: charge.taxRate }
    })
    const invoicePrefix = `INV-${state.demoDate.replaceAll('-', '').slice(2)}`
    const invoice: CustomerInvoice = { id: generateRecordId(state, 'customerInvoices'), invoiceNumber: generateStableId(invoicePrefix, state.customerInvoices.map((item) => ({ id: item.invoiceNumber }))), customerId: first.customerId, jobId: first.jobId, issueDate: state.demoDate, dueDate, status: 'draft', paymentStatus: 'unpaid', lines, eInvoiceStatus: 'not-submitted', emailStatus: 'not-sent', activity: ['Draft created from eligible charges'] }
    const errors = validateInvoice(state, invoice)
    if (errors.length) { showToast(errors.join(' ')); return }
    selectedCharges.filter((charge) => !state.charges.some((stored) => stored.id === charge.id)).forEach((charge) => dispatch({ type: 'add-charge', charge }))
    dispatch({ type: 'add-invoice', invoice }); setSelectedInvoice(invoice); setSelectedIds([]); setTab('invoices'); showToast(`${invoice.invoiceNumber} draft created.`)
  }
  const generate = () => {
    const newCharges = allCharges.filter((item) => !state.charges.some((charge) => charge.id === item.id || charge.sourceActivity === item.sourceActivity))
    if (!newCharges.length) { showToast('No new approved operational activities require billing.'); return }
    newCharges.forEach((charge) => dispatch({ type: 'add-charge', charge }))
    showToast(`${newCharges.length} eligible charge${newCharges.length === 1 ? '' : 's'} generated.`)
  }
  const runFinanceCommand = (command: FinanceCommand) => {
    const result = applyFinanceCommand(state, command)
    if (result.errors.length) { showToast(result.errors.join(' ')); return false }
    dispatch({ type: 'finance-command', command })
    if ('invoiceId' in command) setSelectedInvoice(result.state.customerInvoices.find((invoice) => invoice.id === command.invoiceId))
    return true
  }
  const simulateSubmission = () => {
    if (!selectedInvoice || selectedInvoice.status !== 'approved') { showToast('Approve the invoice before simulated submission.'); return }
    if (runFinanceCommand({ type: 'submit-einvoice', invoiceId: selectedInvoice.id, outcome: forceReject ? 'rejected' : 'accepted' })) showToast(forceReject ? 'Simulated e-invoice rejection recorded.' : 'Simulated e-invoice accepted.')
  }
  const sendEmail = () => {
    if (!selectedInvoice || selectedInvoice.eInvoiceStatus !== 'accepted') { showToast('Demo policy requires a successful e-invoice before email delivery.'); return }
    if (runFinanceCommand({ type: 'send-invoice-email', invoiceId: selectedInvoice.id })) showToast('Customer email delivery simulated.')
  }
  const invoiceTotals = selectedInvoice ? calculateInvoiceTotals(selectedInvoice) : undefined
  const invoiceCustomer = selectedInvoice && state.customers.find((customer) => customer.id === selectedInvoice.customerId)
  const invoiceJob = selectedInvoice && state.jobs.find((job) => job.id === selectedInvoice.jobId)
  const serviceSummary = useMemo(() => eligible.reduce<Record<string, number>>((summary, charge) => { summary[charge.serviceType] = (summary[charge.serviceType] ?? 0) + charge.quantity * charge.unitPrice; return summary }, {}), [eligible])

  return <><PageHeader eyebrow="Finance" title="Billing & Customer Invoices" description="Generate eligible charges, control missing billing and complete the simulated invoice lifecycle." actions={<Button onClick={generate}>Generate eligible charges</Button>} /><div className="billing-tabs"><Button variant={tab === 'charges' ? 'primary' : 'secondary'} onClick={() => setTab('charges')}>Charge catalogue</Button><Button variant={tab === 'pending' ? 'primary' : 'secondary'} onClick={() => setTab('pending')}>Billing pending <StatusBadge tone="warning">{eligible.length}</StatusBadge></Button><Button variant={tab === 'invoices' ? 'primary' : 'secondary'} onClick={() => setTab('invoices')}>Customer invoices</Button></div><div className="workflow-callout"><div><strong>Customer billing lifecycle</strong><p>Operational activity → eligible charge → invoice draft → finance review → simulated e-invoice → simulated customer email. Invoice status is separate from payment receipt.</p></div><StatusBadge tone={eligible.length ? 'warning' : 'success'}>{eligible.length} unbilled charges</StatusBadge></div>{tab !== 'invoices' && <div className="content-grid content-grid--wide"><Card><div className="section-heading"><div><p className="eyebrow">Missing-billing control</p><h2>{tab === 'pending' ? 'Eligible charges not invoiced' : 'Charge catalogue'}</h2></div><strong>{money(totalPending)}</strong></div><div className="filter-bar"><select onChange={(event) => setCustomerFilter(event.target.value)} value={customerFilter}><option value="all">All customers</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><select onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>{tab === 'pending' && <Button onClick={createInvoice}>Create invoice draft ({selectedIds.length})</Button>}</div><DataTable headers={['Charge reference', 'Job', 'Customer', 'Source activity', 'Category', 'Qty / unit', 'Rate', 'Amount', 'Status', 'Invoice']} rows={(tab === 'pending' ? eligible : filteredCharges).map((charge) => [tab === 'pending' && <input aria-label={`Select ${charge.reference ?? charge.id}`} checked={selectedIds.includes(charge.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, charge.id] : ids.filter((id) => id !== charge.id))} type="checkbox" />, charge.reference ?? charge.id, state.jobs.find((job) => job.id === charge.jobId)?.jobNumber, state.customers.find((customer) => customer.id === charge.customerId)?.name, charge.sourceActivity ?? 'Operational activity', charge.category ?? charge.serviceType, `${charge.quantity} ${charge.unit ?? 'unit'}`, money(charge.unitPrice), money(charge.quantity * charge.unitPrice), <StatusBadge tone={tone(charge.invoiceId ? 'invoiced' : charge.status ?? 'eligible')}>{charge.invoiceId ? 'invoiced' : charge.status ?? 'eligible'}</StatusBadge>, charge.invoiceId ? state.customerInvoices.find((invoice) => invoice.id === charge.invoiceId)?.invoiceNumber : 'Pending'])} /></Card><Card><p className="eyebrow">Pending by service</p><h2>Reason for pending</h2><DataTable headers={['Service', 'Amount', 'Reason']} rows={Object.entries(serviceSummary).map(([service, amount]) => [service, money(amount), 'Approved operational charge awaiting invoice draft'])} /></Card></div>}{tab === 'invoices' && <div className="content-grid content-grid--wide"><Card><div className="filter-bar"><Button onClick={() => setTab('pending')}>Create from pending charges</Button></div><DataTable headers={['Invoice', 'Customer', 'Job', 'Issue date', 'Total', 'Status', 'E-invoice', 'Email', 'Action']} rows={state.customerInvoices.map((invoice) => [invoice.invoiceNumber, state.customers.find((customer) => customer.id === invoice.customerId)?.name, state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber, invoice.issueDate, money(calculateInvoiceTotals(invoice).total), <StatusBadge tone={tone(invoice.status)}>{invoice.status}</StatusBadge>, <StatusBadge tone={tone(invoice.eInvoiceStatus)}>{invoice.eInvoiceStatus}</StatusBadge>, invoice.emailStatus, <Button variant="ghost" onClick={() => setSelectedInvoice(invoice)}>Review</Button>])} /></Card>{selectedInvoice && <Card className="detail-card"><div className="section-heading"><div><p className="eyebrow">Invoice detail</p><h2>{selectedInvoice.invoiceNumber}</h2><p className="detail-meta">{invoiceCustomer?.name} · {invoiceJob?.jobNumber} · {invoiceCustomer?.email}</p></div><Button variant="ghost" onClick={() => setSelectedInvoice(undefined)}>Close</Button></div><div className="detail-grid"><span>Invoice date<strong>{selectedInvoice.issueDate}</strong></span><span>Due date<strong>{selectedInvoice.dueDate}</strong></span><span>Subtotal<strong>{money(invoiceTotals?.subtotal ?? 0)}</strong></span><span>Tax<strong>{money(invoiceTotals?.tax ?? 0)}</strong></span><span>Total<strong>{money(invoiceTotals?.total ?? 0)}</strong></span><span>Payment<strong>{selectedInvoice.paymentStatus}</strong></span></div><DataTable headers={['Charge', 'Job', 'Description', 'Qty', 'Rate', 'Line total']} rows={selectedInvoice.lines.map((line) => [line.chargeId, invoiceJob?.jobNumber, line.description, line.quantity, money(line.unitPrice), money(line.quantity * line.unitPrice)])} /><div className="form-actions">{selectedInvoice.status === 'draft' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'pending-approval' })}>Submit for finance review</Button>}{selectedInvoice.status === 'pending-approval' && <><Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'approved' })}>Approve</Button><Button variant="danger" onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'rejected' })}>Reject</Button></>}{selectedInvoice.status === 'rejected' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'draft' })}>Reopen correction draft</Button>}{selectedInvoice.status === 'approved' && selectedInvoice.eInvoiceStatus === 'not-submitted' && <><label className="form-field"><span>Submission scenario</span><select onChange={(event) => setForceReject(event.target.value === 'reject')} value={forceReject ? 'reject' : 'success'}><option value="success">Successful acceptance</option><option value="reject">Rejected response</option></select></label><Button onClick={simulateSubmission}>Submit e-invoice simulation</Button></>}{selectedInvoice.eInvoiceStatus === 'accepted' && selectedInvoice.emailStatus === 'not-sent' && <Button onClick={sendEmail}>Send invoice to customer</Button>}</div><div className="activity-strip">{(selectedInvoice.activity ?? []).join(' · ') || 'No activity recorded.'}<br />No external e-invoice or email service is called.</div></Card>}</div>}</>
}
