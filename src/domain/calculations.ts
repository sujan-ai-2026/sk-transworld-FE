import type { Alert, AppState, Charge, CustomerInvoice, InventoryRecord, QuotationLine, StorageRule, SupplierCost, Trip, TripExpense, WarehouseTransaction } from './types.ts'

export interface MoneyBreakdown { subtotal: number; tax: number; total: number }

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const operationalDemoRates = { customsClearance: 450, forwarding: 450, outboundHandlingPerUnit: 2, outboundDeliveryFallback: 100 }
export function calculateQuotationTotals(lines: QuotationLine[]): MoneyBreakdown {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - (line.discount ?? 0), 0)
  const tax = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice - (line.discount ?? 0)) * line.taxRate, 0)
  return { subtotal: money(subtotal), tax: money(tax), total: money(subtotal + tax) }
}
export function calculateInvoiceTotals(invoice: Pick<CustomerInvoice, 'lines'>): MoneyBreakdown {
  return calculateQuotationTotals(invoice.lines.map((line) => ({ ...line, serviceType: 'other' as const, unit: 'unit', discount: 0 })))
}
export function calculateTripExpenseTotals(expenses: TripExpense[], tripId?: string) {
  const relevant = tripId ? expenses.filter((expense) => expense.tripId === tripId) : expenses
  const totals = relevant.reduce((result, expense) => {
    result.total += expense.amount
    result[expense.status] += expense.amount
    return result
  }, { submitted: 0, approved: 0, paid: 0, total: 0 })
  return {
    submitted: money(totals.submitted),
    approved: money(totals.approved),
    paid: money(totals.paid),
    total: money(totals.total),
  }
}
export function calculateHaulageProfitLoss(trip: Trip, expenses: TripExpense[] = [], supplierCosts: SupplierCost[] = [], reimbursements: AppState['reimbursements'] = []) {
  const tripExpenses = calculateTripExpenseTotals(expenses, trip.id)
  const reimbursedExpenseIds = new Set(reimbursements
    .filter((request) => request.jobId === trip.jobId && ['approved', 'paid'].includes(request.status))
    .map((request) => request.tripExpenseId)
    .filter((id): id is string => Boolean(id)))
  const actualTripExpenses = money(expenses
    .filter((expense) => expense.tripId === trip.id && ['approved', 'paid'].includes(expense.status) && !expense.supplierCostId && !reimbursedExpenseIds.has(expense.id))
    .reduce((sum, expense) => sum + expense.amount, 0))
  const includedCosts = supplierCosts.filter((cost) => cost.tripId === trip.id && isCostIncludedInJobCosting(cost))
  const categoryCost = (category: SupplierCost['category'], fallback: number) => {
    const linkedCosts = includedCosts.filter((cost) => cost.category === category)
    return linkedCosts.length ? linkedCosts.reduce((sum, cost) => sum + cost.amount, 0) : fallback
  }
  const linkedTruckingCosts = includedCosts.filter((cost) => cost.category === 'trucking' || (trip.subcontractor && cost.category === 'freight'))
  const truckingCost = money(linkedTruckingCosts.length
    ? linkedTruckingCosts.reduce((sum, cost) => sum + cost.amount, 0)
    : trip.truckingCost)
  const tollCost = money(categoryCost('toll', trip.tollCost))
  const otherCost = money(categoryCost('other', trip.otherCost) + (trip.subcontractor ? 0 : includedCosts.filter((cost) => cost.category === 'freight').reduce((sum, cost) => sum + cost.amount, 0)))
  const operatingCosts = money(truckingCost + tollCost + otherCost)
  const totalCosts = money(operatingCosts + actualTripExpenses)
  const profitLoss = money(trip.billingAmount - totalCosts)
  return {
    revenue: money(trip.billingAmount),
    truckingCost,
    tollCost,
    otherCost,
    operatingCosts,
    tripExpenses: actualTripExpenses,
    totalCosts,
    profitLoss,
    margin: trip.billingAmount ? money(profitLoss / trip.billingAmount) : 0,
    expensesByStatus: tripExpenses,
  }
}
export function calculateStorageCharge(rule: StorageRule, quantity: number, daysStored: number): number {
  const billableUnits = rule.period === 'day' ? Math.max(0, daysStored - rule.freeDays) : Math.max(0, Math.ceil(daysStored / 30))
  return money(quantity * rule.rate * billableUnits)
}
export function calculateStorageChargePreview(rule: StorageRule, quantity: number, startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  const calendarDays = Math.max(0, Math.ceil((end - start) / 86400000))
  const chargeableDuration = rule.period === 'day' ? Math.max(0, calendarDays - rule.freeDays) : Math.max(0, Math.ceil(calendarDays / 30))
  const amount = money(quantity * rule.rate * chargeableDuration)
  return { calendarDays, freeDays: rule.period === 'day' ? Math.min(calendarDays, rule.freeDays) : 0, chargeableDuration, quantity, rate: rule.rate, unit: rule.unit, period: rule.period, amount }
}
export function calculateAvailableInventory(
  inventory: InventoryRecord,
  transactions: WarehouseTransaction[],
  allInventory: InventoryRecord[] = [inventory],
) {
  const movements = transactions.filter((transaction) => {
    if (transaction.inventoryId) return transaction.inventoryId === inventory.id
    const jobInventory = allInventory.filter((item) => item.jobId === transaction.jobId)
    return transaction.jobId === inventory.jobId && jobInventory.length === 1
  })
  const outbound = (unit: WarehouseTransaction['unit']) => movements
    .filter((movement) => movement.unit === unit && (
      movement.type === 'dispatch' ||
      (movement.type === 'adjustment' && (movement.direction ?? 'out') === 'out')
    ))
    .reduce((sum, movement) => sum + movement.quantity, 0)
  const inboundAdjustment = (unit: WarehouseTransaction['unit']) => movements
    .filter((movement) => movement.unit === unit && movement.type === 'adjustment' && movement.direction === 'in')
    .reduce((sum, movement) => sum + movement.quantity, 0)
  return {
    cartons: Math.max(0, inventory.cartons - outbound('carton') + inboundAdjustment('carton')),
    pallets: Math.max(0, inventory.pallets - outbound('pallet') + inboundAdjustment('pallet')),
    cbm: money(Math.max(0, inventory.cbm - outbound('CBM') + inboundAdjustment('CBM'))),
  }
}
export function getAvailableInventory(state: AppState, inventoryId: string) {
  const inventory = state.inventory.find((item) => item.id === inventoryId)
  return inventory ? calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory) : undefined
}
export function calculateReservedInventory(inventoryId: string, orders: AppState['outboundOrders'], excludingOrderId?: string, unit?: AppState['outboundOrders'][number]['unit']) {
  return orders.reduce((reserved, order) => {
    if (order.inventoryId !== inventoryId || order.id === excludingOrderId || order.status === 'cancelled' || (unit && order.unit !== unit)) return reserved
    const dispatched = order.dispatchedQuantity ?? (order.status === 'dispatched' || order.status === 'verified' ? order.quantity : 0)
    return reserved + Math.max(0, order.quantity - dispatched)
  }, 0)
}
export function isCostIncludedInJobCosting(cost: SupplierCost) {
  return cost.classification !== 'estimated' && cost.approvalStatus !== 'rejected' && (cost.posted || cost.approvalStatus === 'approved')
}
export function deriveOperationalCharges(state: AppState): Charge[] {
  const generated: Charge[] = []
  state.customsRecords.filter((record) => record.status === 'released' || record.edoStatus === 'released').forEach((record) => {
    const job = state.jobs.find((item) => item.id === record.jobId)
    if (job) generated.push({ id: `generated-customs-${record.id}`, reference: `CHG-CUS-${record.id}`, jobId: job.id, customerId: job.customerId, description: `Customs clearance · ${record.declarationType}`, serviceType: 'customs', category: 'customs clearance', sourceActivity: `Customs release · ${record.id}`, quantity: 1, unit: 'declaration', unitPrice: operationalDemoRates.customsClearance, taxRate: 0, approved: true, status: 'eligible', createdAt: state.demoDate })
  })
  state.forwardingRecords.filter((record) => record.milestones.length > 1).forEach((record) => {
    const job = state.jobs.find((item) => item.id === record.jobId)
    if (job) generated.push({ id: `generated-forwarding-${record.id}`, reference: `CHG-${record.bookingReference}`, jobId: job.id, customerId: job.customerId, description: `Forwarding fee · ${record.bookingReference}`, serviceType: 'freight', category: 'forwarding fee', sourceActivity: `Booking ${record.bookingReference}`, quantity: 1, unit: 'booking', unitPrice: operationalDemoRates.forwarding, taxRate: 0, approved: true, status: 'eligible', createdAt: state.demoDate })
  })
  state.trips.filter((trip) => trip.status === 'completed' && trip.billingAmount > 0 && !trip.outboundOrderId).forEach((trip) => {
    const job = state.jobs.find((item) => item.id === trip.jobId)
    if (job) generated.push({ id: `generated-trip-${trip.id}`, reference: `CHG-${trip.tripNumber}`, jobId: job.id, customerId: job.customerId, description: `Trucking · ${trip.tripNumber}`, serviceType: 'haulage', category: 'trucking', sourceActivity: `Completed trip ${trip.tripNumber}`, quantity: 1, unit: 'trip', unitPrice: trip.billingAmount, taxRate: 0, approved: true, status: 'eligible', createdAt: state.demoDate })
  })
  state.trips.filter((trip) => trip.outboundOrderId && trip.podStatus === 'approved').forEach((trip) => {
    const order = state.outboundOrders.find((item) => item.id === trip.outboundOrderId && item.jobId === trip.jobId)
    const inventory = order && state.inventory.find((item) => item.id === order.inventoryId && item.jobId === order.jobId)
    const job = state.jobs.find((item) => item.id === trip.jobId)
    if (!order || !inventory || !job) return
    const deliveredQuantity = trip.outboundQuantity ?? 0
    if (deliveredQuantity <= 0) return
    const charge = (
      suffix: string,
      description: string,
      category: Charge['category'],
      quantity: number,
      unit: string,
      unitPrice: number,
    ): Charge => ({
      id: `generated-outbound-${trip.id}-${suffix}`,
      reference: `CHG-${trip.tripNumber}-${suffix.toUpperCase()}`,
      jobId: job.id,
      customerId: job.customerId,
      description,
      serviceType: 'warehouse',
      category,
      sourceActivity: `Outbound ${suffix} · ${trip.id}`,
      quantity,
      unit,
      unitPrice,
      taxRate: 0,
      approved: true,
      status: 'eligible',
      createdAt: trip.podReceivedAt?.slice(0, 10) ?? state.demoDate,
    })
    generated.push(charge('handling', `Outbound handling · ${order.deliveryOrderNumber}`, 'handling', deliveredQuantity, order.unit, operationalDemoRates.outboundHandlingPerUnit))
    generated.push(charge('delivery', `Delivery · ${order.deliveryOrderNumber} · ${trip.tripNumber}`, 'trucking', 1, 'trip', trip.billingAmount > 0 ? trip.billingAmount : operationalDemoRates.outboundDeliveryFallback))

    const customer = state.customers.find((item) => item.id === job.customerId)
    const rule = state.storageRules.find((item) => item.id === customer?.storageRuleId)
    if (!rule) return
    const ruleStockQuantity = rule.unit === 'cbm' ? inventory.cbm : rule.unit === 'pallet' ? inventory.pallets : inventory.cartons
    const orderStockQuantity = order.unit === 'CBM' ? inventory.cbm : order.unit === 'pallet' ? inventory.pallets : inventory.cartons
    const storageQuantity = rule.unit === (order.unit === 'CBM' ? 'cbm' : order.unit)
      ? deliveredQuantity
      : orderStockQuantity > 0 ? ruleStockQuantity * Math.min(1, deliveredQuantity / orderStockQuantity) : 0
    const receivedAt = state.warehouseInbounds
      .filter((inbound) => inbound.inventoryId === inventory.id)
      .map((inbound) => inbound.receivedAt.slice(0, 10))
      .sort()[0] ?? state.warehouseTransactions
      .filter((transaction) => transaction.inventoryId === inventory.id && transaction.type === 'receiving')
      .map((transaction) => transaction.occurredAt.slice(0, 10))
      .sort()[0] ?? order.createdAt.slice(0, 10)
    const storedUntil = trip.podReceivedAt?.slice(0, 10) ?? state.demoDate
    if (storageQuantity > 0 && storedUntil > receivedAt) {
      const storageAmount = calculateStorageChargePreview(rule, storageQuantity, receivedAt, storedUntil).amount
      if (storageAmount > 0) generated.push(charge('storage', `Storage · ${order.deliveryOrderNumber} · ${inventory.sku}`, 'storage', 1, 'period', storageAmount))
    }
  })
  return generated
}
export function getAllBillableCharges(state: AppState): Charge[] {
  const generated = deriveOperationalCharges(state).filter((candidate) => !state.charges.some((charge) => charge.id === candidate.id || (candidate.sourceActivity && charge.sourceActivity === candidate.sourceActivity)))
  return [...state.charges, ...generated]
}
export function getEligibleBillableCharges(state: AppState): Charge[] {
  const invoicedIds = new Set(state.customerInvoices.flatMap((invoice) => invoice.lines.map((line) => line.chargeId)))
  return getAllBillableCharges(state).filter((charge) => charge.approved && charge.status !== 'cancelled' && !charge.invoiceId && !invoicedIds.has(charge.id))
}
export function calculateJobFinancials(state: AppState, jobId: string) {
  const revenue = state.customerInvoices
    .filter((invoice) => invoice.jobId === jobId && ['approved', 'finalised', 'paid'].includes(invoice.status))
    .reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
  const unbilledCharges = getEligibleBillableCharges(state)
    .filter((charge) => charge.jobId === jobId)
    .reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0)
  const includedSupplierCosts = state.supplierCosts.filter((cost) => cost.jobId === jobId && isCostIncludedInJobCosting(cost))
  const supplierCosts = includedSupplierCosts.reduce((sum, cost) => sum + cost.amount, 0)
  const tripCosts = state.trips.filter((trip) => trip.jobId === jobId).reduce((sum, trip) => {
    const categoryCosts = includedSupplierCosts.filter((cost) => cost.tripId === trip.id)
    const hasCategory = (category: SupplierCost['category']) => categoryCosts.some((cost) => cost.category === category)
    const hasTruckingCost = hasCategory('trucking') || (trip.subcontractor && hasCategory('freight'))
    return sum +
      (hasTruckingCost ? 0 : trip.truckingCost) +
      (hasCategory('toll') ? 0 : trip.tollCost) +
      (hasCategory('other') ? 0 : trip.otherCost)
  }, 0)
  const reimbursements = state.reimbursements.filter((request) => request.jobId === jobId && ['approved', 'paid'].includes(request.status)).reduce((sum, request) => sum + request.amount, 0)
  const reimbursedTripExpenseIds = new Set(state.reimbursements
    .filter((request) => request.jobId === jobId && ['approved', 'paid'].includes(request.status))
    .map((request) => request.tripExpenseId)
    .filter((id): id is string => Boolean(id)))
  const tripExpenses = state.tripExpenses
    .filter((expense) => expense.jobId === jobId && ['approved', 'paid'].includes(expense.status) && !expense.supplierCostId && !reimbursedTripExpenseIds.has(expense.id))
    .reduce((sum, expense) => sum + expense.amount, 0)
  const cost = supplierCosts + tripCosts + reimbursements + tripExpenses
  return {
    revenue: money(revenue),
    cost: money(cost),
    grossProfit: money(revenue - cost),
    margin: revenue ? money((revenue - cost) / revenue) : 0,
    unbilledCharges: money(unbilledCharges),
    supplierCosts: money(supplierCosts),
    fallbackTripCosts: money(tripCosts),
    reimbursements: money(reimbursements),
    tripExpenses: money(tripExpenses),
  }
}
export function calculateOutstandingBalance(state: AppState, customerId?: string) {
  return money(state.customerInvoices.filter((invoice) => (!customerId || invoice.customerId === customerId) && ['approved', 'finalised', 'paid'].includes(invoice.status)).reduce((sum, invoice) => {
    const paid = state.paymentTransactions.filter((payment) => payment.invoiceId === invoice.id && payment.status === 'posted').reduce((total, payment) => total + payment.amount, 0)
    return sum + Math.max(0, calculateInvoiceTotals(invoice).total - paid)
  }, 0))
}
export function getUninvoicedCharges(state: AppState): Charge[] {
  return getEligibleBillableCharges(state)
}
export function calculateReconciliationSummary(state: AppState) {
  const matchedIds = new Set(state.reconciliationMatches.map((match) => match.bankTransactionId))
  const matched = state.bankTransactions.filter((transaction) => matchedIds.has(transaction.id)).reduce((sum, transaction) => sum + transaction.amount, 0)
  return { total: state.bankTransactions.length, matched: matchedIds.size, unmatched: state.bankTransactions.length - matchedIds.size, matchedAmount: money(matched) }
}
export function canMatchReconciliation(state: AppState, bankTransactionId: string, paymentTransactionId: string) {
  const bank = state.bankTransactions.find((item) => item.id === bankTransactionId)
  const payment = state.paymentTransactions.find((item) => item.id === paymentTransactionId)
  const expectedDirection = payment?.invoiceId ? 'credit' : 'debit'
  return Boolean(bank && payment && payment.status === 'posted' && bank.direction === expectedDirection && !bank.matched && !state.reconciliationMatches.some((match) => match.bankTransactionId === bankTransactionId || match.paymentTransactionId === paymentTransactionId) && Math.abs(bank.amount - payment.amount) < 0.01)
}
export function calculateDashboardKpis(state: AppState) {
  const activeTrips = state.trips.filter((trip) => ['planned', 'assigned', 'in-progress'].includes(trip.status)).length
  const customsPending = state.customsRecords.filter((record) => !['approved', 'released'].includes(record.status)).length
  return { deliveriesToday: state.trips.filter((trip) => trip.status === 'completed').length, containersArriving: state.containers.filter((container) => container.movementStatus === 'at-port').length, customsPending, trucksRequired: activeTrips, uninvoicedCharges: getEligibleBillableCharges(state).length, outstandingBalance: calculateOutstandingBalance(state) }
}
const dateDifference = (later: string, earlier: string) => Math.round((Date.parse(`${later.slice(0, 10)}T00:00:00Z`) - Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`)) / 86400000)
export function deriveAlerts(state: AppState): Alert[] {
  const alerts: Alert[] = []
  const add = (alert: Omit<Alert, 'resolved'>) => alerts.push({ ...alert, resolved: state.alerts.find((existing) => existing.id === alert.id)?.resolved ?? false })
  state.containers.forEach((container) => {
    if (container.movementStatus !== 'delivered' && container.movementStatus !== 'empty-returned') {
      const expiry = container.freeTimeExpiryDate ?? state.containerEvents.find((event) => event.containerId === container.id && event.status === 'at-port')?.occurredAt.slice(0, 10)
      const days = expiry ? dateDifference(expiry, state.demoDate) : undefined
      if (expiry && days !== undefined && days <= 1) add({ id: `alert-free-${container.id}`, type: 'free-days', title: days < 0 ? 'Container free time expired' : days === 0 ? 'Container free time expires today' : 'Container free time expires tomorrow', description: `${container.containerNumber} · Job ${state.jobs.find((job) => job.id === container.jobId)?.jobNumber}`, severity: days === 0 ? 'High' : 'Medium', jobId: container.jobId, sourceRecordId: container.id, sourceRecordType: 'container', dueDate: expiry, recipientRole: 'operations', actionPath: '/app/containers' })
    }
  })
  state.customsRecords.forEach((record) => {
    if (record.edoStatus === 'pending') add({ id: `alert-edo-${record.id}`, type: 'customs', title: 'EDO not released', description: `${record.declarationType} · Job ${state.jobs.find((job) => job.id === record.jobId)?.jobNumber}`, severity: 'High', jobId: record.jobId, sourceRecordId: record.id, sourceRecordType: 'customs', recipientRole: 'operations', actionPath: '/app/customs' })
    if (record.missingDocuments?.length) add({ id: `alert-doc-${record.id}`, type: 'missing-document', title: 'Required documents missing', description: record.missingDocuments.join(', '), severity: 'High', jobId: record.jobId, sourceRecordId: record.id, sourceRecordType: 'customs', recipientRole: 'operations', actionPath: '/app/documents' })
  })
  state.customerInvoices.forEach((invoice) => {
    if (invoice.status === 'pending-approval') add({ id: `alert-approval-${invoice.id}`, type: 'invoice-approval', title: 'Invoice awaiting finance approval', description: invoice.invoiceNumber, severity: 'Medium', jobId: invoice.jobId, sourceRecordId: invoice.id, sourceRecordType: 'customer-invoice', recipientRole: 'finance', actionPath: '/app/billing' })
    if (invoice.eInvoiceStatus === 'rejected') add({ id: `alert-einvoice-${invoice.id}`, type: 'einvoice', title: 'E-invoice submission failure', description: `${invoice.invoiceNumber} · correction required`, severity: 'High', jobId: invoice.jobId, sourceRecordId: invoice.id, sourceRecordType: 'customer-invoice', recipientRole: 'finance', actionPath: '/app/billing' })
    if (dateDifference(state.demoDate, invoice.dueDate) >= 14 && ['approved', 'finalised', 'paid'].includes(invoice.status)) {
      const paid = state.paymentTransactions.filter((payment) => payment.invoiceId === invoice.id && payment.status === 'posted').reduce((sum, payment) => sum + payment.amount, 0)
      if (paid < calculateInvoiceTotals(invoice).total) add({ id: `alert-payment-${invoice.id}`, type: 'payment', title: `Customer payment overdue by ${dateDifference(state.demoDate, invoice.dueDate)} days`, description: invoice.invoiceNumber, severity: 'High', jobId: invoice.jobId, sourceRecordId: invoice.id, sourceRecordType: 'customer-invoice', dueDate: invoice.dueDate, recipientRole: 'finance', actionPath: '/app/billing' })
    }
  })
  state.supplierInvoices.filter((invoice) => ['captured', 'validated', 'pending-approval'].includes(invoice.status)).forEach((invoice) => add({ id: `alert-supplier-${invoice.id}`, type: 'supplier-invoice', title: 'Supplier invoice awaiting processing', description: invoice.reference, severity: 'Medium', jobId: invoice.jobId, sourceRecordId: invoice.id, sourceRecordType: 'supplier-invoice', dueDate: invoice.dueDate, recipientRole: 'finance', actionPath: '/app/expenses' }))
  state.bankTransactions.filter((bank) => !bank.matched).forEach((bank) => add({ id: `alert-reconciliation-${bank.id}`, type: 'reconciliation', title: 'Reconciliation exception', description: `${bank.reference} · RM ${bank.amount.toLocaleString('en-MY')}`, severity: 'Medium', sourceRecordId: bank.id, sourceRecordType: 'bank-transaction', recipientRole: 'finance', actionPath: '/app/reconciliation' }))
  state.shipments.filter((shipment) => ['Booked', 'delayed'].includes(shipment.status)).forEach((shipment) => add({ id: `alert-shipment-${shipment.id}`, type: 'shipment', title: shipment.status === 'delayed' ? 'Delayed shipment follow-up' : 'Shipment follow-up', description: `${shipment.reference} · ETA ${shipment.eta}`, severity: shipment.status === 'delayed' ? 'High' : 'Low', jobId: shipment.jobId, sourceRecordId: shipment.id, sourceRecordType: 'shipment', dueDate: shipment.eta, recipientRole: 'operations', actionPath: '/app/forwarding' }))
  state.warehouseTransactions.filter((transaction) => transaction.type === 'receiving' && dateDifference(state.demoDate, transaction.occurredAt) > 30 && state.inventory.some((item) => item.jobId === transaction.jobId && item.status !== 'dispatched')).forEach((transaction) => add({ id: `alert-warehouse-${transaction.id}`, type: 'warehouse', title: 'Warehouse cargo exceeds 30 days', description: `Job ${state.jobs.find((job) => job.id === transaction.jobId)?.jobNumber}`, severity: 'Medium', jobId: transaction.jobId, sourceRecordId: transaction.id, sourceRecordType: 'warehouse-transaction', dueDate: transaction.occurredAt, recipientRole: 'operations', actionPath: '/app/warehouse' }))
  state.trucks.forEach((truck) => {
    for (const [label, dueDate] of [['road tax', truck.roadTaxExpiry], ['insurance', truck.insuranceExpiry]] as const) {
      if (dueDate) { const days = dateDifference(dueDate, state.demoDate); if (days >= 0 && days <= 30) add({ id: `alert-vehicle-${truck.id}-${label.replace(' ', '-')}`, type: 'vehicle', title: `Truck ${label} due`, description: truck.registrationNumber, severity: days <= 7 ? 'High' : 'Medium', sourceRecordId: truck.id, sourceRecordType: 'truck', dueDate, recipientRole: 'operations', actionPath: '/app/haulage' }) }
    }
  })
  getEligibleBillableCharges(state).forEach((charge) => add({ id: `alert-billing-${charge.id}`, type: 'missing-billing', title: 'Billable charge not invoiced', description: charge.description, severity: 'Medium', jobId: charge.jobId, sourceRecordId: charge.id, sourceRecordType: 'charge', dueDate: charge.createdAt, recipientRole: 'finance', actionPath: '/app/billing' }))
  return alerts
}
export function calculateFinancialStatements(state: AppState, period?: string) {
  const invoices = state.customerInvoices.filter((invoice) => ['approved', 'finalised', 'paid'].includes(invoice.status) && (!period || invoice.issueDate.startsWith(period)))
  const revenue = invoices.reduce((sum, invoice) => sum + calculateInvoiceTotals(invoice).subtotal, 0)
  const supplierCosts = state.supplierCosts
    .filter((cost) => isCostIncludedInJobCosting(cost) && (!period || (cost.incurredDate ?? state.supplierInvoices.find((invoice) => invoice.id === cost.supplierInvoiceId)?.invoiceDate ?? state.demoDate).startsWith(period)))
    .reduce((sum, cost) => sum + cost.amount, 0)
  const includedCosts = state.supplierCosts.filter((cost) => isCostIncludedInJobCosting(cost))
  const fallbackTripCosts = state.trips.reduce((total, trip) => {
    const tripDate = (trip.driverMilestones?.at(-1)?.occurredAt ?? trip.actualPickup ?? trip.plannedPickup ?? state.demoDate).slice(0, 7)
    if (period && tripDate !== period) return total
    const linkedCosts = includedCosts.filter((cost) => cost.tripId === trip.id)
    const hasCategory = (category: SupplierCost['category']) => linkedCosts.some((cost) => cost.category === category)
    const hasTruckingCost = hasCategory('trucking') || (trip.subcontractor && hasCategory('freight'))
    return total +
      (hasTruckingCost ? 0 : trip.truckingCost) +
      (hasCategory('toll') ? 0 : trip.tollCost) +
      (hasCategory('other') ? 0 : trip.otherCost)
  }, 0)
  const reimbursedTripExpenseIds = new Set(state.reimbursements
    .filter((request) => ['approved', 'paid'].includes(request.status))
    .map((request) => request.tripExpenseId)
    .filter((id): id is string => Boolean(id)))
  const reimbursements = state.reimbursements
    .filter((request) => ['approved', 'paid'].includes(request.status) && (!period || (request.requestedDate ?? state.demoDate).startsWith(period)))
    .reduce((sum, request) => sum + request.amount, 0)
  const tripExpenses = state.tripExpenses
    .filter((expense) => ['approved', 'paid'].includes(expense.status) && !expense.supplierCostId && !reimbursedTripExpenseIds.has(expense.id) && (!period || (expense.submittedAt ?? state.demoDate).startsWith(period)))
    .reduce((sum, expense) => sum + expense.amount, 0)
  const costs = supplierCosts + fallbackTripCosts + reimbursements + tripExpenses
  const unbilledCharges = getEligibleBillableCharges(state)
    .filter((charge) => !period || !charge.createdAt || charge.createdAt.startsWith(period))
    .reduce((sum, charge) => sum + charge.quantity * charge.unitPrice, 0)
  const receivables = calculateOutstandingBalance(state)
  return { revenue: money(revenue), costs: money(costs), grossProfit: money(revenue - costs), unbilledCharges: money(unbilledCharges), receivables, payables: money(state.supplierInvoices.filter((invoice) => invoice.paymentStatus !== 'paid').reduce((sum, invoice) => sum + invoice.amount, 0)) }
}
