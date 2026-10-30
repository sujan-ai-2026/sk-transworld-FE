import { useMemo, useState } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateInvoiceTotals, getAllBillableCharges, getEligibleBillableCharges } from '../../domain/calculations.ts'
import { applyFinanceCommand, type FinanceCommand } from '../../domain/financeWorkflow.ts'
import type { ChargeCategory, CustomerInvoice, PaymentTransaction } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { validateInvoice } from '../../domain/validators.ts'
import { generateRecordId, generateStableId } from '../../services/mockDataService.ts'

const categories: ChargeCategory[] = ['forwarding fee', 'documentation', 'EDI', 'customs clearance', 'storage', 'handling', 'loading/unloading', 'pallet', 'forklift', 'trucking', 'toll', 'waiting', 'detention', 'additional stops', 'freight', 'BL charges', 'THC', 'other carrier charges', 'other']
const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
const tone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => ['approved', 'finalised', 'accepted', 'sent'].includes(value) ? 'success' : ['rejected'].includes(value) ? 'danger' : ['draft', 'pending-approval', 'eligible'].includes(value) ? 'warning' : 'info'
const isInvoiceTab = (value: string): boolean => value === 'invoices'

export function BillingManagement() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [tab, setTab] = useState<'charges' | 'pending' | 'invoices'>('charges')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | undefined>()
  const [customerFilter, setCustomerFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [forceReject, setForceReject] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ bankName: 'Maybank', bankReference: '', amount: '' })
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
  const recordReceipt = () => {
    if (!selectedInvoice || !['approved', 'finalised', 'paid'].includes(selectedInvoice.status)) { showToast('Approve or finalise the invoice before recording a customer receipt.'); return }
    const bankReference = receiptForm.bankReference.trim()
    const amount = Number(receiptForm.amount)
    if (!bankReference || !Number.isFinite(amount) || amount <= 0) { showToast('Enter a bank transaction ID and a positive receipt amount.'); return }
    if (state.bankTransactions.some((transaction) => transaction.reference.toLowerCase() === bankReference.toLowerCase())) { showToast('That bank transaction ID is already recorded.'); return }
    const invoiceTotal = calculateInvoiceTotals(selectedInvoice).total
    const alreadyReceived = state.paymentTransactions.filter((payment) => payment.invoiceId === selectedInvoice.id && payment.status === 'posted').reduce((sum, payment) => sum + payment.amount, 0)
    const outstanding = Math.max(0, invoiceTotal - alreadyReceived)
    if (amount > outstanding) { showToast(`Receipt exceeds the outstanding balance of ${money(outstanding)}.`); return }
    const paymentId = generateRecordId(state, 'paymentTransactions')
    const payment: PaymentTransaction = {
      id: paymentId,
      reference: `RCPT-${paymentId.toUpperCase()}`,
      invoiceId: selectedInvoice.id,
      bankName: receiptForm.bankName,
      bankTransactionReference: bankReference,
      amount,
      transactionDate: state.demoDate,
      status: 'posted',
    }
    dispatch({ type: 'add-payment', payment })
    dispatch({
      type: 'add-bank-transaction',
      transaction: {
        id: generateRecordId(state, 'bankTransactions'),
        reference: bankReference,
        description: `${selectedInvoice.invoiceNumber} customer receipt`,
        amount,
        transactionDate: state.demoDate,
        direction: 'credit',
        matched: false,
      },
    })
    setSelectedInvoice({ ...selectedInvoice, paymentStatus: alreadyReceived + amount >= invoiceTotal ? 'paid' : 'partially-paid' })
    setReceiptForm({ bankName: 'Maybank', bankReference: '', amount: '' })
    showToast(`Customer receipt of ${money(amount)} recorded.`)
  }
  const invoiceTotals = selectedInvoice ? calculateInvoiceTotals(selectedInvoice) : undefined
  const invoicePayments = selectedInvoice ? state.paymentTransactions.filter((payment) => payment.invoiceId === selectedInvoice.id && payment.status === 'posted') : []
  const amountReceived = invoicePayments.reduce((sum, payment) => sum + payment.amount, 0)
  const amountOutstanding = Math.max(0, (invoiceTotals?.total ?? 0) - amountReceived)
  const invoiceCustomer = selectedInvoice && state.customers.find((customer) => customer.id === selectedInvoice.customerId)
  const invoiceJob = selectedInvoice && state.jobs.find((job) => job.id === selectedInvoice.jobId)
  const serviceSummary = useMemo(() => eligible.reduce<Record<string, number>>((summary, charge) => { summary[charge.serviceType] = (summary[charge.serviceType] ?? 0) + charge.quantity * charge.unitPrice; return summary }, {}), [eligible])

  if (isInvoiceTab(tab)) {
    const invoiceRows = state.customerInvoices.map((invoice) => {
      const receipts = state.paymentTransactions.filter((payment) => payment.invoiceId === invoice.id && payment.status === 'posted')
      const received = receipts.reduce((sum, payment) => sum + payment.amount, 0)
      const bankDetails = receipts.map((payment) => `${payment.bankName ?? 'Bank'} · ${payment.bankTransactionReference ?? payment.reference}`).join(', ') || '—'
      return [
        invoice.invoiceNumber,
        state.customers.find((customer) => customer.id === invoice.customerId)?.name,
        state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber,
        invoice.issueDate,
        money(calculateInvoiceTotals(invoice).total),
        money(received),
        invoice.paymentStatus,
        bankDetails,
        <StatusBadge key={`${invoice.id}-einvoice`} tone={tone(invoice.eInvoiceStatus)}>{invoice.eInvoiceStatus}</StatusBadge>,
        invoice.emailStatus,
        <StatusBadge key={`${invoice.id}-status`} tone={tone(invoice.status)}>{invoice.status}</StatusBadge>,
        <Button key={`${invoice.id}-review`} variant="ghost" onClick={() => setSelectedInvoice(invoice)}>Review</Button>,
      ]
    })
    return <>
      <PageHeader eyebrow="Finance" title="Billing & Customer Invoices" description="Review customer invoices and see receipts, bank names, transaction IDs and outstanding balances." actions={<Button onClick={generate}>Generate eligible charges</Button>} />
      <div className="billing-tabs">
        <Button variant="secondary" onClick={() => setTab('charges')}>Charge catalogue</Button>
        <Button variant="secondary" onClick={() => setTab('pending')}>Billing pending <StatusBadge tone="warning">{eligible.length}</StatusBadge></Button>
        <Button variant="primary" onClick={() => setTab('invoices')}>Customer invoices</Button>
      </div>
      <div className="workflow-callout"><div><strong>Customer billing lifecycle</strong><p className='text-[12px]'>Operational activity → eligible charge → invoice draft → finance review → simulated e-invoice → simulated customer email. Receipts are recorded separately from invoice approval.</p></div><StatusBadge tone={eligible.length ? 'warning' : 'success'}>{eligible.length} unbilled charges</StatusBadge></div>
      <Card>
        <div className="filter-bar"><Button onClick={() => setTab('pending')}>Create from pending charges</Button></div>
        {state.customerInvoices.length
          ? <DataTable headers={['Invoice', 'Customer', 'Job', 'Issue date', 'Total', 'Received', 'Payment status', 'Bank · transaction ID', 'E-invoice', 'Email', 'Invoice status', 'Action']} rows={invoiceRows} />
          : <p className="empty-state">No customer invoices yet. Create a draft from eligible billing charges.</p>}
      </Card>
      {selectedInvoice && <Card className="detail-card">
        <div className="section-heading"><div><p className="eyebrow">Invoice detail</p><h2>{selectedInvoice.invoiceNumber}</h2><p className="detail-meta">{invoiceCustomer?.name} · {invoiceJob?.jobNumber} · {invoiceCustomer?.email}</p></div><Button variant="ghost" onClick={() => setSelectedInvoice(undefined)}>Close</Button></div>
        <div className="detail-grid"><span>Invoice date<strong>{selectedInvoice.issueDate}</strong></span><span>Due date<strong>{selectedInvoice.dueDate}</strong></span><span>Subtotal<strong>{money(invoiceTotals?.subtotal ?? 0)}</strong></span><span>Tax<strong>{money(invoiceTotals?.tax ?? 0)}</strong></span><span>Total<strong>{money(invoiceTotals?.total ?? 0)}</strong></span><span>Received<strong>{money(amountReceived)}</strong></span><span>Outstanding<strong>{money(amountOutstanding)}</strong></span><span>Payment<strong>{selectedInvoice.paymentStatus}</strong></span></div>
        <DataTable headers={['Charge', 'Job', 'Description', 'Qty', 'Rate', 'Line total']} rows={selectedInvoice.lines.map((line) => [line.chargeId, invoiceJob?.jobNumber, line.description, line.quantity, money(line.unitPrice), money(line.quantity * line.unitPrice)])} />
        <div className="section-heading"><div><p className="eyebrow">Customer receipts</p><h3>Bank and transaction details</h3></div></div>
        {invoicePayments.length
          ? <DataTable headers={['Receipt ID', 'Bank', 'Bank transaction ID', 'Amount', 'Date']} rows={invoicePayments.map((payment) => [payment.reference, payment.bankName ?? '—', payment.bankTransactionReference ?? '—', money(payment.amount), payment.transactionDate])} />
          : <p className="empty-state">No customer receipts recorded for this invoice.</p>}
        {['approved', 'finalised', 'paid'].includes(selectedInvoice.status) && amountOutstanding > 0 && <div className="receipt-entry">
          <div className="section-heading"><div><p className="eyebrow">Demo receipt capture</p><h3>Record customer payment</h3><p className="detail-meta">Outstanding balance: {money(amountOutstanding)} · no live banking service is connected.</p></div></div>
          <div className="form-grid form-grid--three">
            <FormField label="Bank"><select value={receiptForm.bankName} onChange={(event) => setReceiptForm({ ...receiptForm, bankName: event.target.value })}><option>Maybank</option><option>CIMB</option><option>Public Bank</option><option>RHB</option></select></FormField>
            <FormField label="Bank transaction ID"><input value={receiptForm.bankReference} onChange={(event) => setReceiptForm({ ...receiptForm, bankReference: event.target.value })} placeholder="e.g. MB-TRX-261102" /></FormField>
            <FormField label="Receipt amount (RM)"><input min="0.01" max={amountOutstanding} step="0.01" type="number" value={receiptForm.amount} onChange={(event) => setReceiptForm({ ...receiptForm, amount: event.target.value })} /></FormField>
          </div>
          <Button onClick={recordReceipt}>Record receipt</Button>
        </div>}
        <div className="form-actions">
          {selectedInvoice.status === 'draft' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'pending-approval' })}>Submit for finance review</Button>}
          {selectedInvoice.status === 'pending-approval' && <><Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'approved' })}>Approve</Button><Button variant="danger" onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'rejected' })}>Reject</Button></>}
          {selectedInvoice.status === 'rejected' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'draft' })}>Reopen correction draft</Button>}
          {selectedInvoice.status === 'approved' && selectedInvoice.eInvoiceStatus === 'not-submitted' && <><label className="form-field"><span>Submission scenario</span><select onChange={(event) => setForceReject(event.target.value === 'reject')} value={forceReject ? 'reject' : 'success'}><option value="success">Successful acceptance</option><option value="reject">Rejected response</option></select></label><Button onClick={simulateSubmission}>Submit e-invoice simulation</Button></>}
          {selectedInvoice.eInvoiceStatus === 'accepted' && selectedInvoice.emailStatus === 'not-sent' && <Button onClick={sendEmail}>Send invoice to customer</Button>}
        </div>
        <div className="activity-strip">{(selectedInvoice.activity ?? []).join(' · ') || 'No activity recorded.'}<br />No external e-invoice, banking or email service is called.</div>
      </Card>}
    </>
  }

  return <><PageHeader eyebrow="Finance" title="Billing & Customer Invoices" description="Generate eligible charges, control missing billing and complete the simulated invoice lifecycle." actions={<Button onClick={generate}>Generate eligible charges</Button>} /><div className="billing-tabs"><Button variant={tab === 'charges' ? 'primary' : 'secondary'} onClick={() => setTab('charges')}>Charge catalogue</Button><Button variant={tab === 'pending' ? 'primary' : 'secondary'} onClick={() => setTab('pending')}>Billing pending <StatusBadge tone="warning">{eligible.length}</StatusBadge></Button><Button variant={tab === 'invoices' ? 'primary' : 'secondary'} onClick={() => setTab('invoices')}>Customer invoices</Button></div><div className="workflow-callout"><div><strong>Customer billing lifecycle</strong><p>Operational activity → eligible charge → invoice draft → finance review → simulated e-invoice → simulated customer email. Invoice status is separate from payment receipt.</p></div><StatusBadge tone={eligible.length ? 'warning' : 'success'}>{eligible.length} unbilled charges</StatusBadge></div>{tab !== 'invoices' && <div className="content-grid content-grid--wide"><Card><div className="section-heading"><div><p className="eyebrow">Missing-billing control</p><h2>{tab === 'pending' ? 'Eligible charges not invoiced' : 'Charge catalogue'}</h2></div><strong>{money(totalPending)}</strong></div><div className="filter-bar"><select onChange={(event) => setCustomerFilter(event.target.value)} value={customerFilter}><option value="all">All customers</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><select onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>{tab === 'pending' && <Button onClick={createInvoice}>Create invoice draft ({selectedIds.length})</Button>}</div><DataTable headers={['Charge reference', 'Job', 'Customer', 'Source activity', 'Category', 'Qty / unit', 'Rate', 'Amount', 'Status', 'Invoice']} rows={(tab === 'pending' ? eligible : filteredCharges).map((charge) => [tab === 'pending' && <input aria-label={`Select ${charge.reference ?? charge.id}`} checked={selectedIds.includes(charge.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, charge.id] : ids.filter((id) => id !== charge.id))} type="checkbox" />, charge.reference ?? charge.id, state.jobs.find((job) => job.id === charge.jobId)?.jobNumber, state.customers.find((customer) => customer.id === charge.customerId)?.name, charge.sourceActivity ?? 'Operational activity', charge.category ?? charge.serviceType, `${charge.quantity} ${charge.unit ?? 'unit'}`, money(charge.unitPrice), money(charge.quantity * charge.unitPrice), <StatusBadge tone={tone(charge.invoiceId ? 'invoiced' : charge.status ?? 'eligible')}>{charge.invoiceId ? 'invoiced' : charge.status ?? 'eligible'}</StatusBadge>, charge.invoiceId ? state.customerInvoices.find((invoice) => invoice.id === charge.invoiceId)?.invoiceNumber : 'Pending'])} /></Card><Card><p className="eyebrow">Pending by service</p><h2>Reason for pending</h2><DataTable headers={['Service', 'Amount', 'Reason']} rows={Object.entries(serviceSummary).map(([service, amount]) => [service, money(amount), 'Approved operational charge awaiting invoice draft'])} /></Card></div>}{tab === 'invoices' && <div className="content-grid content-grid--wide"><Card><div className="filter-bar"><Button onClick={() => setTab('pending')}>Create from pending charges</Button></div><DataTable headers={['Invoice', 'Customer', 'Job', 'Issue date', 'Total', 'Status', 'E-invoice', 'Email', 'Action']} rows={state.customerInvoices.map((invoice) => [invoice.invoiceNumber, state.customers.find((customer) => customer.id === invoice.customerId)?.name, state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber, invoice.issueDate, money(calculateInvoiceTotals(invoice).total), <StatusBadge tone={tone(invoice.status)}>{invoice.status}</StatusBadge>, <StatusBadge tone={tone(invoice.eInvoiceStatus)}>{invoice.eInvoiceStatus}</StatusBadge>, invoice.emailStatus, <Button variant="ghost" onClick={() => setSelectedInvoice(invoice)}>Review</Button>])} /></Card>{selectedInvoice && <Card className="detail-card"><div className="section-heading"><div><p className="eyebrow">Invoice detail</p><h2>{selectedInvoice.invoiceNumber}</h2><p className="detail-meta">{invoiceCustomer?.name} · {invoiceJob?.jobNumber} · {invoiceCustomer?.email}</p></div><Button variant="ghost" onClick={() => setSelectedInvoice(undefined)}>Close</Button></div><div className="detail-grid"><span>Invoice date<strong>{selectedInvoice.issueDate}</strong></span><span>Due date<strong>{selectedInvoice.dueDate}</strong></span><span>Subtotal<strong>{money(invoiceTotals?.subtotal ?? 0)}</strong></span><span>Tax<strong>{money(invoiceTotals?.tax ?? 0)}</strong></span><span>Total<strong>{money(invoiceTotals?.total ?? 0)}</strong></span><span>Payment<strong>{selectedInvoice.paymentStatus}</strong></span></div><DataTable headers={['Charge', 'Job', 'Description', 'Qty', 'Rate', 'Line total']} rows={selectedInvoice.lines.map((line) => [line.chargeId, invoiceJob?.jobNumber, line.description, line.quantity, money(line.unitPrice), money(line.quantity * line.unitPrice)])} /><div className="form-actions">{selectedInvoice.status === 'draft' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'pending-approval' })}>Submit for finance review</Button>}{selectedInvoice.status === 'pending-approval' && <><Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'approved' })}>Approve</Button><Button variant="danger" onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'rejected' })}>Reject</Button></>}{selectedInvoice.status === 'rejected' && <Button onClick={() => runFinanceCommand({ type: 'invoice-review', invoiceId: selectedInvoice.id, status: 'draft' })}>Reopen correction draft</Button>}{selectedInvoice.status === 'approved' && selectedInvoice.eInvoiceStatus === 'not-submitted' && <><label className="form-field"><span>Submission scenario</span><select onChange={(event) => setForceReject(event.target.value === 'reject')} value={forceReject ? 'reject' : 'success'}><option value="success">Successful acceptance</option><option value="reject">Rejected response</option></select></label><Button onClick={simulateSubmission}>Submit e-invoice simulation</Button></>}{selectedInvoice.eInvoiceStatus === 'accepted' && selectedInvoice.emailStatus === 'not-sent' && <Button onClick={sendEmail}>Send invoice to customer</Button>}</div><div className="activity-strip">{(selectedInvoice.activity ?? []).join(' · ') || 'No activity recorded.'}<br />No external e-invoice or email service is called.</div></Card>}</div>}</>
}
