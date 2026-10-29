import { seedState } from '../data/seed.ts'
import type { AppState, Charge, Customer, CustomerInvoice, Job } from '../domain/types.ts'
import { validateCharge, validateInvoice, validateJob } from '../domain/validators.ts'
import { generateJobNumber, generateStableId } from './mockDataService.ts'

export { generateJobNumber }

const STORAGE_KEY = 'sk-transworld-clms-demo-v1'

export function cloneSeedState(): AppState {
  return structuredClone(seedState)
}

const collectionKeys: Array<keyof AppState> = [
  'storageRules', 'customers', 'suppliers', 'quotationRequests', 'quotations', 'jobs', 'shipments',
  'shipmentMilestones', 'jobMilestones', 'forwardingRecords', 'containers', 'containerEvents', 'customsRecords', 'drivers',
  'trucks', 'trailers', 'trips', 'tripExpenses', 'warehouseInbounds', 'goodsReceivedNotes', 'outboundOrders',
  'warehouseTransactions', 'inventory', 'storageCharges', 'documents', 'charges', 'supplierCosts',
  'reimbursements', 'customerInvoices', 'supplierInvoices', 'paymentVouchers', 'paymentTransactions',
  'bankTransactions', 'reconciliationMatches', 'alerts', 'activity', 'users', 'assumptions',
]

function isStoredState(value: unknown): value is Partial<AppState> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function migrateStoredState(value: Partial<AppState>): AppState {
  const migrated = { ...cloneSeedState(), ...value } as AppState
  for (const key of collectionKeys) {
    if (!Array.isArray(migrated[key])) Object.assign(migrated, { [key]: seedState[key] })
  }
  if (typeof migrated.demoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(migrated.demoDate)) {
    migrated.demoDate = seedState.demoDate
  }

  const legacyInventoryId = 'inv-1001'
  const inventoryId = 'inventory-1001'
  migrated.inventory = migrated.inventory.map((item) => ({
    ...item,
    id: item.id === legacyInventoryId ? inventoryId : item.id,
    customerId: item.customerId ?? migrated.jobs.find((job) => job.id === item.jobId)?.customerId,
  }))
  migrated.trips = migrated.trips.map((trip) => {
    const storedStatus = String(trip.status)
    const status = storedStatus === 'Delivered' ? 'completed' : storedStatus === 'at-port' || storedStatus === 'In-Transit' ? 'in-progress' : trip.status
    return {
      ...trip,
      status,
      plannedDelivery: trip.plannedDelivery ?? trip.ladenDelivery ?? trip.returnEmpty,
      estimatedTruckingCost: trip.estimatedTruckingCost ?? trip.truckingCost,
      estimatedTollCost: trip.estimatedTollCost ?? trip.tollCost,
      estimatedOtherCost: trip.estimatedOtherCost ?? trip.otherCost,
    }
  })
  migrated.trucks = migrated.trucks.map((truck) => ({ ...truck, vehicleDocuments: truck.vehicleDocuments ?? [] }))
  migrated.trailers = migrated.trailers.map((trailer) => ({ ...trailer, status: trailer.status ?? 'available', documentStatus: trailer.documentStatus ?? 'valid' }))
  migrated.warehouseTransactions = migrated.warehouseTransactions.map((transaction) => {
    const hasOneInventory = migrated.inventory.filter((item) => item.jobId === transaction.jobId).length === 1
    return {
      ...transaction,
      inventoryId: transaction.inventoryId === legacyInventoryId ? inventoryId : transaction.inventoryId ?? (hasOneInventory ? migrated.inventory.find((item) => item.jobId === transaction.jobId)?.id : undefined),
    }
  })
  migrated.warehouseInbounds = migrated.warehouseInbounds.map((inbound) => ({
    ...inbound,
    inventoryId: inbound.inventoryId === legacyInventoryId ? inventoryId : inbound.inventoryId,
  }))
  migrated.outboundOrders = migrated.outboundOrders.map((order) => ({
    ...order,
    inventoryId: order.inventoryId === legacyInventoryId ? inventoryId : order.inventoryId,
  }))
  migrated.storageCharges = migrated.storageCharges.map((charge) => ({
    ...charge,
    inventoryId: charge.inventoryId === legacyInventoryId ? inventoryId : charge.inventoryId,
  }))
  migrated.supplierCosts = migrated.supplierCosts.map((cost) => {
    const jobTrips = migrated.trips.filter((trip) => trip.jobId === cost.jobId)
    return { ...cost, tripId: cost.tripId ?? (jobTrips.length === 1 ? jobTrips[0].id : undefined) }
  })
  migrated.reimbursements = migrated.reimbursements.map((request) => {
    const expense = migrated.tripExpenses.find((item) => item.jobId === request.jobId && item.amount === request.amount && item.description === request.description)
    return { ...request, tripExpenseId: request.tripExpenseId ?? expense?.id }
  })
  return migrated
}

export function loadState(): AppState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isStoredState(parsed)) return migrateStoredState(parsed)
      console.warn('CLMS demo data was not an object. Restoring deterministic seed data.')
    }
  } catch (error) {
    console.warn('CLMS demo data could not be loaded from local storage. Restoring deterministic seed data.', error)
  }
  return cloneSeedState()
}
export function saveState(state: AppState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('CLMS demo data could not be saved to local storage.', error)
  }
}
export function resetState() {
  const state = cloneSeedState()
  try { window.localStorage.removeItem(STORAGE_KEY) } catch (error) { console.warn('CLMS demo data could not be cleared from local storage.', error) }
  return state
}
export function generateReference(prefix: string, records: Array<{ id: string }>, date: string) {
  const day = date.replaceAll('-', '').slice(2)
  return `${prefix}-${day}-${String(records.length + 1).padStart(3, '0')}`
}
export function createCustomer(state: AppState, customer: Omit<Customer, 'id'>): AppState {
  return { ...state, customers: [...state.customers, { ...customer, id: generateStableId('cus', state.customers) }] }
}
export function createJob(state: AppState, job: Omit<Job, 'id'>): { state: AppState; errors: string[] } {
  const errors = validateJob(state, job)
  if (errors.length) return { state, errors }
  const next = { ...job, id: generateStableId('job', state.jobs) }
  return { state: { ...state, jobs: [...state.jobs, next] }, errors: [] }
}
export function updateJobStatus(state: AppState, jobId: string, status: Job['status']): AppState {
  return { ...state, jobs: state.jobs.map((job) => job.id === jobId ? { ...job, status } : job) }
}
export function createCharge(state: AppState, charge: Omit<Charge, 'id'>): { state: AppState; errors: string[] } {
  const next = { ...charge, id: generateStableId('chg', state.charges) }
  const duplicate = state.charges.some((item) => item.jobId === charge.jobId && item.description === charge.description && item.quantity === charge.quantity && item.unitPrice === charge.unitPrice)
  const errors = [...validateCharge(state, next), ...(duplicate ? ['An equivalent charge already exists for this job.'] : [])]
  return errors.length ? { state, errors } : { state: { ...state, charges: [...state.charges, next] }, errors: [] }
}
export function createInvoice(state: AppState, invoice: Omit<CustomerInvoice, 'id'>): { state: AppState; errors: string[] } {
  const next = { ...invoice, id: generateStableId('inv', state.customerInvoices) }
  const errors = validateInvoice(state, next)
  if (errors.length) return { state, errors }
  const charges = state.charges.map((charge) => next.lines.some((line) => line.chargeId === charge.id) ? { ...charge, invoiceId: next.id } : charge)
  return { state: { ...state, customerInvoices: [...state.customerInvoices, next], charges }, errors: [] }
}
export function searchRecords<T extends Record<string, unknown>>(records: T[], query: string, fields: Array<keyof T>) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return records
  return records.filter((record) => fields.some((field) => String(record[field] ?? '').toLowerCase().includes(normalized)))
}
export function filterByStatus<T extends { status: string }>(records: T[], status?: T['status']) {
  return status ? records.filter((record) => record.status === status) : records
}

export { STORAGE_KEY }
