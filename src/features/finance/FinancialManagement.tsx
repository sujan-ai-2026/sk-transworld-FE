import { useState } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { useConfirmation } from '../../../components/useConfirmation.ts'
import { calculateFinancialStatements, calculateJobFinancials, calculateReconciliationSummary, canMatchReconciliation, getAllBillableCharges, getEligibleBillableCharges, isCostIncludedInJobCosting } from '../../domain/calculations.ts'
import { applyFinanceCommand, type FinanceCommand } from '../../domain/financeWorkflow.ts'
import type { DocumentMetadata, ReimbursementRequest, SupplierCost, SupplierInvoice } from '../../domain/types.ts'
import { validateSupplierInvoice } from '../../domain/validators.ts'
import { useAppState } from '../../state/AppContext.tsx'

const idFor = (prefix: string, count: number) => `${prefix}-${String(count + 1).padStart(4, '0')}`
const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
const tone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => ['approved', 'posted', 'paid', 'validated'].includes(value) ? 'success' : ['rejected', 'duplicate-warning'].includes(value) ? 'danger' : ['pending', 'captured', 'submitted', 'awaiting approval'].includes(value) ? 'warning' : 'info'

function CostsPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [supportingFile, setSupportingFile] = useState<File | undefined>()
  const [form, setForm] = useState({ supplierId: state.suppliers[0]?.id ?? '', jobId: state.jobs[0]?.id ?? '', category: 'other' as SupplierCost['category'], reference: '', description: '', amount: 0, classification: 'actual' as SupplierCost['classification'] })
  const save = () => {
    if (!form.reference.trim() || !form.description.trim() || !Number.isFinite(form.amount) || form.amount <= 0) { showToast('Supplier, reference, description and a positive amount are required.'); return }
    const costId = idFor('cost', state.supplierCosts.length)
    let supportingDocumentId: string | undefined
    if (supportingFile) {
      supportingDocumentId = idFor('doc', state.documents.length)
      dispatch({ type: 'add-document', document: { id: supportingDocumentId, jobId: form.jobId, name: supportingFile.name, category: 'supplier-invoice', status: 'pending-review', uploadedAt: state.demoDate, sizeBytes: supportingFile.size, mimeType: supportingFile.type, relatedRecordId: costId, accessRule: 'finance-only', previewText: 'Supporting file metadata saved locally in the demo.' } })
    }
    const jobTrips = state.trips.filter((trip) => trip.jobId === form.jobId)
    dispatch({ type: 'add-supplier-cost', cost: { id: costId, supplierId: form.supplierId, jobId: form.jobId, tripId: jobTrips.length === 1 ? jobTrips[0].id : undefined, category: form.category, reference: form.reference.trim(), description: form.description.trim(), amount: form.amount, currency: 'MYR', classification: form.classification, incurredDate: state.demoDate, posted: false, approvalStatus: 'pending', supportingDocumentId } })
    showToast('Supplier cost captured.'); setForm((current) => ({ ...current, reference: '', description: '', amount: 0 }))
  }
  return <><PageHeader eyebrow="Finance" title="Supplier Costs" description="Capture linked trucking, customs, forwarding and warehouse actuals or estimates; only approved or posted actual costs enter job costing." /><div className="content-grid content-grid--wide"><Card className="form-card"><div className="form-grid form-grid--three"><FormField label="Supplier"><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>{state.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></FormField><FormField label="Job Number"><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SupplierCost['category'] })}><option>trucking</option><option>toll</option><option>freight</option><option>customs</option><option>warehouse</option><option>other</option></select></FormField><FormField label="Reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></FormField><FormField label="Description"><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField><FormField label="Amount (MYR)"><input min="0" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></FormField><FormField label="Classification"><select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value as SupplierCost['classification'] })}><option value="estimated">Estimated</option><option value="actual">Actual</option></select></FormField><FormField label="Supporting document"><input onChange={(event) => setSupportingFile(event.target.files?.[0])} type="file" /></FormField></div><div className="form-actions"><Button onClick={save}>Capture supplier cost</Button></div></Card><Card><DataTable headers={['Supplier', 'Job', 'Category', 'Reference', 'Amount', 'Class', 'Status', 'Action']} rows={state.supplierCosts.map((cost) => [state.suppliers.find((supplier) => supplier.id === cost.supplierId)?.name, state.jobs.find((job) => job.id === cost.jobId)?.jobNumber, cost.category, cost.reference ?? '—', money(cost.amount), cost.classification ?? 'actual', <StatusBadge tone={tone(cost.approvalStatus ?? (cost.posted ? 'posted' : 'pending'))}>{cost.approvalStatus ?? (cost.posted ? 'posted' : 'pending')}</StatusBadge>, !cost.posted && cost.approvalStatus !== 'approved' ? <Button variant="ghost" onClick={() => dispatch({ type: 'update-supplier-cost', cost: { ...cost, approvalStatus: 'approved' } })}>Approve cost</Button> : '—'])} /></Card></div></>
}

function SupplierInvoicesPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [form, setForm] = useState({ supplierId: state.suppliers[0]?.id ?? '', jobId: state.jobs[0]?.id ?? '', tripId: '', costCategory: 'other' as SupplierCost['category'], reference: '', invoiceDate: state.demoDate, dueDate: state.demoDate })
  const [lines, setLines] = useState([{ id: 'sinv-line-1', description: '', quantity: 1, unitPrice: 0 }])
  const [supportingFile, setSupportingFile] = useState<File | undefined>()
  const amount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const save = () => {
    if (!form.reference.trim() || !Number.isFinite(amount) || amount <= 0 || lines.some((line) => !line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) || !form.invoiceDate || !form.dueDate || form.dueDate < form.invoiceDate) { showToast('Reference, valid dates and complete positive invoice lines are required.'); return }
    if (form.tripId && !state.trips.some((trip) => trip.id === form.tripId && trip.jobId === form.jobId)) { showToast('The selected trip must belong to this job.'); return }
    const duplicateErrors = validateSupplierInvoice(state, { reference: form.reference, supplierId: form.supplierId })
    if (duplicateErrors.length) { showToast(duplicateErrors.join(' ')); return }
    const invoiceId = idFor('sinv', state.supplierInvoices.length)
    let supportingDocumentId: string | undefined
    if (supportingFile) {
      supportingDocumentId = idFor('doc', state.documents.length)
      dispatch({ type: 'add-document', document: { id: supportingDocumentId, jobId: form.jobId, name: supportingFile.name, category: 'supplier-invoice', status: 'pending-review', uploadedAt: state.demoDate, sizeBytes: supportingFile.size, mimeType: supportingFile.type, relatedRecordId: invoiceId, accessRule: 'finance-only', previewText: 'Supplier invoice document metadata saved locally in the demo.' } })
    }
    const invoice: SupplierInvoice = { id: invoiceId, supplierId: form.supplierId, jobId: form.jobId, tripId: form.tripId || undefined, costCategory: form.costCategory, reference: form.reference.trim(), invoiceDate: form.invoiceDate, dueDate: form.dueDate, lineItems: lines, amount, status: 'captured', paymentStatus: 'unpaid', validationStatus: 'pending', supportingDocumentId }
    dispatch({ type: 'add-supplier-invoice', invoice }); showToast('Supplier invoice captured. Validate it to create its voucher.'); setForm({ ...form, reference: '' }); setLines([{ id: `sinv-line-${state.supplierInvoices.length + 2}`, description: '', quantity: 1, unitPrice: 0 }]); setSupportingFile(undefined)
  }
  const command = (financeCommand: FinanceCommand, successMessage: string) => {
    const result = applyFinanceCommand(state, financeCommand)
    if (result.errors.length) { showToast(result.errors.join(' ')); return }
    dispatch({ type: 'finance-command', command: financeCommand })
    showToast(successMessage)
  }
  const validateInvoice = (invoice: SupplierInvoice) => {
    command({ type: 'validate-supplier-invoice', invoiceId: invoice.id }, 'Invoice validated; voucher created and payment remains pending.')
  }
  return <><PageHeader eyebrow="" title="Supplier Invoices" description="Capture invoices against a job and optional trip/cost category; approval, voucher posting and payment remain separate." /><div className="content-grid content-grid--wide"><Card className="form-card"><div className="form-grid form-grid--three"><FormField label="Supplier"><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>{state.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></FormField><FormField label="Job Number"><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value, tripId: '' })}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Supplier invoice reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></FormField><FormField label="Cost category"><select value={form.costCategory} onChange={(event) => setForm({ ...form, costCategory: event.target.value as SupplierCost['category'] })}><option>trucking</option><option>toll</option><option>freight</option><option>customs</option><option>warehouse</option><option>other</option></select></FormField><FormField label="Trip (optional)"><select value={form.tripId} onChange={(event) => setForm({ ...form, tripId: event.target.value })}><option value="">Not trip-specific</option>{state.trips.filter((trip) => trip.jobId === form.jobId).map((trip) => <option key={trip.id} value={trip.id}>{trip.tripNumber}</option>)}</select></FormField><FormField label="Invoice date"><input type="date" value={form.invoiceDate} onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })} /></FormField><FormField label="Due date"><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></FormField><FormField label="Import simulation"><input onChange={(event) => setSupportingFile(event.target.files?.[0])} type="file" /></FormField></div><div className="section-heading"><h2>Invoice lines · Total {money(amount)}</h2><Button variant="secondary" onClick={() => setLines((current) => [...current, { id: `sinv-line-${current.length + 1}`, description: '', quantity: 1, unitPrice: 0 }])}>Add line</Button></div>{lines.map((line, index) => <div className="quotation-line" key={line.id}><FormField label={`Line ${index + 1} description`}><input value={line.description} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item))} /></FormField><FormField label="Quantity"><input min="1" type="number" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) } : item))} /></FormField><FormField label="Unit price"><input min="0" type="number" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, unitPrice: Number(event.target.value) } : item))} /></FormField><strong>{money(line.quantity * line.unitPrice)}</strong>{lines.length > 1 && <Button variant="ghost" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Remove</Button>}</div>)}<div className="form-actions"><Button onClick={save}>Capture invoice</Button></div></Card><Card><DataTable headers={['Reference', 'Supplier', 'Job', 'Date / due', 'Amount', 'Validation', 'Invoice status', 'Voucher / payment', 'Action']} rows={state.supplierInvoices.map((invoice) => [invoice.reference, state.suppliers.find((supplier) => supplier.id === invoice.supplierId)?.name, state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber, `${invoice.invoiceDate} / ${invoice.dueDate ?? '—'}`, money(invoice.amount), <StatusBadge tone={tone(invoice.validationStatus ?? 'pending')}>{invoice.validationStatus ?? 'pending'}</StatusBadge>, invoice.status, state.paymentVouchers.find((voucher) => voucher.supplierInvoiceId === invoice.id)?.status ?? invoice.paymentStatus, invoice.status === 'captured' ? <Button variant="ghost" onClick={() => validateInvoice(invoice)}>Validate & create voucher</Button> : '—'])} /></Card></div></>
}

function VouchersPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [form, setForm] = useState({ jobId: state.jobs[0]?.id ?? '', supplierId: state.suppliers[0]?.id ?? '', amount: 0, description: '' })
  const command = (financeCommand: FinanceCommand, successMessage: string) => {
    const result = applyFinanceCommand(state, financeCommand)
    if (result.errors.length) { showToast(result.errors.join(' ')); return }
    dispatch({ type: 'finance-command', command: financeCommand })
    showToast(successMessage)
  }
  const manual = () => {
    if (!form.description.trim() || !Number.isFinite(form.amount) || form.amount <= 0) { showToast('Description and positive amount are required.'); return }
    dispatch({ type: 'add-voucher', voucher: { id: idFor('vch', state.paymentVouchers.length), voucherNumber: `PV-${state.demoDate.replaceAll('-', '').slice(2)}-${String(state.paymentVouchers.length + 1).padStart(3, '0')}`, jobId: form.jobId, supplierId: form.supplierId, description: form.description, amount: form.amount, status: 'draft' } }); showToast('Manual expense voucher created.'); setForm({ ...form, description: '', amount: 0 })
  }
  return <><PageHeader eyebrow="Finance" title="Payment Vouchers" description="Automatic supplier vouchers and manual expense vouchers remain separate from actual payment." /><div className="workflow-callout"><div><strong>Supplier payment lifecycle</strong><p>Captured invoice → validation → voucher approval → posting → simulated payment → bank reconciliation. Creating a voucher alone does not mark its invoice paid.</p></div><StatusBadge tone="info">{state.paymentVouchers.length} vouchers</StatusBadge></div><div className="content-grid content-grid--wide"><Card className="form-card"><div className="form-grid"><FormField label="Job Number"><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Supplier"><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>{state.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></FormField><FormField label="Manual expense description"><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField><FormField label="Amount (MYR)"><input min="0" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></FormField></div><Button onClick={manual}>Create manual voucher</Button></Card><Card><DataTable headers={['Voucher', 'Linked invoice / request', 'Amount', 'Status', 'Action']} rows={state.paymentVouchers.map((voucher) => [voucher.voucherNumber, state.supplierInvoices.find((invoice) => invoice.id === voucher.supplierInvoiceId)?.reference ?? state.reimbursements.find((request) => request.id === voucher.reimbursementId)?.description ?? voucher.description ?? 'Manual expense', money(voucher.amount), <StatusBadge tone={tone(voucher.status)}>{voucher.status}</StatusBadge>, voucher.status === 'pending-approval' || voucher.status === 'draft' ? <Button variant="ghost" onClick={() => command({ type: 'approve-voucher', voucherId: voucher.id }, 'Voucher approved.')}>Approve</Button> : voucher.status === 'approved' ? <Button variant="ghost" onClick={() => command({ type: 'post-voucher', voucherId: voucher.id }, 'Voucher posted; payment remains pending.')}>Post</Button> : voucher.status === 'posted' ? <Button variant="ghost" onClick={() => command({ type: 'pay-voucher', voucherId: voucher.id }, 'Payment simulated and posted.')}>Simulate payment</Button> : 'Paid'])} /></Card></div></>
}

function ReimbursementsPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [form, setForm] = useState({ requestedBy: '', description: '', amount: 0, jobId: '', category: 'parking' as NonNullable<ReimbursementRequest['expenseCategory']> })
  const [receipt, setReceipt] = useState<File | undefined>()
  const command = (financeCommand: FinanceCommand, successMessage: string) => {
    const result = applyFinanceCommand(state, financeCommand)
    if (result.errors.length) { showToast(result.errors.join(' ')); return }
    dispatch({ type: 'finance-command', command: financeCommand })
    showToast(successMessage)
  }
  const add = () => {
    if (!form.requestedBy.trim() || !form.description.trim() || !Number.isFinite(form.amount) || form.amount <= 0) { showToast('Requester, justification and positive amount are required.'); return }
    if (receipt && !form.jobId) { showToast('Select a job to associate the supporting receipt.'); return }
    const requestId = idFor('reim', state.reimbursements.length)
    let supportingDocumentId: string | undefined
    if (receipt && form.jobId) {
      const document: DocumentMetadata = { id: idFor('doc', state.documents.length), jobId: form.jobId, name: receipt.name, category: 'receipt', status: 'pending-review', uploadedAt: state.demoDate, sizeBytes: receipt.size, mimeType: receipt.type, relatedRecordId: requestId, accessRule: 'finance-only', previewText: 'Receipt metadata stored locally in the demo; no external upload.' }
      supportingDocumentId = document.id
      dispatch({ type: 'add-document', document })
    }
    dispatch({ type: 'add-reimbursement', request: { id: requestId, requestedBy: form.requestedBy.trim(), description: form.description.trim(), expenseCategory: form.category, amount: form.amount, jobId: form.jobId || undefined, requestedDate: state.demoDate, supportingDocumentId, status: 'submitted', paymentStatus: 'unpaid', justification: form.description.trim() } })
    showToast('Reimbursement request submitted.')
    setForm({ requestedBy: '', description: '', amount: 0, jobId: '', category: 'parking' })
    setReceipt(undefined)
  }
  return <><PageHeader eyebrow="Finance" title="Reimbursement Requests" description="Demo assumption: receipt-backed reimbursements require review, a linked voucher and a separate recorded payment." /><div className="content-grid content-grid--wide"><Card className="form-card"><div className="form-grid"><FormField label="Requester"><input value={form.requestedBy} onChange={(event) => setForm({ ...form, requestedBy: event.target.value })} /></FormField><FormField label="Expense category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as typeof form.category })}>{['toll', 'fuel', 'parking', 'port charges', 'waiting', 'detention', 'driver allowance', 'other'].map((item) => <option key={item}>{item}</option>)}</select></FormField><FormField label="Job Number (optional)"><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}><option value="">Not job-specific</option>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Justification"><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField><FormField label="Amount (MYR)"><input min="0" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></FormField><FormField label="Supporting receipt"><input accept="image/*,.pdf" onChange={(event) => setReceipt(event.target.files?.[0])} type="file" /></FormField></div><Button onClick={add}>Submit request</Button></Card><Card><DataTable headers={['Requester', 'Date', 'Category', 'Job', 'Justification', 'Receipt', 'Amount', 'Status', 'Voucher / payment', 'Action']} rows={state.reimbursements.map((request) => {
    const voucher = state.paymentVouchers.find((item) => item.reimbursementId === request.id)
    return [request.requestedBy, request.requestedDate ?? state.demoDate, request.expenseCategory ?? 'other', request.jobId ? state.jobs.find((job) => job.id === request.jobId)?.jobNumber : '—', request.description, request.supportingDocumentId ? state.documents.find((document) => document.id === request.supportingDocumentId)?.name : '—', money(request.amount), <StatusBadge tone={tone(request.status)}>{request.status}</StatusBadge>, voucher?.status ?? request.paymentStatus ?? 'unpaid', request.status === 'submitted' ? <><Button variant="ghost" onClick={() => command({ type: 'review-reimbursement', reimbursementId: request.id, outcome: 'approved' }, 'Reimbursement approved and voucher created.')}>Approve</Button><Button variant="ghost" onClick={() => command({ type: 'review-reimbursement', reimbursementId: request.id, outcome: 'rejected' }, 'Reimbursement rejected.')}>Reject</Button></> : request.reviewer ?? '—']
  })} /></Card></div></>
}

function ReconciliationPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const confirm = useConfirmation()
  const summary = calculateReconciliationSummary(state)
  const [bankId, setBankId] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const match = async () => { if (!canMatchReconciliation(state, bankId, paymentId)) { showToast('Selected records are not eligible or are already matched.'); return } const accepted = await confirm({ title: 'Confirm reconciliation match', message: 'Match these bank and system records? Each record can only be matched once.', confirmLabel: 'Match transactions' }, () => undefined); if (!accepted) return; dispatch({ type: 'add-reconciliation', match: { id: idFor('match', state.reconciliationMatches.length), bankTransactionId: bankId, paymentTransactionId: paymentId, matchedAt: state.demoDate } }); showToast('Bank transaction matched.') }
  const unmatch = async (matchId: string) => { const accepted = await confirm({ title: 'Unmatch transactions?', message: 'The bank line and payment will return to the unmatched list.', confirmLabel: 'Unmatch', variant: 'warning' }, () => undefined); if (accepted) { dispatch({ type: 'remove-reconciliation', matchId }); showToast('Reconciliation match removed.') } }
  const suggested = state.bankTransactions.flatMap((bank) => state.paymentTransactions.filter((payment) => canMatchReconciliation(state, bank.id, payment.id)).map((payment) => `${bank.reference} ↔ ${payment.reference} · ${money(bank.amount)}`))
  return <><PageHeader eyebrow="Finance" title="Bank Reconciliation" description="Match simulated bank lines to posted system payments without allowing duplicate matches." /><div className="workflow-callout"><div><strong>Last control in the supplier-payment journey</strong><p>Only posted system-side payments can be matched; each bank transaction and payment can be reconciled once.</p></div><StatusBadge tone={summary.unmatched ? 'warning' : 'success'}>{summary.unmatched} unmatched lines</StatusBadge></div><div className="kpi-grid"><Card className="kpi-card"><p>Total lines</p><strong>{summary.total}</strong></Card><Card className="kpi-card"><p>Matched</p><strong>{summary.matched}</strong></Card><Card className="kpi-card"><p>Unmatched</p><strong>{summary.unmatched}</strong></Card><Card className="kpi-card"><p>Matched amount</p><strong>{money(summary.matchedAmount)}</strong></Card></div><Card><div className="form-grid form-grid--three"><FormField label="Unmatched bank line"><select value={bankId} onChange={(event) => setBankId(event.target.value)}><option value="">Select bank line</option>{state.bankTransactions.filter((item) => !item.matched).map((item) => <option key={item.id} value={item.id}>{item.reference} · {money(item.amount)}</option>)}</select></FormField><FormField label="Unmatched system payment"><select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}><option value="">Select payment</option>{state.paymentTransactions.filter((item) => !state.reconciliationMatches.some((matchItem) => matchItem.paymentTransactionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.reference} · {money(item.amount)}</option>)}</select></FormField><Button onClick={match}>Manual match</Button></div>
  {/* <p className="form-hint">Suggested matches: {suggested.length ? suggested.join('; ') : 'No exact amount and direction matches found.'}</p> */}
  <DataTable headers={['Bank reference', 'Description', 'Amount', 'Date', 'Status', 'Matched payment', 'Action']} rows={state.bankTransactions.map((transaction) => { const reconciliation = state.reconciliationMatches.find((item) => item.bankTransactionId === transaction.id); return [transaction.reference, transaction.description, money(transaction.amount), transaction.transactionDate, transaction.matched ? <StatusBadge tone="success">Matched</StatusBadge> : <StatusBadge tone="warning">Unmatched</StatusBadge>, state.paymentTransactions.find((payment) => payment.id === reconciliation?.paymentTransactionId)?.reference ?? '—', reconciliation ? <Button variant="ghost" onClick={() => unmatch(reconciliation.id)}>Unmatch</Button> : '—'] })} /></Card></>
}

function JobCostingPage() {
  const { state } = useAppState()
  const [selectedId, setSelectedId] = useState('')
  const selected = state.jobs.find((job) => job.id === selectedId)
  const rows = state.jobs.map((job) => {
    const result = calculateJobFinancials(state, job.id)
    const unbilled = getEligibleBillableCharges(state)
      .filter((charge) => charge.jobId === job.id)
      .reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0)
    return [
      job.jobNumber,
      state.customers.find((customer) => customer.id === job.customerId)?.name,
      job.serviceType,
      money(result.revenue),
      money(result.supplierCosts + result.fallbackTripCosts),
      money(result.reimbursements + result.tripExpenses),
      money(result.grossProfit),
      `${(result.margin * 100).toFixed(1)}%`,
      money(unbilled),
      result.grossProfit >= 0 ? <StatusBadge tone="success">Positive</StatusBadge> : <StatusBadge tone="danger">Review</StatusBadge>,
      <Button variant="ghost" onClick={() => setSelectedId(job.id)}>Drill down</Button>,
    ]
  })
  const detailRows = selected ? [
    ...getAllBillableCharges(state).filter((item) => item.jobId === selected.id && item.approved).map((item) => ['Customer revenue', item.reference ?? item.description, item.invoiceId || state.customerInvoices.some((invoice) => invoice.lines.some((line) => line.chargeId === item.id)) ? 'Invoiced' : 'Unbilled', money(item.quantity * item.unitPrice)]),
    ...state.supplierCosts.filter((item) => item.jobId === selected.id).map((item) => ['Supplier cost', item.reference ?? item.description, item.approvalStatus ?? (item.posted ? 'posted' : 'pending'), money(item.amount)]),
    ...state.tripExpenses.filter((item) => item.jobId === selected.id).map((item) => ['Trip expense', item.description, item.status, money(item.amount)]),
    ...state.reimbursements.filter((item) => item.jobId === selected.id).map((item) => ['Reimbursement', item.description, item.status, money(item.amount)]),
  ] : []
  return (
    <>
      <PageHeader eyebrow="Management accounting" title="Job Costing" description="" />
      <Card><DataTable headers={['Job Number', 'Customer', 'Service', 'Invoiced revenue', 'Supplier & trip costs', 'Approved expenses', 'Gross profit', 'Margin', 'Unbilled charges', 'Financial status', 'Detail']} rows={rows} /></Card>
      {selected && <Card className="detail-card">
        <div className="section-heading"><div><p className="eyebrow">Costing detail</p><h2>{selected.jobNumber}</h2></div><Button variant="ghost" onClick={() => setSelectedId('')}>Close</Button></div>
        <DataTable headers={['Type', 'Reference / description', 'Status', 'Amount']} rows={detailRows} />
      </Card>}
    </>
  )
}

function StatementsPage() {
  const { state } = useAppState()
  const report = calculateFinancialStatements(state)
  const [period, setPeriod] = useState(state.demoDate.slice(0, 7))
  const periodReport = calculateFinancialStatements(state, period)
  const periodInvoices = state.customerInvoices.filter((invoice) => invoice.issueDate.startsWith(period) && ['approved', 'finalised', 'paid'].includes(invoice.status))
  const periodRevenue = periodReport.revenue
  const expenses = periodReport.costs
  const reimbursedExpenseIds = new Set(state.reimbursements
    .filter((request) => ['approved', 'paid'].includes(request.status))
    .map((request) => request.tripExpenseId)
    .filter((id): id is string => Boolean(id)))
  const fallbackTripCostRows = state.trips.flatMap((trip) => {
    const tripDate = trip.driverMilestones?.at(-1)?.occurredAt ?? trip.actualPickup ?? trip.plannedPickup ?? state.demoDate
    if (!tripDate.startsWith(period)) return []
    const linkedCosts = state.supplierCosts.filter((cost) => cost.tripId === trip.id && isCostIncludedInJobCosting(cost))
    const hasCategory = (category: SupplierCost['category']) => linkedCosts.some((cost) => cost.category === category)
    const hasTruckingCost = hasCategory('trucking') || (trip.subcontractor && hasCategory('freight'))
    return [
      ...(!hasTruckingCost && trip.truckingCost > 0 ? [[tripDate.slice(0, 10), 'Trip operational cost', `${trip.tripNumber} trucking`, money(trip.truckingCost)]] : []),
      ...(!hasCategory('toll') && trip.tollCost > 0 ? [[tripDate.slice(0, 10), 'Trip operational cost', `${trip.tripNumber} toll`, money(trip.tollCost)]] : []),
      ...(!hasCategory('other') && trip.otherCost > 0 ? [[tripDate.slice(0, 10), 'Trip operational cost', `${trip.tripNumber} other`, money(trip.otherCost)]] : []),
    ]
  })
  const periodCostRows = [
    ...state.supplierCosts
      .filter((cost) => isCostIncludedInJobCosting(cost) && (cost.incurredDate ?? state.supplierInvoices.find((invoice) => invoice.id === cost.supplierInvoiceId)?.invoiceDate ?? state.demoDate).startsWith(period))
      .map((cost) => [cost.incurredDate ?? state.demoDate, 'Supplier cost', cost.reference ?? cost.description, money(cost.amount)]),
    ...state.reimbursements
      .filter((request) => ['approved', 'paid'].includes(request.status) && (request.requestedDate ?? state.demoDate).startsWith(period))
      .map((request) => [request.requestedDate ?? state.demoDate, 'Reimbursement', request.description, money(request.amount)]),
    ...state.tripExpenses
      .filter((expense) => ['approved', 'paid'].includes(expense.status) && !expense.supplierCostId && !reimbursedExpenseIds.has(expense.id) && (expense.submittedAt ?? state.demoDate).startsWith(period))
      .map((expense) => [expense.submittedAt ?? state.demoDate, 'Trip expense', expense.description, money(expense.amount)]),
    ...fallbackTripCostRows,
  ]
  const cash = 100000 + state.paymentTransactions.filter((payment) => payment.status === 'posted').reduce((sum, payment) => sum + (payment.invoiceId ? payment.amount : -payment.amount), 0)
  const assets = cash + report.receivables
  const equity = assets - report.payables
  return (
    <>
      <PageHeader eyebrow="Management accounting" title="Financial Statements" description="Simulated management reports from a simplified mock ledger; not production accounting, statutory reporting or compliance statements." />
      <div className="filter-bar"><label>Period <input onChange={(event) => setPeriod(event.target.value)} type="month" value={period} /></label><StatusBadge tone="warning">Demo ledger · MYR</StatusBadge></div>
      <div className="content-grid content-grid--wide">
        <Card><p className="eyebrow">Profit & Loss · {period}</p><h2>Simulated P&L</h2><DataTable headers={['Line item', 'Amount']} rows={ [['Invoiced revenue', money(periodRevenue)], ['Supplier and approved operational costs', money(expenses)], ['Gross profit / (loss)', money(periodRevenue - expenses)], ['Eligible unbilled charges · not revenue', money(periodReport.unbilledCharges)]]} /></Card>
        <Card><p className="eyebrow">Balance Sheet · {state.demoDate}</p><h2>Simulated position</h2><DataTable headers={['Line item', 'Amount']} rows={[['Cash (opening balance + posted receipts/payments)', money(cash)], ['Accounts receivable', money(report.receivables)], ['Total assets', money(assets)], ['Accounts payable', money(report.payables)], ['Demo equity / balancing position', money(equity)], ['Liabilities + equity', money(report.payables + equity)]]} /></Card>
        <Card><p className="eyebrow">Transactions in selected period</p><h2>Revenue and cost detail</h2><DataTable headers={['Date', 'Type', 'Reference', 'Amount']} rows={[...periodInvoices.map((invoice) => [invoice.issueDate, 'Customer invoice', invoice.invoiceNumber, money(invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))]), ...periodCostRows]} /></Card>
      </div>
    </>
  )
}

function AssumptionsPage() {
  const { state } = useAppState()
  return <><PageHeader eyebrow="Administration" title="Financial Demo Assumptions" description="Configurable workflow and ledger assumptions affecting financial workflows." /><Card><DataTable headers={['ID', 'Assumption', 'Reason', 'Affected modules', 'Status', 'Demo behaviour']} rows={state.assumptions.filter((item) => item.affectedModules.some((module) => ['supplier-invoices', 'vouchers', 'reconciliation', 'reimbursements', 'job-costing', 'financial-statements'].includes(module))).map((item) => [item.id, item.description, item.reason, item.affectedModules.join(', '), <StatusBadge tone={item.status === 'demo-assumption' ? 'info' : 'warning'}>{item.status}</StatusBadge>, item.demoBehaviour])} /></Card></>
}

function ExpensesWorkspace() {
  const [tab, setTab] = useState<'costs' | 'invoices' | 'reimbursements'>('invoices')
  return <><div className="billing-tabs"><Button variant={tab === 'invoices' ? 'primary' : 'secondary'} onClick={() => setTab('invoices')}>Supplier invoices</Button><Button variant={tab === 'costs' ? 'primary' : 'secondary'} onClick={() => setTab('costs')}>Supplier costs</Button><Button variant={tab === 'reimbursements' ? 'primary' : 'secondary'} onClick={() => setTab('reimbursements')}>Reimbursements</Button></div>{tab === 'invoices' ? <SupplierInvoicesPage /> : tab === 'costs' ? <CostsPage /> : <ReimbursementsPage />}</>
}

export function FinancialManagement({ kind }: { kind: 'costs' | 'invoices' | 'expenses' | 'vouchers' | 'reimbursements' | 'reconciliation' | 'job-costing' | 'statements' | 'assumptions' }) {
  if (kind === 'costs') return <CostsPage />
  if (kind === 'invoices') return <SupplierInvoicesPage />
  if (kind === 'expenses') return <ExpensesWorkspace />
  if (kind === 'vouchers') return <VouchersPage />
  if (kind === 'reimbursements') return <ReimbursementsPage />
  if (kind === 'reconciliation') return <ReconciliationPage />
  if (kind === 'job-costing') return <JobCostingPage />
  if (kind === 'assumptions') return <AssumptionsPage />
  return <StatementsPage />
}
