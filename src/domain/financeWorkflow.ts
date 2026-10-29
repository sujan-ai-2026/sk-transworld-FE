import type { AppState, CustomerInvoice, DocumentMetadata, PaymentVoucher, ReconciliationMatch, SupplierInvoice, TripExpense } from './types.ts'

export type FinanceCommand =
  | { type: 'invoice-review'; invoiceId: string; status: 'pending-approval' | 'approved' | 'rejected' | 'draft' }
  | { type: 'submit-einvoice'; invoiceId: string; outcome: 'accepted' | 'rejected' }
  | { type: 'send-invoice-email'; invoiceId: string }
  | { type: 'validate-supplier-invoice'; invoiceId: string }
  | { type: 'approve-voucher'; voucherId: string }
  | { type: 'post-voucher'; voucherId: string }
  | { type: 'pay-voucher'; voucherId: string }
  | { type: 'review-reimbursement'; reimbursementId: string; outcome: 'approved' | 'rejected' }

export interface FinanceMutation {
  state: AppState
  errors: string[]
}

function nextId(prefix: string, records: { id: string }[]) {
  let sequence = records.length + 1
  let id = `${prefix}-${String(sequence).padStart(4, '0')}`
  while (records.some((record) => record.id === id)) {
    sequence += 1
    id = `${prefix}-${String(sequence).padStart(4, '0')}`
  }
  return id
}

export function addLinkedDocument(
  state: AppState,
  document: Omit<DocumentMetadata, 'id'> & { id?: string },
) {
  if (state.documents.some((item) => item.category === document.category && item.relatedRecordId === document.relatedRecordId)) {
    return state
  }
  const id = document.id ?? nextId('doc', state.documents)
  return { ...state, documents: [...state.documents, { ...document, id }] }
}

function invoiceActivity(invoice: CustomerInvoice, text: string) {
  return [...(invoice.activity ?? []), text]
}

function invoiceDocument(state: AppState, invoice: CustomerInvoice, category: DocumentMetadata['category'], name: string, previewText: string) {
  return addLinkedDocument(state, {
    jobId: invoice.jobId,
    name,
    category,
    status: 'available',
    uploadedAt: state.demoDate,
    relatedRecordId: invoice.id,
    accessRule: 'finance-only',
    previewText,
  })
}

function applyInvoiceReview(state: AppState, command: Extract<FinanceCommand, { type: 'invoice-review' }>): FinanceMutation {
  const invoice = state.customerInvoices.find((item) => item.id === command.invoiceId)
  if (!invoice) return { state, errors: ['Customer invoice was not found.'] }
  const allowed =
    (invoice.status === 'draft' && command.status === 'pending-approval') ||
    (invoice.status === 'pending-approval' && ['approved', 'rejected'].includes(command.status)) ||
    (invoice.status === 'rejected' && command.status === 'draft')
  if (!allowed) return { state, errors: [`Invoice cannot move from ${invoice.status} to ${command.status}.`] }
  const updated: CustomerInvoice = {
    ...invoice,
    status: command.status,
    ...(command.status === 'draft' ? { eInvoiceStatus: 'not-submitted' as const, eInvoiceReference: undefined, emailStatus: 'not-sent' as const, emailRecipient: undefined } : {}),
    activity: invoiceActivity(invoice, command.status === 'draft'
      ? 'Correction workflow reopened invoice draft'
      : command.status === 'pending-approval'
        ? 'Submitted for finance review'
        : command.status === 'approved'
          ? 'Finance approved invoice'
          : 'Finance rejected invoice; correction required'),
  }
  return { state: { ...state, customerInvoices: state.customerInvoices.map((item) => item.id === invoice.id ? updated : item) }, errors: [] }
}

function applyEInvoiceSubmission(state: AppState, command: Extract<FinanceCommand, { type: 'submit-einvoice' }>): FinanceMutation {
  const invoice = state.customerInvoices.find((item) => item.id === command.invoiceId)
  if (!invoice) return { state, errors: ['Customer invoice was not found.'] }
  if (invoice.status !== 'approved' || invoice.eInvoiceStatus !== 'not-submitted') {
    return { state, errors: ['Only an approved invoice that has not been submitted can be submitted.'] }
  }
  const accepted = command.outcome === 'accepted'
  const updated: CustomerInvoice = {
    ...invoice,
    status: accepted ? 'finalised' : 'rejected',
    eInvoiceStatus: command.outcome,
    eInvoiceReference: accepted ? `EINV-${invoice.invoiceNumber}-OK` : `EINV-REJECTED-${invoice.invoiceNumber}`,
    activity: invoiceActivity(invoice, accepted ? 'Simulated e-invoice accepted' : 'Simulated e-invoice rejected; correction required'),
  }
  const nextState = {
    ...state,
    customerInvoices: state.customerInvoices.map((item) => item.id === invoice.id ? updated : item),
  }
  return {
    state: accepted
      ? invoiceDocument(nextState, invoice, 'einvoice', `${invoice.invoiceNumber} e-invoice acknowledgement`, 'Simulated e-invoice acknowledgement; no external service was called.')
      : nextState,
    errors: [],
  }
}

function applySupplierInvoiceValidation(state: AppState, command: Extract<FinanceCommand, { type: 'validate-supplier-invoice' }>): FinanceMutation {
  const invoice = state.supplierInvoices.find((item) => item.id === command.invoiceId)
  if (!invoice) return { state, errors: ['Supplier invoice was not found.'] }
  if (invoice.status !== 'captured') return { state, errors: ['Only a captured supplier invoice can be validated.'] }
  if (!state.suppliers.some((supplier) => supplier.id === invoice.supplierId) || !state.jobs.some((job) => job.id === invoice.jobId)) {
    return { state, errors: ['Supplier invoice must reference an existing supplier and job.'] }
  }
  if (invoice.tripId && !state.trips.some((trip) => trip.id === invoice.tripId && trip.jobId === invoice.jobId)) {
    return { state, errors: ['The supplier invoice trip must belong to its job.'] }
  }
  if (state.supplierInvoices.some((item) => item.id !== invoice.id && item.supplierId === invoice.supplierId && item.reference.trim().toLowerCase() === invoice.reference.trim().toLowerCase())) {
    return { state, errors: ['Duplicate supplier invoice reference detected for this supplier.'] }
  }
  if (!Number.isFinite(invoice.amount) || invoice.amount <= 0 || state.paymentVouchers.some((voucher) => voucher.supplierInvoiceId === invoice.id)) {
    return { state, errors: ['Invoice amount is invalid or a voucher already exists.'] }
  }

  const voucherId = nextId('vch', state.paymentVouchers)
  const voucherNumber = `PV-${state.demoDate.replaceAll('-', '').slice(2)}-${String(state.paymentVouchers.length + 1).padStart(3, '0')}`
  const voucher: PaymentVoucher = {
    id: voucherId,
    voucherNumber,
    supplierInvoiceId: invoice.id,
    amount: invoice.amount,
    status: 'pending-approval',
  }
  const updatedInvoice = { ...invoice, status: 'voucher-created' as const, validationStatus: 'validated' as const }
  const existingCost = state.supplierCosts.find((cost) => cost.supplierInvoiceId === invoice.id)
  let nextState: AppState = {
    ...state,
    supplierInvoices: state.supplierInvoices.map((item) => item.id === invoice.id ? updatedInvoice : item),
    paymentVouchers: [...state.paymentVouchers, voucher],
    supplierCosts: existingCost ? state.supplierCosts : [...state.supplierCosts, {
      id: nextId('cost', state.supplierCosts),
      supplierId: invoice.supplierId,
      jobId: invoice.jobId,
      tripId: invoice.tripId,
      category: invoice.costCategory ?? 'other',
      description: `Supplier invoice ${invoice.reference}`,
      reference: invoice.reference,
      amount: invoice.amount,
      currency: 'MYR',
      classification: 'actual',
      incurredDate: invoice.invoiceDate,
      posted: false,
      approvalStatus: 'pending',
      supplierInvoiceId: invoice.id,
      supportingDocumentId: invoice.supportingDocumentId,
    }],
  }
  if (invoice.supportingDocumentId) {
    nextState = {
      ...nextState,
      documents: nextState.documents.map((document) => document.id === invoice.supportingDocumentId
        ? { ...document, relatedRecordId: invoice.id }
        : document),
    }
  }
  nextState = addLinkedDocument(nextState, {
    jobId: invoice.jobId,
    name: `${invoice.reference} supplier invoice`,
    category: 'supplier-invoice',
    status: 'available',
    uploadedAt: invoice.invoiceDate,
    relatedRecordId: invoice.id,
    accessRule: 'finance-only',
    previewText: 'Supplier invoice metadata linked to the validated source record.',
  })
  nextState = addLinkedDocument(nextState, {
    jobId: invoice.jobId,
    name: `${voucherNumber} payment voucher`,
    category: 'voucher',
    status: 'available',
    uploadedAt: state.demoDate,
    relatedRecordId: voucher.id,
    accessRule: 'finance-only',
    previewText: 'Payment voucher created; no payment has been made.',
  })
  return { state: nextState, errors: [] }
}

function applyVoucherApproval(state: AppState, voucherId: string): FinanceMutation {
  const voucher = state.paymentVouchers.find((item) => item.id === voucherId)
  if (!voucher) return { state, errors: ['Payment voucher was not found.'] }
  if (voucher.status !== 'draft' && voucher.status !== 'pending-approval') return { state, errors: ['Only a draft or pending voucher can be approved.'] }
  const invoice = voucher.supplierInvoiceId ? state.supplierInvoices.find((item) => item.id === voucher.supplierInvoiceId) : undefined
  if (voucher.supplierInvoiceId && (!invoice || invoice.status !== 'voucher-created')) return { state, errors: ['The linked supplier invoice is not awaiting voucher approval.'] }
  if (voucher.reimbursementId && !state.reimbursements.some((request) => request.id === voucher.reimbursementId && request.status === 'approved')) {
    return { state, errors: ['The linked reimbursement must be approved first.'] }
  }
  return {
    state: {
      ...state,
      paymentVouchers: state.paymentVouchers.map((item) => item.id === voucher.id ? { ...item, status: 'approved' } : item),
      supplierInvoices: invoice ? state.supplierInvoices.map((item) => item.id === invoice.id ? { ...item, status: 'pending-approval' } : item) : state.supplierInvoices,
      supplierCosts: state.supplierCosts.map((cost) => cost.supplierInvoiceId === invoice?.id ? { ...cost, approvalStatus: 'approved' } : cost),
    },
    errors: [],
  }
}

function applyVoucherPosting(state: AppState, voucherId: string): FinanceMutation {
  const voucher = state.paymentVouchers.find((item) => item.id === voucherId)
  if (!voucher) return { state, errors: ['Payment voucher was not found.'] }
  if (voucher.status !== 'approved') return { state, errors: ['Approve the voucher before posting it.'] }
  const invoice = voucher.supplierInvoiceId ? state.supplierInvoices.find((item) => item.id === voucher.supplierInvoiceId) : undefined
  if (voucher.supplierInvoiceId && (!invoice || invoice.status !== 'pending-approval')) return { state, errors: ['The linked supplier invoice is not approved for posting.'] }
  const linkedCost = invoice && state.supplierCosts.find((cost) => cost.supplierInvoiceId === invoice.id)
  const createManualCost = !invoice && voucher.jobId && voucher.supplierId && !state.supplierCosts.some((cost) => cost.reference === voucher.voucherNumber)
  if (!invoice && voucher.jobId && voucher.supplierId && !state.jobs.some((job) => job.id === voucher.jobId)) {
    return { state, errors: ['The manual voucher job was not found.'] }
  }
  if (!invoice && voucher.supplierId && !state.suppliers.some((supplier) => supplier.id === voucher.supplierId)) {
    return { state, errors: ['The manual voucher supplier was not found.'] }
  }
  const supplierCosts = linkedCost
    ? state.supplierCosts.map((cost) => cost.id === linkedCost.id ? { ...cost, posted: true, approvalStatus: 'approved' as const } : cost)
    : createManualCost
      ? [...state.supplierCosts, {
        id: nextId('cost', state.supplierCosts),
        supplierId: voucher.supplierId!,
        jobId: voucher.jobId!,
        category: 'other' as const,
        description: voucher.description ?? 'Manual expense voucher',
        reference: voucher.voucherNumber,
        amount: voucher.amount,
        currency: 'MYR' as const,
        classification: 'actual' as const,
        incurredDate: state.demoDate,
        posted: true,
        approvalStatus: 'approved' as const,
      }]
      : state.supplierCosts
  return {
    state: {
      ...state,
      paymentVouchers: state.paymentVouchers.map((item) => item.id === voucher.id ? { ...item, status: 'posted' } : item),
      supplierInvoices: invoice ? state.supplierInvoices.map((item) => item.id === invoice.id ? { ...item, status: 'posted' } : item) : state.supplierInvoices,
      supplierCosts,
    },
    errors: [],
  }
}

function applyVoucherPayment(state: AppState, voucherId: string): FinanceMutation {
  const voucher = state.paymentVouchers.find((item) => item.id === voucherId)
  if (!voucher) return { state, errors: ['Payment voucher was not found.'] }
  if (voucher.status !== 'posted') return { state, errors: ['Only a posted voucher can be paid.'] }
  if (state.paymentTransactions.some((payment) => payment.voucherId === voucher.id || (voucher.supplierInvoiceId && payment.supplierInvoiceId === voucher.supplierInvoiceId) || (voucher.reimbursementId && payment.reimbursementId === voucher.reimbursementId))) {
    return { state, errors: ['A payment is already recorded for this voucher.'] }
  }
  if (!Number.isFinite(voucher.amount) || voucher.amount <= 0) return { state, errors: ['Voucher amount must be positive.'] }
  const invoice = voucher.supplierInvoiceId ? state.supplierInvoices.find((item) => item.id === voucher.supplierInvoiceId) : undefined
  if (voucher.supplierInvoiceId && (!invoice || invoice.status !== 'posted' || invoice.paymentStatus === 'paid' || Math.abs(invoice.amount - voucher.amount) >= 0.01)) {
    return { state, errors: ['The linked supplier invoice must be posted, unpaid and equal to the voucher amount.'] }
  }
  const reimbursement = voucher.reimbursementId ? state.reimbursements.find((item) => item.id === voucher.reimbursementId) : undefined
  if (voucher.reimbursementId && (!reimbursement || reimbursement.status !== 'approved' || Math.abs(reimbursement.amount - voucher.amount) >= 0.01)) {
    return { state, errors: ['The linked reimbursement must be approved and equal to the voucher amount.'] }
  }
  const sequence = state.paymentTransactions.length + 1
  const paymentId = nextId('pay', state.paymentTransactions)
  const paymentReference = `PAY-${String(sequence).padStart(4, '0')}`
  const bankId = nextId('bank', state.bankTransactions)
  const bankReference = `BANK-${String(state.bankTransactions.length + 1).padStart(3, '0')}`
  return {
    state: {
      ...state,
      paymentVouchers: state.paymentVouchers.map((item) => item.id === voucher.id ? { ...item, status: 'paid' } : item),
      supplierInvoices: invoice ? state.supplierInvoices.map((item) => item.id === invoice.id ? { ...item, status: 'paid', paymentStatus: 'paid' } : item) : state.supplierInvoices,
      reimbursements: reimbursement ? state.reimbursements.map((item) => item.id === reimbursement.id ? { ...item, status: 'paid', paymentStatus: 'paid' } : item) : state.reimbursements,
      paymentTransactions: [...state.paymentTransactions, {
        id: paymentId,
        reference: paymentReference,
        supplierInvoiceId: invoice?.id,
        reimbursementId: reimbursement?.id,
        voucherId: voucher.id,
        amount: voucher.amount,
        transactionDate: state.demoDate,
        status: 'posted',
      }],
      bankTransactions: [...state.bankTransactions, {
        id: bankId,
        reference: bankReference,
        description: `Simulated voucher payment ${paymentReference}`,
        amount: voucher.amount,
        transactionDate: state.demoDate,
        direction: 'debit',
        matched: false,
      }],
    },
    errors: [],
  }
}

export function applyFinanceCommand(state: AppState, command: FinanceCommand): FinanceMutation {
  if (command.type === 'invoice-review') return applyInvoiceReview(state, command)
  if (command.type === 'submit-einvoice') return applyEInvoiceSubmission(state, command)
  if (command.type === 'send-invoice-email') {
    const invoice = state.customerInvoices.find((item) => item.id === command.invoiceId)
    if (!invoice) return { state, errors: ['Customer invoice was not found.'] }
    if (invoice.eInvoiceStatus !== 'accepted' || invoice.emailStatus !== 'not-sent') {
      return { state, errors: ['Only an accepted e-invoice that has not been emailed can be sent.'] }
    }
    const customer = state.customers.find((item) => item.id === invoice.customerId)
    if (!customer?.email) return { state, errors: ['The customer has no email address on file.'] }
    const updated = {
      ...invoice,
      emailStatus: 'sent' as const,
      emailRecipient: customer.email,
      activity: invoiceActivity(invoice, `Simulated email sent to ${customer.email}`),
    }
    const nextState = { ...state, customerInvoices: state.customerInvoices.map((item) => item.id === invoice.id ? updated : item) }
    return {
      state: addLinkedDocument(nextState, {
        jobId: invoice.jobId,
        name: `${invoice.invoiceNumber} customer email`,
        category: 'email',
        status: 'available',
        uploadedAt: state.demoDate,
        relatedRecordId: invoice.id,
        accessRule: 'finance-only',
        previewText: `Simulated invoice email sent to ${customer.email}; no external email service was called.`,
      }),
      errors: [],
    }
  }
  if (command.type === 'validate-supplier-invoice') return applySupplierInvoiceValidation(state, command)
  if (command.type === 'approve-voucher') return applyVoucherApproval(state, command.voucherId)
  if (command.type === 'post-voucher') return applyVoucherPosting(state, command.voucherId)
  if (command.type === 'pay-voucher') return applyVoucherPayment(state, command.voucherId)
  if (command.type === 'review-reimbursement') {
    const request = state.reimbursements.find((item) => item.id === command.reimbursementId)
    if (!request) return { state, errors: ['Reimbursement request was not found.'] }
    if (request.status !== 'submitted') return { state, errors: ['Only a submitted reimbursement can be reviewed.'] }
    const reimbursements = state.reimbursements.map((item) => item.id === request.id
      ? { ...item, status: command.outcome, reviewer: 'Aina Noor' }
      : item)
    if (command.outcome === 'rejected') return { state: { ...state, reimbursements }, errors: [] }
    if (state.paymentVouchers.some((voucher) => voucher.reimbursementId === request.id)) {
      return { state, errors: ['A voucher already exists for this reimbursement.'] }
    }
    const voucherNumber = `PV-${state.demoDate.replaceAll('-', '').slice(2)}-${String(state.paymentVouchers.length + 1).padStart(3, '0')}`
    const voucher: PaymentVoucher = {
      id: nextId('vch', state.paymentVouchers),
      voucherNumber,
      reimbursementId: request.id,
      jobId: request.jobId,
      description: request.description,
      amount: request.amount,
      status: 'pending-approval',
    }
    let nextState = { ...state, reimbursements, paymentVouchers: [...state.paymentVouchers, voucher] }
    if (request.jobId) {
      nextState = addLinkedDocument(nextState, {
        jobId: request.jobId,
        name: `${voucherNumber} reimbursement voucher`,
        category: 'voucher',
        status: 'available',
        uploadedAt: state.demoDate,
        relatedRecordId: voucher.id,
        accessRule: 'finance-only',
        previewText: 'Reimbursement voucher created; payment remains pending.',
      })
    }
    return { state: nextState, errors: [] }
  }
  return { state, errors: ['Unsupported finance action.'] }
}

export function addInvoiceDocument(state: AppState, invoice: CustomerInvoice) {
  return invoiceDocument(state, invoice, 'invoice', `${invoice.invoiceNumber} customer invoice`, 'Customer invoice draft linked to its source charges.')
}

export function addVoucherDocument(state: AppState, voucher: PaymentVoucher) {
  if (!voucher.jobId) return state
  return addLinkedDocument(state, {
    jobId: voucher.jobId,
    name: `${voucher.voucherNumber} payment voucher`,
    category: 'voucher',
    status: 'available',
    uploadedAt: state.demoDate,
    relatedRecordId: voucher.id,
    accessRule: 'finance-only',
    previewText: 'Payment voucher created; no payment has been made.',
  })
}

export function addSupplierInvoiceDocument(state: AppState, invoice: SupplierInvoice) {
  let nextState = invoice.supportingDocumentId
    ? {
      ...state,
      documents: state.documents.map((document) => document.id === invoice.supportingDocumentId
        ? { ...document, relatedRecordId: invoice.id }
        : document),
    }
    : state
  nextState = addLinkedDocument(nextState, {
    jobId: invoice.jobId,
    name: `${invoice.reference} supplier invoice`,
    category: 'supplier-invoice',
    status: 'available',
    uploadedAt: invoice.invoiceDate,
    relatedRecordId: invoice.id,
    accessRule: 'finance-only',
    previewText: 'Supplier invoice document metadata linked to its source record.',
  })
  return nextState
}

export function addTripExpenseDocument(state: AppState, expense: TripExpense) {
  if (!expense.receiptName) return state
  return addLinkedDocument(state, {
    jobId: expense.jobId,
    name: expense.receiptName,
    category: 'receipt',
    status: 'pending-review',
    uploadedAt: expense.submittedAt?.slice(0, 10) ?? state.demoDate,
    relatedRecordId: expense.id,
    accessRule: 'finance-only',
    previewText: 'Driver receipt metadata stored locally; no external upload was performed.',
  })
}

export function addReconciliationDocument(state: AppState, match: ReconciliationMatch) {
  const payment = state.paymentTransactions.find((item) => item.id === match.paymentTransactionId)
  const supplierInvoice = payment?.supplierInvoiceId ? state.supplierInvoices.find((item) => item.id === payment.supplierInvoiceId) : undefined
  const customerInvoice = payment?.invoiceId ? state.customerInvoices.find((item) => item.id === payment.invoiceId) : undefined
  const reimbursement = payment?.reimbursementId ? state.reimbursements.find((item) => item.id === payment.reimbursementId) : undefined
  const jobId = supplierInvoice?.jobId ?? customerInvoice?.jobId ?? reimbursement?.jobId
  if (!jobId) return state
  const bank = state.bankTransactions.find((item) => item.id === match.bankTransactionId)
  return addLinkedDocument(state, {
    jobId,
    name: `${bank?.reference ?? 'Bank'} reconciliation evidence`,
    category: 'reconciliation',
    status: 'available',
    uploadedAt: match.matchedAt,
    relatedRecordId: match.id,
    accessRule: 'finance-only',
    previewText: 'Simulated bank-to-system transaction match evidence.',
  })
}
