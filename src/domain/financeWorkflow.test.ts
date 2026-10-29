import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateFinancialStatements, canMatchReconciliation, isCostIncludedInJobCosting } from './calculations.ts'
import { addInvoiceDocument, addReconciliationDocument, applyFinanceCommand } from './financeWorkflow.ts'
import { seedState } from '../data/seed.ts'
import type { CustomerInvoice, SupplierInvoice } from './types.ts'

function run(state: typeof seedState, command: Parameters<typeof applyFinanceCommand>[1]) {
  const result = applyFinanceCommand(state, command)
  assert.deepEqual(result.errors, [])
  return result.state
}

describe('shared finance workflow', () => {
  it('moves an operational charge through invoice approval, e-invoice and customer email', () => {
    const invoice: CustomerInvoice = {
      id: 'inv-finance-flow',
      invoiceNumber: 'INV-FLOW-001',
      customerId: 'cus-apex',
      jobId: 'job-1002',
      issueDate: seedState.demoDate,
      dueDate: '2026-11-28',
      status: 'draft',
      paymentStatus: 'unpaid',
      lines: [{ id: 'il-finance-flow', chargeId: 'chg-1002', description: 'Customs clearance', quantity: 1, unitPrice: 450, taxRate: 0 }],
      eInvoiceStatus: 'not-submitted',
      emailStatus: 'not-sent',
    }
    let state = addInvoiceDocument({
      ...seedState,
      customerInvoices: [...seedState.customerInvoices, invoice],
    }, invoice)
    state = run(state, { type: 'invoice-review', invoiceId: invoice.id, status: 'pending-approval' })
    state = run(state, { type: 'invoice-review', invoiceId: invoice.id, status: 'approved' })
    state = run(state, { type: 'submit-einvoice', invoiceId: invoice.id, outcome: 'accepted' })
    state = run(state, { type: 'send-invoice-email', invoiceId: invoice.id })

    const completed = state.customerInvoices.find((item) => item.id === invoice.id)
    assert.equal(completed?.status, 'finalised')
    assert.equal(completed?.eInvoiceStatus, 'accepted')
    assert.equal(completed?.emailStatus, 'sent')
    assert.equal(completed?.emailRecipient, 'finance@apex.example')
    assert.deepEqual(
      state.documents.filter((document) => document.relatedRecordId === invoice.id).map((document) => document.category),
      ['invoice', 'einvoice', 'email'],
    )
    assert.equal(state.customerInvoices.find((item) => item.id === invoice.id)?.paymentStatus, 'unpaid')
  })

  it('requires invoice review and reopens rejected invoices through correction', () => {
    const invoice: CustomerInvoice = {
      id: 'inv-correction-flow',
      invoiceNumber: 'INV-FLOW-002',
      customerId: 'cus-apex',
      jobId: 'job-1002',
      issueDate: seedState.demoDate,
      dueDate: '2026-11-28',
      status: 'draft',
      paymentStatus: 'unpaid',
      lines: [{ id: 'il-correction-flow', chargeId: 'chg-1002', description: 'Customs clearance', quantity: 1, unitPrice: 450, taxRate: 0 }],
      eInvoiceStatus: 'not-submitted',
      emailStatus: 'not-sent',
    }
    const state = { ...seedState, customerInvoices: [...seedState.customerInvoices, invoice] }
    assert.ok(applyFinanceCommand(state, { type: 'submit-einvoice', invoiceId: invoice.id, outcome: 'accepted' }).errors.length)
    let next = run(state, { type: 'invoice-review', invoiceId: invoice.id, status: 'pending-approval' })
    next = run(next, { type: 'invoice-review', invoiceId: invoice.id, status: 'rejected' })
    next = run(next, { type: 'invoice-review', invoiceId: invoice.id, status: 'draft' })
    next = run(next, { type: 'invoice-review', invoiceId: invoice.id, status: 'pending-approval' })
    next = run(next, { type: 'invoice-review', invoiceId: invoice.id, status: 'approved' })
    next = run(next, { type: 'submit-einvoice', invoiceId: invoice.id, outcome: 'rejected' })
    assert.equal(next.customerInvoices.find((item) => item.id === invoice.id)?.status, 'rejected')
    assert.equal(next.customerInvoices.find((item) => item.id === invoice.id)?.eInvoiceStatus, 'rejected')
    assert.ok(applyFinanceCommand(next, { type: 'submit-einvoice', invoiceId: invoice.id, outcome: 'accepted' }).errors.length)
  })

  it('validates, approves, posts, pays and reconciles a supplier invoice without skipping states', () => {
    const invoice: SupplierInvoice = {
      id: 'sinv-finance-flow',
      supplierId: 'sup-warepro',
      reference: 'WP-FLOW-009',
      jobId: 'job-1002',
      invoiceDate: seedState.demoDate,
      dueDate: '2026-11-28',
      amount: 250,
      status: 'captured',
      paymentStatus: 'unpaid',
      validationStatus: 'pending',
    }
    let state = { ...seedState, supplierInvoices: [...seedState.supplierInvoices, invoice] }
    state = run(state, { type: 'validate-supplier-invoice', invoiceId: invoice.id })
    const voucher = state.paymentVouchers.find((item) => item.supplierInvoiceId === invoice.id)
    assert.ok(voucher)
    assert.equal(state.supplierInvoices.find((item) => item.id === invoice.id)?.status, 'voucher-created')
    assert.equal(isCostIncludedInJobCosting(state.supplierCosts.find((cost) => cost.supplierInvoiceId === invoice.id)!), false)
    assert.ok(applyFinanceCommand(state, { type: 'pay-voucher', voucherId: voucher.id }).errors.length)
    assert.ok(applyFinanceCommand(state, { type: 'post-voucher', voucherId: voucher.id }).errors.length)

    state = run(state, { type: 'approve-voucher', voucherId: voucher.id })
    assert.equal(state.supplierInvoices.find((item) => item.id === invoice.id)?.status, 'pending-approval')
    assert.equal(isCostIncludedInJobCosting(state.supplierCosts.find((cost) => cost.supplierInvoiceId === invoice.id)!), true)
    state = run(state, { type: 'post-voucher', voucherId: voucher.id })
    assert.equal(state.paymentVouchers.find((item) => item.id === voucher.id)?.status, 'posted')
    assert.equal(state.supplierInvoices.find((item) => item.id === invoice.id)?.status, 'posted')
    const payableBeforePayment = calculateFinancialStatements(state).payables
    state = run(state, { type: 'pay-voucher', voucherId: voucher.id })
    assert.equal(state.paymentVouchers.find((item) => item.id === voucher.id)?.status, 'paid')
    assert.equal(state.supplierInvoices.find((item) => item.id === invoice.id)?.paymentStatus, 'paid')
    assert.equal(state.paymentTransactions.some((item) => item.voucherId === voucher.id && item.supplierInvoiceId === invoice.id), true)
    assert.ok(applyFinanceCommand(state, { type: 'pay-voucher', voucherId: voucher.id }).errors.length)

    const payment = state.paymentTransactions.find((item) => item.voucherId === voucher.id)
    const bank = state.bankTransactions.find((item) => item.description.includes(payment?.reference ?? ''))
    assert.ok(payment && bank)
    assert.equal(canMatchReconciliation(state, bank.id, payment.id), true)
    const match = { id: 'match-finance-flow', bankTransactionId: bank.id, paymentTransactionId: payment.id, matchedAt: seedState.demoDate }
    const reconciled = addReconciliationDocument(state, match)
    assert.ok(reconciled.documents.some((document) => document.relatedRecordId === match.id && document.category === 'reconciliation'))
    assert.equal(payableBeforePayment, calculateFinancialStatements(reconciled).payables + invoice.amount)
  })
})
