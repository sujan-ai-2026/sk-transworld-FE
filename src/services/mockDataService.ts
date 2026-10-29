import type { AppState } from '../domain/types.ts'
import { calculateAvailableInventory, calculateStorageChargePreview, canMatchReconciliation } from '../domain/calculations.ts'
import { validateInvoice, validateJob, validateSupplierInvoice } from '../domain/validators.ts'

export type RecordCollection = {
  [K in keyof AppState]-?: AppState[K] extends Array<{ id: string }> ? K : never
}[keyof AppState]

export type RecordFor<K extends RecordCollection> = Extract<AppState[K][number], { id: string }>
export type AnyRecord = {
  [K in RecordCollection]: RecordFor<K>
}[RecordCollection]

export interface MutationResult<T> {
  state: AppState
  record?: T
  errors: string[]
}

export interface StorageChargeCreation {
  state: AppState
  storageCharge?: RecordFor<'storageCharges'>
  charge?: RecordFor<'charges'>
  errors: string[]
}

const collectionPrefixes: Record<RecordCollection, string> = {
  storageRules: 'storage',
  customers: 'cus',
  suppliers: 'sup',
  quotationRequests: 'qreq',
  quotations: 'quo',
  jobs: 'job',
  shipments: 'shp',
  shipmentMilestones: 'sm',
  jobMilestones: 'jm',
  forwardingRecords: 'fwd',
  containers: 'con',
  containerEvents: 'cev',
  customsRecords: 'cusrec',
  drivers: 'drv',
  trucks: 'trk',
  trailers: 'trl',
  trips: 'trip',
  tripExpenses: 'texp',
  warehouseInbounds: 'win',
  goodsReceivedNotes: 'grn',
  outboundOrders: 'out',
  warehouseTransactions: 'wh',
  inventory: 'inventory',
  storageCharges: 'stchg',
  documents: 'doc',
  charges: 'chg',
  supplierCosts: 'cost',
  reimbursements: 'reim',
  customerInvoices: 'inv',
  supplierInvoices: 'sinv',
  paymentVouchers: 'vch',
  paymentTransactions: 'pay',
  bankTransactions: 'bank',
  reconciliationMatches: 'match',
  alerts: 'alert',
  activity: 'act',
  users: 'usr',
  assumptions: 'ASM',
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function generateStableId(prefix: string, records: readonly { id: string }[]) {
  const expression = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i')
  const highest = records.reduce((max, record) => {
    const sequence = expression.exec(record.id)?.[1]
    return sequence ? Math.max(max, Number(sequence)) : max
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}

export function generateRecordId<K extends RecordCollection>(state: AppState, collection: K) {
  return generateStableId(collectionPrefixes[collection], state[collection])
}

export function generateJobNumber(state: AppState, date = state.demoDate) {
  if (!isValidDateOnly(date)) {
    throw new Error('Job Number generation requires a valid YYYY-MM-DD date.')
  }
  const prefix = 'SKI'
  const dateCode = date.replaceAll('-', '').slice(2)
  const next = state.jobs
    .map((job) => job.jobNumber)
    .filter((number) => number.startsWith(`${prefix}${dateCode}`))
    .reduce((highest, number) => Math.max(highest, Number(number.slice((`${prefix}${dateCode}`).length)) || 0), 0) + 1
  let sequence = next
  let candidate = `${prefix}${dateCode}${String(sequence).padStart(3, '0')}`
  while (state.jobs.some((job) => job.jobNumber === candidate)) {
    sequence += 1
    candidate = `${prefix}${dateCode}${String(sequence).padStart(3, '0')}`
  }
  return candidate
}

export function createJobRecord(
  state: AppState,
  input: Omit<RecordFor<'jobs'>, 'id' | 'jobNumber'> & { id?: string; jobNumber?: string },
) {
  return createRecord(state, 'jobs', { ...input, jobNumber: input.jobNumber ?? generateJobNumber(state) })
}

export function getRecords<K extends RecordCollection>(state: AppState, collection: K): RecordFor<K>[] {
  return state[collection] as RecordFor<K>[]
}

export function getRecord<K extends RecordCollection>(state: AppState, collection: K, id: string) {
  return getRecords(state, collection).find((record) => record.id === id)
}

function findById(state: AppState, collection: RecordCollection, id: string) {
  return (state[collection] as Array<{ id: string }>).some((record) => record.id === id)
}

function commonRelationshipErrors(state: AppState, record: AnyRecord) {
  const errors: string[] = []
  const row: Record<string, unknown> = { ...record }
  const references: Array<[string, RecordCollection]> = [
    ['customerId', 'customers'],
    ['supplierId', 'suppliers'],
    ['quotationId', 'quotations'],
    ['jobId', 'jobs'],
    ['shipmentId', 'shipments'],
    ['containerId', 'containers'],
    ['driverId', 'drivers'],
    ['truckId', 'trucks'],
    ['trailerId', 'trailers'],
    ['tripId', 'trips'],
    ['inventoryId', 'inventory'],
    ['storageRuleId', 'storageRules'],
    ['warehouseInboundId', 'warehouseInbounds'],
    ['transactionId', 'warehouseTransactions'],
    ['supplierInvoiceId', 'supplierInvoices'],
    ['invoiceId', 'customerInvoices'],
    ['chargeId', 'charges'],
    ['tripExpenseId', 'tripExpenses'],
    ['supportingDocumentId', 'documents'],
    ['bankTransactionId', 'bankTransactions'],
    ['paymentTransactionId', 'paymentTransactions'],
    ['reimbursementId', 'reimbursements'],
  ]
  for (const [field, collection] of references) {
    const id = row[field]
    if (typeof id === 'string' && !findById(state, collection, id)) {
      errors.push(`${field} must reference an existing ${String(collection)} record.`)
    }
  }
  return errors
}

function recordErrors<K extends RecordCollection>(state: AppState, collection: K, record: RecordFor<K>): string[] {
  const errors = commonRelationshipErrors(state, record)
  const row: Record<string, unknown> = { ...record }

  if (collection === 'jobs' && typeof row.jobNumber === 'string' && typeof row.customerId === 'string') {
    errors.push(...validateJob(state, { jobNumber: row.jobNumber, customerId: row.customerId }, record.id))
  }
  if (collection === 'customerInvoices') {
    const invoice = record as RecordFor<'customerInvoices'>
    errors.push(...validateInvoice(state, invoice))
    const lineIds = invoice.lines.map((line) => line.id)
    if (new Set(lineIds).size !== lineIds.length) errors.push('Invoice line IDs must be unique.')
    if (state.customerInvoices.filter((item) => item.id !== invoice.id).some((item) => item.lines.some((line) => lineIds.includes(line.id)))) errors.push('Invoice line IDs must not be reused.')
    if (!state.customers.some((customer) => customer.id === invoice.customerId) || !state.jobs.some((job) => job.id === invoice.jobId && job.customerId === invoice.customerId)) {
      errors.push('Invoice customer and job must belong to the same customer.')
    }
    const chargeIds = invoice.lines.map((line) => line.chargeId)
    if (chargeIds.some((id) => !state.charges.some((charge) => charge.id === id && charge.jobId === invoice.jobId && charge.customerId === invoice.customerId))) {
      errors.push('Invoice lines must reference charges for the same job and customer.')
    }
  }
  if (collection === 'supplierInvoices') {
    const invoice = record as RecordFor<'supplierInvoices'>
    errors.push(...validateSupplierInvoice(state, invoice, invoice.id))
  }
  if (collection === 'quotationRequests' || collection === 'quotations') {
    const customerId = row.customerId
    const quotationId = row.quotationId
    if (typeof customerId === 'string' && !state.customers.some((customer) => customer.id === customerId)) errors.push('Customer must reference an existing record.')
    if (typeof quotationId === 'string' && collection === 'quotationRequests') {
      const quotation = state.quotations.find((item) => item.id === quotationId)
      if (!quotation || quotation.customerId !== customerId) errors.push('Quotation request must link to a quotation for the same customer.')
    }
    if (collection === 'quotations') {
      const quotation = record as RecordFor<'quotations'>
      const lineIds = quotation.lines.map((line) => line.id)
      if (new Set(lineIds).size !== lineIds.length) errors.push('Quotation line IDs must be unique.')
      if (state.quotations.filter((item) => item.id !== quotation.id).some((item) => item.lines.some((line) => lineIds.includes(line.id)))) errors.push('Quotation line IDs must not be reused.')
    }
  }
  if (collection === 'shipments' || collection === 'shipmentMilestones' || collection === 'forwardingRecords' || collection === 'containers' || collection === 'customsRecords' || collection === 'trips' || collection === 'tripExpenses' || collection === 'warehouseInbounds' || collection === 'goodsReceivedNotes' || collection === 'outboundOrders' || collection === 'warehouseTransactions' || collection === 'inventory' || collection === 'storageCharges' || collection === 'supplierCosts' || collection === 'documents') {
    const jobId = row.jobId
    if (typeof jobId === 'string' && !state.jobs.some((job) => job.id === jobId)) errors.push('Record must reference an existing job.')
  }
  if (collection === 'shipmentMilestones') {
    const milestone = record as RecordFor<'shipmentMilestones'>
    if (!state.shipments.some((shipment) => shipment.id === milestone.shipmentId && shipment.jobId === milestone.jobId)) errors.push('Shipment milestone must reference a shipment belonging to its job.')
    if (milestone.sourceRecordId && milestone.source === 'trip' || milestone.sourceRecordId && milestone.source === 'driver') {
      if (!state.trips.some((trip) => trip.id === milestone.sourceRecordId && trip.jobId === milestone.jobId)) errors.push('Trip milestone source must reference a trip belonging to its job.')
    }
    if (collection === 'documents') {
      const document = record as RecordFor<'documents'>
      if (document.category === 'pod' && document.relatedRecordId) {
        if (!state.trips.some((trip) => trip.id === document.relatedRecordId && trip.jobId === document.jobId)) errors.push('POD must reference a trip belonging to its job.')
        if (state.documents.some((item) => item.category === 'pod' && item.relatedRecordId === document.relatedRecordId && item.id !== document.id)) errors.push('A POD is already linked to this trip.')
      }
    }
  }
  if (collection === 'forwardingRecords') {
    const forwarding = record as RecordFor<'forwardingRecords'>
    if (!state.shipments.some((shipment) => shipment.id === forwarding.shipmentId && shipment.jobId === forwarding.jobId)) errors.push('Forwarding record must reference a shipment belonging to its job.')
  }
  if (collection === 'containers') {
    const container = record as RecordFor<'containers'>
    if (!state.shipments.some((shipment) => shipment.id === container.shipmentId && shipment.jobId === container.jobId)) errors.push('Container must reference a shipment belonging to its job.')
  }
  if (collection === 'trips') {
    const trip = record as RecordFor<'trips'>
    if (state.trips.some((item) => item.tripNumber === trip.tripNumber && item.id !== trip.id)) errors.push('Trip number must be unique.')
  }
  if (collection === 'tripExpenses') {
    const expense = record as RecordFor<'tripExpenses'>
    if (!state.trips.some((trip) => trip.id === expense.tripId && trip.jobId === expense.jobId)) errors.push('Trip expense must reference a trip belonging to its job.')
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) errors.push('Trip expense amount must be greater than zero.')
  }
  if (collection === 'warehouseInbounds') {
    const inbound = record as RecordFor<'warehouseInbounds'>
    if (!state.warehouseTransactions.some((transaction) => transaction.id === inbound.transactionId && transaction.jobId === inbound.jobId)) errors.push('Warehouse inbound must reference a stock movement for the same job.')
    if (!state.inventory.some((item) => item.id === inbound.inventoryId && item.jobId === inbound.jobId)) errors.push('Warehouse inbound must reference inventory for the same job.')
  }
  if (collection === 'goodsReceivedNotes') {
    const note = record as RecordFor<'goodsReceivedNotes'>
    if (!state.warehouseInbounds.some((inbound) => inbound.id === note.warehouseInboundId && inbound.jobId === note.jobId)) errors.push('Goods received note must reference an inbound record for the same job.')
  }
  if (collection === 'outboundOrders') {
    const order = record as RecordFor<'outboundOrders'>
    if (!state.inventory.some((item) => item.id === order.inventoryId && item.jobId === order.jobId)) errors.push('Outbound order must reference inventory for the same job.')
    if (state.outboundOrders.some((item) => item.jobId === order.jobId && item.deliveryOrderNumber.toLowerCase() === order.deliveryOrderNumber.toLowerCase() && item.id !== order.id)) errors.push('Delivery order number must be unique within its job.')
    if (order.quantity <= 0) errors.push('Outbound quantity must be greater than zero.')
  }
  if (collection === 'warehouseTransactions') {
    const movement = record as RecordFor<'warehouseTransactions'>
    if (!Number.isFinite(movement.quantity) || movement.quantity <= 0) errors.push('Stock movement quantity must be greater than zero.')
    if (movement.inventoryId && !state.inventory.some((item) => item.id === movement.inventoryId && item.jobId === movement.jobId)) errors.push('Stock movement inventory must belong to its job.')
    if (movement.reference && state.warehouseTransactions.some((item) => item.jobId === movement.jobId && item.type === movement.type && item.reference === movement.reference && item.inventoryId === movement.inventoryId && item.id !== movement.id)) {
      errors.push('A matching stock movement already exists for this reference.')
    }
    if (['picking', 'dispatch'].includes(movement.type)) {
      const inventory = movement.inventoryId && state.inventory.find((item) => item.id === movement.inventoryId)
      if (!inventory) errors.push('Outbound stock movements must reference a specific inventory record.')
      else {
        const available = calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)
        const amount = movement.unit === 'carton' ? available.cartons : movement.unit === 'pallet' ? available.pallets : available.cbm
        if (movement.quantity > amount) errors.push(`Outbound movement exceeds available ${movement.unit} inventory.`)
      }
    }
  }
  if (collection === 'storageCharges') {
    const charge = record as RecordFor<'storageCharges'>
    if (!state.inventory.some((item) => item.id === charge.inventoryId && item.jobId === charge.jobId && item.customerId === charge.customerId)) errors.push('Storage charge inventory must belong to its customer and job.')
    if (!isValidDateOnly(charge.periodStart) || !isValidDateOnly(charge.periodEnd) || charge.periodEnd <= charge.periodStart || !Number.isFinite(charge.amount) || charge.amount < 0 || !Number.isFinite(charge.quantity) || charge.quantity <= 0) errors.push('Storage charge period, quantity and amount must be valid.')
    if (state.storageCharges.some((item) => item.inventoryId === charge.inventoryId && item.storageRuleId === charge.storageRuleId && item.periodStart === charge.periodStart && item.periodEnd === charge.periodEnd && item.id !== charge.id)) errors.push('Storage charge already exists for this inventory and period.')
  }
  if (collection === 'charges') {
    const charge = record as RecordFor<'charges'>
    const job = state.jobs.find((item) => item.id === charge.jobId)
    if (!job || job.customerId !== charge.customerId) errors.push('Charge customer must match its job.')
    if (!Number.isFinite(charge.quantity) || charge.quantity <= 0 || !Number.isFinite(charge.unitPrice) || charge.unitPrice < 0) errors.push('Charge quantity and unit price must be valid.')
    if (charge.sourceActivity && state.charges.some((item) => item.sourceActivity === charge.sourceActivity && item.id !== charge.id)) errors.push('A charge already exists for this operational activity.')
    if (!charge.sourceActivity && state.charges.some((item) => item.jobId === charge.jobId && item.description === charge.description && item.quantity === charge.quantity && item.unitPrice === charge.unitPrice && item.id !== charge.id)) errors.push('An equivalent charge already exists for this job.')
  }
  if (collection === 'supplierCosts') {
    const cost = record as RecordFor<'supplierCosts'>
    if (cost.amount < 0) errors.push('Supplier cost cannot be negative.')
    if (cost.tripId && !state.trips.some((trip) => trip.id === cost.tripId && trip.jobId === cost.jobId)) errors.push('Supplier cost trip must belong to its job.')
  }
  if (collection === 'reconciliationMatches') {
    const match = record as RecordFor<'reconciliationMatches'>
    if (!canMatchReconciliation(state, match.bankTransactionId, match.paymentTransactionId)) errors.push('Bank and payment transactions do not form an available exact match.')
  }
  if (collection === 'bankTransactions') {
    const transaction = record as RecordFor<'bankTransactions'>
    if (state.bankTransactions.some((item) => item.reference.toLowerCase() === transaction.reference.toLowerCase() && item.id !== transaction.id)) errors.push('Bank transaction reference must be unique.')
  }
  if (collection === 'paymentVouchers') {
    const voucher = record as RecordFor<'paymentVouchers'>
    if (voucher.supplierInvoiceId && state.paymentVouchers.some((item) => item.supplierInvoiceId === voucher.supplierInvoiceId && item.id !== voucher.id)) errors.push('Supplier invoice already has a voucher.')
  }

  return [...new Set(errors)]
}

export function createRecord<K extends RecordCollection>(
  state: AppState,
  collection: K,
  input: Omit<RecordFor<K>, 'id'> & { id?: string },
): MutationResult<RecordFor<K>> {
  const id = input.id?.trim() || generateRecordId(state, collection)
  const nestedIds = [
    ...state.quotations.flatMap((quotation) => quotation.lines.map((line) => line.id)),
    ...state.customerInvoices.flatMap((invoice) => invoice.lines.map((line) => line.id)),
  ]
  const existing = nestedIds.includes(id) || Object.values(state).some((value) => Array.isArray(value) && value.some((record: { id?: string }) => record.id === id))
  if (existing) return { state, errors: [`Record ID ${id} already exists.`] }

  const record = { ...input, id } as RecordFor<K>
  const errors = recordErrors(state, collection, record)
  if (errors.length) return { state, errors }

  const records = getRecords(state, collection)
  let nextState = { ...state, [collection]: [...records, record] } as AppState
  if (collection === 'customerInvoices') {
    const invoice = record as RecordFor<'customerInvoices'>
    const chargeIds = new Set(invoice.lines.map((line) => line.chargeId))
    nextState = {
      ...nextState,
      charges: nextState.charges.map((charge) => chargeIds.has(charge.id) ? { ...charge, invoiceId: invoice.id, status: 'invoiced' } : charge),
    }
  }
  if (collection === 'reconciliationMatches') {
    const match = record as RecordFor<'reconciliationMatches'>
    nextState = {
      ...nextState,
      bankTransactions: nextState.bankTransactions.map((transaction) => transaction.id === match.bankTransactionId ? { ...transaction, matched: true } : transaction),
    }
  }
  return { state: nextState, record, errors: [] }
}

export function updateRecord<K extends RecordCollection>(
  state: AppState,
  collection: K,
  record: RecordFor<K>,
): MutationResult<RecordFor<K>> {
  const records = getRecords(state, collection)
  if (!records.some((item) => item.id === record.id)) return { state, errors: [`Record ${record.id} was not found in ${String(collection)}.`] }
  const duplicateId = Object.values(state).some((value) => Array.isArray(value) && value.some((item: { id?: string }) => item.id === record.id && item !== records.find((current) => current.id === record.id)))
  if (duplicateId) return { state, errors: [`Record ID ${record.id} is already used by another collection.`] }

  const candidate = { ...state, [collection]: records.map((item) => item.id === record.id ? record : item) } as AppState
  const errors = recordErrors(candidate, collection, record)
  if (errors.length) return { state, errors }
  return { state: candidate, record, errors: [] }
}

export function createStorageCharge(
  state: AppState,
  input: { inventoryId: string; periodStart: string; periodEnd: string },
): StorageChargeCreation {
  const inventory = state.inventory.find((item) => item.id === input.inventoryId)
  if (!inventory) return { state, errors: ['Select an existing inventory record before calculating storage.'] }
  const job = state.jobs.find((item) => item.id === inventory.jobId)
  const customer = state.customers.find((item) => item.id === job?.customerId)
  const storageRule = customer?.storageRuleId
    ? state.storageRules.find((rule) => rule.id === customer.storageRuleId)
    : undefined
  if (!job || !customer || !storageRule) return { state, errors: ['Inventory must link to a job, customer and configured storage tariff.'] }
  if (!isValidDateOnly(input.periodStart) || !isValidDateOnly(input.periodEnd) || input.periodEnd <= input.periodStart) {
    return { state, errors: ['Storage start and end dates must be valid, and the end date must follow the start date.'] }
  }

  const available = calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)
  const quantity = storageRule.unit === 'cbm' ? available.cbm : storageRule.unit === 'pallet' ? available.pallets : available.cartons
  const preview = calculateStorageChargePreview(storageRule, quantity, input.periodStart, input.periodEnd)
  if (preview.amount <= 0) return { state, errors: ['The selected storage period does not produce a billable amount.'] }

  const sourceActivity = `storage:${inventory.id}:${storageRule.id}:${input.periodStart}:${input.periodEnd}`
  const storageResult = createRecord(state, 'storageCharges', {
    jobId: job.id,
    customerId: customer.id,
    inventoryId: inventory.id,
    storageRuleId: storageRule.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    quantity,
    amount: preview.amount,
  })
  if (!storageResult.record) return { state, errors: storageResult.errors }

  const chargeResult = createRecord(storageResult.state, 'charges', {
    jobId: job.id,
    customerId: customer.id,
    description: `Storage · ${inventory.sku} · ${input.periodStart} to ${input.periodEnd}`,
    serviceType: 'warehouse',
    category: 'storage',
    sourceActivity,
    quantity: 1,
    unit: 'period',
    unitPrice: preview.amount,
    taxRate: 0,
    approved: true,
    status: 'eligible',
    createdAt: state.demoDate,
  })
  if (!chargeResult.record) return { state, errors: chargeResult.errors }

  const storageCharge = { ...storageResult.record, chargeId: chargeResult.record.id }
  const committedState = {
    ...chargeResult.state,
    storageCharges: chargeResult.state.storageCharges.map((item) => item.id === storageCharge.id ? storageCharge : item),
  }
  return { state: committedState, storageCharge, charge: chargeResult.record, errors: [] }
}

export function searchRecords<T extends object>(records: readonly T[], query: string, fields?: readonly (keyof T)[]) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return [...records]
  return records.filter((record) => (fields ?? Object.keys(record) as Array<keyof T>)
    .some((field) => String((record as Record<keyof T, unknown>)[field] ?? '').toLocaleLowerCase().includes(normalized)))
}

export function searchRecordCollection<K extends RecordCollection>(state: AppState, collection: K, query: string) {
  return searchRecords(getRecords(state, collection), query)
}
