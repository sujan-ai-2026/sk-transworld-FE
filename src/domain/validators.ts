import type { AppState, Charge, CustomerInvoice, Job, SupplierInvoice } from './types.ts'
import { calculateInvoiceTotals } from './calculations.ts'

export function validateUniqueJobNumber(state: AppState, jobNumber: string, excludeId?: string) {
  return !state.jobs.some((job) => job.jobNumber === jobNumber && job.id !== excludeId)
}
export function validateJob(state: AppState, job: Pick<Job, 'jobNumber' | 'customerId'>, excludeId?: string): string[] {
  const errors: string[] = []
  if (!job.jobNumber.trim()) errors.push('Job Number is required.')
  if (!validateUniqueJobNumber(state, job.jobNumber, excludeId)) errors.push('Job Number must be unique.')
  if (!state.customers.some((customer) => customer.id === job.customerId)) errors.push('Customer must reference an existing record.')
  return errors
}
export function validateCharge(state: AppState, charge: Charge) {
  const errors: string[] = []
  if (!state.jobs.some((job) => job.id === charge.jobId)) errors.push('Charge must reference a valid job.')
  if (charge.invoiceId && state.customerInvoices.some((invoice) => invoice.id === charge.invoiceId && invoice.lines.some((line) => line.chargeId === charge.id))) errors.push('Charge cannot be included twice.')
  return errors
}
export function validateInvoice(state: AppState, invoice: CustomerInvoice) {
  const errors: string[] = []
  const lineChargeIds = invoice.lines.map((line) => line.chargeId)
  if (new Set(lineChargeIds).size !== lineChargeIds.length) errors.push('An invoice cannot include a charge twice.')
  if (lineChargeIds.some((chargeId) => state.charges.some((charge) => charge.id === chargeId && charge.invoiceId && charge.invoiceId !== invoice.id))) errors.push('One or more charges are already invoiced.')
  if (calculateInvoiceTotals(invoice).total <= 0) errors.push('Invoice total must be greater than zero.')
  return errors
}
export function validateSupplierInvoice(state: AppState, invoice: Pick<SupplierInvoice, 'reference'> & Partial<Pick<SupplierInvoice, 'supplierId'>>, excludeId?: string) {
  return state.supplierInvoices.some((item) => item.id !== excludeId
    && (!invoice.supplierId || item.supplierId === invoice.supplierId)
    && item.reference.trim().toLowerCase() === invoice.reference.trim().toLowerCase())
    ? ['Supplier invoice reference already exists for this supplier.']
    : []
}
