import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { seedState } from '../data/seed.ts'
import { calculateAvailableInventory, calculateDashboardKpis, calculateFinancialStatements, calculateHaulageProfitLoss, calculateInvoiceTotals, calculateJobFinancials, calculateOutstandingBalance, calculateStorageCharge, calculateStorageChargePreview, canMatchReconciliation, deriveAlerts, deriveOperationalCharges, getEligibleBillableCharges, getUninvoicedCharges } from './calculations.ts'
import { validateInvoice, validateJob, validateSupplierInvoice } from './validators.ts'
import { createJobRecord, createRecord, createStorageCharge, generateJobNumber, generateRecordId, getRecord, searchRecords, updateRecord } from '../services/mockDataService.ts'
import { migrateStoredState } from '../services/mockStore.ts'
import { applyQuotationWorkflowAction } from '../state/quotationWorkflow.ts'
import { buildJobMilestones } from './jobMilestones.ts'
import { shipmentExtractionSamples } from './shipmentExtraction.ts'
import { canTransitionTrip, createTripPlan, validateTripPlan } from './tripPlanning.ts'
import type { ActivityEvent, Trip } from './types.ts'

describe('CLMS calculations', () => {
  it('calculates the example haulage profit from shared records', () => {
    const result = calculateJobFinancials(seedState, 'job-1001')
    assert.equal(result.revenue, 1200)
    assert.equal(result.cost, 830)
    assert.equal(result.grossProfit, 370)
    assert.equal(result.unbilledCharges, 450)
    assert.equal(calculateHaulageProfitLoss(seedState.trips[0], seedState.tripExpenses).profitLoss, 370)
  })
  it('excludes submitted trip expenses from actual haulage and job costs', () => {
    const expenses = [...seedState.tripExpenses, { id: 'texp-approved', tripId: 'trip-1001', jobId: 'job-1001', description: 'Approved fuel', amount: 25, status: 'approved' as const }]
    assert.equal(calculateHaulageProfitLoss(seedState.trips[0], expenses).profitLoss, 345)
    assert.equal(calculateJobFinancials({ ...seedState, tripExpenses: expenses }, 'job-1001').grossProfit, 345)
  })
  it('excludes pending and estimated supplier costs from actual job costing', () => {
    const state = { ...seedState, supplierCosts: [...seedState.supplierCosts, { id: 'cost-estimate', jobId: 'job-1001', supplierId: 'sup-transhaul', description: 'Budget only', category: 'other' as const, amount: 900, classification: 'estimated' as const, posted: true }, { id: 'cost-pending', jobId: 'job-1001', supplierId: 'sup-transhaul', description: 'Pending actual', category: 'other' as const, amount: 500, classification: 'actual' as const, posted: false, approvalStatus: 'pending' as const }] }
    assert.equal(calculateJobFinancials(state, 'job-1001').grossProfit, 370)
  })
  it('calculates storage after free days', () => {
    assert.equal(calculateStorageCharge({ id: 'storage-cbm', unit: 'cbm', rate: 3, freeDays: 3, period: 'day' }, 10, 5), 60)
    assert.equal(calculateStorageCharge({ id: 'storage-pallet', unit: 'pallet', rate: 8, freeDays: 0, period: 'day' }, 4, 2), 64)
  })
  it('handles storage preview boundaries and monthly rules', () => {
    const daily = calculateStorageChargePreview({ id: 'storage-cbm', unit: 'cbm', rate: 3, freeDays: 3, period: 'day' }, 10, '2026-10-29', '2026-11-01')
    assert.equal(daily.calendarDays, 3)
    assert.equal(daily.chargeableDuration, 0)
    const monthly = calculateStorageChargePreview({ id: 'storage-carton', unit: 'carton', rate: 5, freeDays: 0, period: 'month' }, 20, '2026-10-29', '2026-12-01')
    assert.equal(monthly.chargeableDuration, 2)
    assert.equal(monthly.amount, 200)
  })
  it('finds only approved charges that are not invoiced', () => {
    assert.deepEqual(getUninvoicedCharges(seedState).map((charge) => charge.id), ['chg-1002', 'chg-1003', 'generated-forwarding-fwd-1001', 'generated-forwarding-fwd-1002'])
  })
  it('includes eligible operational activities in billing without duplicating generated charges', () => {
    const eligible = getEligibleBillableCharges(seedState)
    assert.equal(eligible.length, 4)
    assert.ok(eligible.some((charge) => charge.id === 'generated-forwarding-fwd-1001'))
    const stored = { ...seedState, charges: [...seedState.charges, ...deriveOperationalCharges(seedState)] }
    assert.equal(getEligibleBillableCharges(stored).length, 4)
    const generatedCharge = deriveOperationalCharges(seedState)[0]
    const invoice = { ...seedState.customerInvoices[0], id: 'inv-test', lines: [{ ...seedState.customerInvoices[0].lines[0], chargeId: generatedCharge.id }] }
    const invoiced = { ...stored, customerInvoices: [...stored.customerInvoices, invoice] }
    assert.ok(!getEligibleBillableCharges(invoiced).some((charge) => charge.id === generatedCharge.id))
    assert.equal(deriveOperationalCharges({ ...seedState, trips: seedState.trips.map((trip) => ({ ...trip, status: 'completed' as const })) }).length, 3)
  })
  it('creates customs and outbound charges once, without double billing outbound haulage', () => {
    const releasedCustoms = {
      ...seedState,
      customsRecords: seedState.customsRecords.map((record) => record.id === 'cusrec-1001'
        ? { ...record, status: 'released' as const, edoStatus: 'released' as const }
        : record),
    }
    assert.ok(deriveOperationalCharges(releasedCustoms).some((charge) => charge.id === 'generated-customs-cusrec-1001' && charge.unitPrice === 450))

    const order = { id: 'out-charge-1', jobId: 'job-1002', inventoryId: 'inventory-1001', deliveryOrderNumber: 'DO-CHARGE-1', quantity: 12, unit: 'pallet' as const, status: 'verified' as const, createdAt: seedState.demoDate }
    const trip = { ...seedState.trips[0], id: 'trip-out-charge-1', jobId: order.jobId, shipmentId: undefined, containerId: undefined, outboundOrderId: order.id, outboundQuantity: 5, status: 'completed' as const, podStatus: 'approved' as const, billingAmount: 900 }
    const charges = deriveOperationalCharges({ ...seedState, outboundOrders: [order], trips: [trip] })
    assert.equal(charges.some((charge) => charge.id === `generated-trip-${trip.id}`), false)
    assert.equal(charges.find((charge) => charge.id === `generated-outbound-${trip.id}-delivery`)?.unitPrice, 900)
  })
  it('keeps subcontractor estimates separate until an actual cost is approved', () => {
    const subcontractedTrip = { ...seedState.trips[0], subcontractor: true, subcontractorHaulageCost: 700, truckingCost: 0 }
    const state = { ...seedState, trips: [subcontractedTrip], supplierCosts: [] }
    const costing = calculateJobFinancials(state, 'job-1001')
    assert.equal(costing.cost, 130)
    assert.equal(costing.grossProfit, 1070)
    assert.equal(calculateHaulageProfitLoss(subcontractedTrip, [], [], []).profitLoss, 1070)
    assert.equal(calculateFinancialStatements(state, '2026-10').costs, 130)

    const approvedCost = { id: 'cost-subcontractor-actual', jobId: 'job-1001', tripId: subcontractedTrip.id, supplierId: 'sup-transhaul', description: 'Approved subcontractor haulage', category: 'trucking' as const, amount: 700, posted: true, approvalStatus: 'approved' as const }
    const actualState = { ...state, supplierCosts: [approvedCost] }
    assert.equal(calculateJobFinancials(actualState, 'job-1001').cost, 830)
    assert.equal(calculateFinancialStatements(actualState, '2026-10').costs, 830)
  })

  describe('trip planning', () => {
    const plannedTrip = (overrides: Partial<Trip> = {}): Trip => ({
      id: 'trip-1002', tripNumber: 'TR-1002', jobId: 'job-1001', shipmentId: 'shp-1001', containerId: 'con-1001',
      tripType: 'container-pickup', driverId: 'drv-nadia', truckId: 'trk-102', trailerId: 'trl-101',
      pickup: 'Westport Gate 3', delivery: 'Meridian Foods DC',
      plannedPickup: '2026-11-03T09:00:00.000Z', plannedDelivery: '2026-11-03T15:00:00.000Z',
      status: 'assigned', billingAmount: 1200, truckingCost: 0, tollCost: 0, otherCost: 0,
      estimatedTruckingCost: 700, estimatedTollCost: 80, estimatedOtherCost: 50, milestones: ['Trip planned'],
      subcontractor: false, podStatus: 'pending', assignmentKey: 'plan:trip-1002', ...overrides,
    })

    it('validates linked resource assignments and allows multiple trips for one job', () => {
      const trip = plannedTrip()
      assert.deepEqual(validateTripPlan(seedState, trip), [])
      const activity: ActivityEvent = { id: 'act-trip-1002', entityType: 'trip', entityId: trip.id, action: 'Trip planned', actor: 'Operations', occurredAt: seedState.demoDate }
      const created = createTripPlan(seedState, trip, activity)
      assert.equal(created.errors.length, 0)
      assert.equal(created.state.trips.length, seedState.trips.length + 1)
      assert.equal(created.state.trips.at(-1)?.jobId, 'job-1001')
      const nextTrip = plannedTrip({ id: 'trip-1003', tripNumber: 'TR-1003', driverId: 'drv-ravi', truckId: 'trk-102', trailerId: 'trl-101', plannedPickup: '2026-11-04T09:00:00.000Z', plannedDelivery: '2026-11-04T15:00:00.000Z', assignmentKey: 'plan:trip-1003' })
      const nextActivity = { ...activity, id: 'act-trip-1003', entityId: nextTrip.id }
      const secondCreated = createTripPlan(created.state, nextTrip, nextActivity)
      assert.equal(secondCreated.errors.length, 0)
      assert.equal(secondCreated.state.trips.length, created.state.trips.length + 1)
    })

    it('rejects unavailable equipment and overlapping assignments', () => {
      const unavailable = plannedTrip()
      const maintenanceState = { ...seedState, trucks: seedState.trucks.map((truck) => truck.id === unavailable.truckId ? { ...truck, status: 'maintenance' as const } : truck) }
      assert.ok(validateTripPlan(maintenanceState, unavailable).some((error) => error.includes('under maintenance')))
      const conflict = plannedTrip({ plannedPickup: '2026-10-29T10:00:00.000Z', plannedDelivery: '2026-10-29T15:30:00.000Z', driverId: 'drv-ravi', truckId: 'trk-101' })
      assert.ok(validateTripPlan(seedState, conflict).some((error) => error.includes('overlapping')))
      assert.equal(createTripPlan(seedState, conflict, { id: 'act-conflict', entityType: 'trip', entityId: conflict.id, action: 'Trip planned', actor: 'Operations', occurredAt: seedState.demoDate }).state, seedState)
    })

    it('supports subcontractor trips and prevents duplicate retries and invalid status jumps', () => {
      const subcontracted = plannedTrip({ subcontractor: true, subcontractorName: 'Demo Linehaul', driverId: undefined, truckId: undefined, trailerId: undefined })
      assert.deepEqual(validateTripPlan(seedState, subcontracted), [])
      const activity: ActivityEvent = { id: 'act-subcontracted', entityType: 'trip', entityId: subcontracted.id, action: 'Trip planned', actor: 'Operations', occurredAt: seedState.demoDate }
      const created = createTripPlan(seedState, subcontracted, activity)
      assert.equal(created.errors.length, 0)
      assert.deepEqual(createTripPlan(created.state, subcontracted, activity).errors, ['Trip ID already exists.', 'Trip number already exists.', 'This trip assignment was already created.', 'Trip activity must be unique and link to the new trip.'])
      assert.equal(createTripPlan(created.state, subcontracted, activity).state, created.state)
      assert.equal(canTransitionTrip('assigned', 'in-progress'), true)
      assert.equal(canTransitionTrip('in-progress', 'completed'), true)
      assert.equal(canTransitionTrip('assigned', 'completed'), false)
      assert.equal(canTransitionTrip('completed', 'cancelled'), false)
    })
  })
  it('calculates invoice totals and outstanding balances separately', () => {
    const invoice = seedState.customerInvoices[0]
    assert.equal(calculateInvoiceTotals(invoice).total, 1200)
    assert.equal(invoice.paymentStatus, 'partially-paid')
    assert.equal(calculateOutstandingBalance(seedState, invoice.customerId), 700)
  })
  it('calculates available stock per linked inventory item', () => {
    const inventory = [
      { id: 'inventory-a', jobId: 'job-1001', sku: 'A', description: 'A', cartons: 100, pallets: 10, cbm: 20, weightKg: 500, bin: 'A1', status: 'stored' as const },
      { id: 'inventory-b', jobId: 'job-1001', sku: 'B', description: 'B', cartons: 50, pallets: 5, cbm: 10, weightKg: 250, bin: 'B1', status: 'stored' as const },
    ]
    const transactions = [{ id: 'movement-a', jobId: 'job-1001', inventoryId: 'inventory-a', type: 'dispatch' as const, quantity: 15, unit: 'carton' as const, reference: 'DO-1', occurredAt: seedState.demoDate }]
    assert.equal(calculateAvailableInventory(inventory[0], transactions, inventory).cartons, 85)
    assert.equal(calculateAvailableInventory(inventory[1], transactions, inventory).cartons, 50)
  })
  it('creates linked storage and billing records once', () => {
    const input = { inventoryId: seedState.inventory[0].id, periodStart: '2026-10-24', periodEnd: '2026-11-02' }
    const created = createStorageCharge(seedState, input)
    assert.equal(created.errors.length, 0)
    assert.ok(created.storageCharge?.chargeId)
    assert.equal(created.charge?.category, 'storage')
    assert.equal(created.charge?.unitPrice, created.storageCharge?.amount)
    assert.equal(getEligibleBillableCharges(created.state).some((charge) => charge.id === created.charge?.id), true)
    assert.ok(createStorageCharge(created.state, input).errors.some((error) => error.includes('already exists')))
    assert.ok(createStorageCharge(seedState, { ...input, periodStart: '2026-02-31' }).errors.some((error) => error.includes('valid')))
  })
  it('provides stable IDs and typed create, lookup, search and update operations', () => {
    const id = generateRecordId(seedState, 'customers')
    assert.equal(id, 'cus-0001')
    const { id: _seedId, ...customer } = seedState.customers[0]
    const created = createRecord(seedState, 'customers', { ...customer, name: 'New Demo Customer' })
    assert.equal(created.record?.id, id)
    assert.equal(getRecord(created.state, 'customers', id)?.name, 'New Demo Customer')
    assert.equal(searchRecords(created.state.customers, 'new demo', ['name']).length, 1)
    const updated = updateRecord(created.state, 'customers', { ...created.record!, name: 'Updated Demo Customer' })
    assert.equal(updated.record?.name, 'Updated Demo Customer')
    assert.ok(createRecord(updated.state, 'customers', { ...customer, id }).errors.some((error) => error.includes('already exists')))
  })
  it('links invoiced charges and reconciled bank lines during service creation', () => {
    const charge = seedState.charges.find((item) => item.id === 'chg-1002')!
    const invoice = createRecord(seedState, 'customerInvoices', {
      invoiceNumber: 'INV-SERVICE-001',
      customerId: charge.customerId,
      jobId: charge.jobId,
      issueDate: seedState.demoDate,
      dueDate: '2026-11-30',
      status: 'draft',
      paymentStatus: 'unpaid',
      lines: [{ id: 'il-service-001', chargeId: charge.id, description: charge.description, quantity: charge.quantity, unitPrice: charge.unitPrice, taxRate: charge.taxRate }],
      eInvoiceStatus: 'not-submitted',
      emailStatus: 'not-sent',
    })
    assert.equal(invoice.state.charges.find((item) => item.id === charge.id)?.invoiceId, invoice.record?.id)
    assert.ok(!getEligibleBillableCharges(invoice.state).some((item) => item.id === charge.id))

    const reconciliable = { ...seedState, bankTransactions: seedState.bankTransactions.map((transaction) => ({ ...transaction, matched: false })), reconciliationMatches: [] }
    const match = createRecord(reconciliable, 'reconciliationMatches', { bankTransactionId: 'bank-1001', paymentTransactionId: 'pay-1001', matchedAt: seedState.demoDate })
    assert.equal(match.state.bankTransactions.find((item) => item.id === 'bank-1001')?.matched, true)
  })
  it('generates unique job numbers from the configurable demo date', () => {
    assert.equal(generateJobNumber(seedState), 'SKI261029001')
    const created = createJobRecord(seedState, { customerId: 'cus-meridian', serviceType: 'haulage', status: 'open', owner: 'Demo operator', openedDate: seedState.demoDate })
    assert.equal(created.record?.jobNumber, 'SKI261029001')
    assert.equal(created.record?.id, 'job-1004')
    assert.throws(() => generateJobNumber(seedState, '2026-02-31'), /valid YYYY-MM-DD date/)
  })
  it('connects a customer request, sent quotation and exactly-once job creation', () => {
    const request = {
      id: 'qreq-flow-1',
      requestNumber: 'QR-FLOW-001',
      customerId: 'cus-meridian',
      requestedAt: seedState.demoDate,
      serviceType: 'freight' as const,
      direction: 'import' as const,
      mode: 'FCL' as const,
      origin: 'Shanghai',
      destination: 'Port Klang',
      cargoDescription: 'Electronics, 1 x 40ft container',
      containerQuantity: 1,
      requestedPickupDate: '2026-11-02',
      requestedDeliveryDate: '2026-11-10',
      warehouseRequired: false,
      instructions: 'Keep upright',
      status: 'new' as const,
    }
    let state = applyQuotationWorkflowAction(seedState, {
      type: 'submit-quotation-request',
      request,
      activity: { id: 'act-flow-1', entityType: 'quotation-request', entityId: request.id, action: 'Customer submitted quotation request', actor: 'Aina Noor', occurredAt: `${seedState.demoDate}T09:00:00Z` },
    })
    const quotation = {
      id: 'quo-flow-1',
      reference: 'QT-FLOW-001',
      customerId: request.customerId,
      requestId: request.id,
      version: 1,
      issueDate: seedState.demoDate,
      validUntil: '2026-11-15',
      status: 'sent' as const,
      lines: [{ id: 'ql-flow-1', description: 'Ocean freight', serviceType: 'freight' as const, quantity: 1, unit: 'container', unitPrice: 2400, discount: 0, taxRate: 0.06 }],
    }
    state = applyQuotationWorkflowAction(state, {
      type: 'save-request-quotation',
      requestId: request.id,
      quotation,
      send: true,
      activity: { id: 'act-flow-2', entityType: 'quotation-request', entityId: request.id, action: 'Quotation sent', actor: 'Aina Noor', occurredAt: `${seedState.demoDate}T10:00:00Z` },
    })
    assert.equal(state.quotationRequests.find((item) => item.id === request.id)?.status, 'quoted')
    assert.equal(state.quotationRequests.find((item) => item.id === request.id)?.quotationId, quotation.id)
    const job = {
      id: 'job-flow-1',
      jobNumber: generateJobNumber(state),
      customerId: request.customerId,
      quotationId: quotation.id,
      quotationRequestId: request.id,
      serviceType: request.serviceType,
      status: 'open' as const,
      owner: 'Aina Noor',
      openedDate: seedState.demoDate,
    }
    const shipment = {
      id: 'shp-flow-1',
      jobId: job.id,
      reference: `SHP-${job.jobNumber}`,
      mode: request.mode,
      direction: request.direction,
      origin: request.origin,
      destination: request.destination,
      eta: '',
      status: 'Booked' as const,
      cargoDescription: request.cargoDescription,
      containerQuantity: request.containerQuantity,
      warehouseRequired: request.warehouseRequired,
    }
    const acceptance = {
      type: 'respond-to-request-quotation' as const,
      quotationId: quotation.id,
      decision: 'accepted' as const,
      job,
      shipment,
      activity: [
        { id: 'act-flow-3', entityType: 'quotation-request', entityId: request.id, action: 'Customer accepted quotation', actor: 'Aina Noor', occurredAt: `${seedState.demoDate}T11:00:00Z` },
        { id: 'act-flow-4', entityType: 'job', entityId: job.id, action: `Job ${job.jobNumber} created from accepted quotation`, actor: 'CLMS workflow', occurredAt: `${seedState.demoDate}T11:00:00Z` },
      ],
    }
    state = applyQuotationWorkflowAction(state, acceptance)
    assert.equal(state.quotationRequests.find((item) => item.id === request.id)?.status, 'accepted')
    assert.equal(state.quotationRequests.find((item) => item.id === request.id)?.jobId, job.id)
    assert.equal(state.quotations.find((item) => item.id === quotation.id)?.status, 'accepted')
    assert.equal(state.jobs.filter((item) => item.quotationRequestId === request.id).length, 1)
    assert.equal(state.jobs.find((item) => item.id === job.id)?.quotationId, quotation.id)
    assert.equal(state.shipments.find((item) => item.jobId === job.id)?.cargoDescription, request.cargoDescription)
    assert.equal(state.shipments.find((item) => item.jobId === job.id)?.eta, '')
    assert.ok(state.jobMilestones.some((milestone) => milestone.jobId === job.id && milestone.key === 'import-clearance'))
    assert.equal(applyQuotationWorkflowAction(state, acceptance), state)
  })
  it('builds only applicable import and export milestones and avoids duplicates', () => {
    const importShipment = { direction: 'import' as const, mode: 'FCL' as const, containerQuantity: 1, warehouseRequired: true }
    const importMilestones = buildJobMilestones('job-import-test', importShipment, 'Aina Noor', seedState.demoDate)
    assert.deepEqual(importMilestones.map((milestone) => milestone.key), ['arrival-monitoring', 'import-clearance', 'release-edo', 'laden-pickup', 'warehouse-inbound', 'empty-return'])
    assert.deepEqual(buildJobMilestones('job-import-test', importShipment, 'Aina Noor', seedState.demoDate, importMilestones), [])

    const exportShipment = { direction: 'export' as const, mode: 'LCL' as const, containerQuantity: 0, warehouseRequired: false, pallets: 8 }
    assert.deepEqual(buildJobMilestones('job-export-test', exportShipment, 'Aina Noor', seedState.demoDate).map((milestone) => milestone.key), ['cargo-pickup', 'direct-cargo-preparation', 'packing-palletisation', 'export-clearance', 'laden-delivery-port', 'departure-monitoring'])
  })
  it('does not fill missing vessel or schedule fields in deterministic extraction samples', () => {
    const sample = shipmentExtractionSamples.find((item) => item.id === 'export-instructions')
    assert.ok(sample)
    assert.equal(sample.vessel, undefined)
    assert.equal(sample.voyage, undefined)
    assert.equal(sample.etd, undefined)
    assert.equal(sample.eta, undefined)
  })
  it('preserves sent quotation versions through customer revision requests', () => {
    const request = {
      id: 'qreq-revision-1',
      requestNumber: 'QR-REV-001',
      customerId: 'cus-meridian',
      requestedAt: seedState.demoDate,
      serviceType: 'haulage' as const,
      origin: 'Shah Alam',
      destination: 'Port Klang',
      cargoDescription: 'Palletised cargo',
      requestedPickupDate: '2026-11-02',
      requestedDeliveryDate: '2026-11-05',
      status: 'new' as const,
    }
    const first = {
      id: 'quo-revision-1',
      reference: 'QT-REV-001',
      customerId: request.customerId,
      requestId: request.id,
      version: 1,
      issueDate: seedState.demoDate,
      validUntil: '2026-11-15',
      status: 'sent' as const,
      lines: [{ id: 'ql-revision-1', description: 'Haulage', serviceType: 'haulage' as const, quantity: 1, unit: 'trip', unitPrice: 1200, discount: 0, taxRate: 0 }],
    }
    let state = applyQuotationWorkflowAction(seedState, { type: 'submit-quotation-request', request, activity: { id: 'act-revision-1', entityType: 'quotation-request', entityId: request.id, action: 'Request created', actor: 'Demo customer', occurredAt: `${seedState.demoDate}T09:00:00Z` } })
    state = applyQuotationWorkflowAction(state, { type: 'save-request-quotation', requestId: request.id, quotation: first, send: true, activity: { id: 'act-revision-2', entityType: 'quotation-request', entityId: request.id, action: 'First quote sent', actor: 'Aina Noor', occurredAt: `${seedState.demoDate}T10:00:00Z` } })
    state = applyQuotationWorkflowAction(state, { type: 'respond-to-request-quotation', quotationId: first.id, decision: 'revision-requested', note: 'Please include two delivery stops.', activity: [{ id: 'act-revision-3', entityType: 'quotation-request', entityId: request.id, action: 'Revision requested', actor: 'Demo customer', occurredAt: `${seedState.demoDate}T11:00:00Z` }] })
    const second = { ...first, id: 'quo-revision-2', reference: 'QT-REV-002', version: 2, replacesQuotationId: first.id, status: 'sent' as const, lines: [{ ...first.lines[0], id: 'ql-revision-2', description: 'Haulage with two delivery stops', unitPrice: 1450 }] }
    state = applyQuotationWorkflowAction(state, { type: 'save-request-quotation', requestId: request.id, quotation: second, send: true, activity: { id: 'act-revision-4', entityType: 'quotation-request', entityId: request.id, action: 'Revised quote sent', actor: 'Aina Noor', occurredAt: `${seedState.demoDate}T12:00:00Z` } })
    assert.equal(state.quotations.filter((item) => item.requestId === request.id).length, 2)
    assert.equal(state.quotations.find((item) => item.id === first.id)?.status, 'revised')
    assert.equal(state.quotations.find((item) => item.id === second.id)?.status, 'sent')
    assert.equal(state.quotationRequests.find((item) => item.id === request.id)?.quotationId, second.id)
  })
  it('migrates older persisted state to the current linked schema', () => {
    const legacy: Partial<typeof seedState> = { ...seedState }
    delete legacy.shipmentMilestones
    delete legacy.quotationRequests
    delete legacy.warehouseInbounds
    delete legacy.goodsReceivedNotes
    delete legacy.outboundOrders
    delete legacy.storageCharges
    legacy.inventory = seedState.inventory.map((item) => ({ ...item, id: 'inv-1001' }))
    legacy.warehouseTransactions = seedState.warehouseTransactions.map((transaction) => ({ ...transaction, inventoryId: undefined }))
    legacy.supplierCosts = seedState.supplierCosts.map((cost) => ({ ...cost, tripId: undefined }))
    legacy.reimbursements = seedState.reimbursements.map((request) => ({ ...request, tripExpenseId: undefined }))
    const migrated = migrateStoredState(legacy)
    assert.equal(migrated.inventory[0].id, 'inventory-1001')
    assert.equal(migrated.warehouseTransactions[0].inventoryId, 'inventory-1001')
    assert.ok(migrated.warehouseInbounds.length)
    assert.ok(migrated.shipmentMilestones.length)
    assert.equal(migrated.supplierCosts.find((cost) => cost.jobId === 'job-1001')?.tripId, 'trip-1001')
    assert.equal(migrated.reimbursements[0].tripExpenseId, 'texp-1001')
  })
  it('prevents reconciliation duplicates and mismatched direction or amount', () => {
    assert.equal(canMatchReconciliation(seedState, 'bank-1001', 'pay-1001'), false)
    const unmatched = { ...seedState, bankTransactions: [...seedState.bankTransactions, { id: 'bank-test', reference: 'BANK-T', description: 'Test', amount: 500, transactionDate: seedState.demoDate, direction: 'credit' as const, matched: false }] }
    assert.equal(canMatchReconciliation(unmatched, 'bank-test', 'pay-1001'), false)
    const availablePayment = { ...seedState, reconciliationMatches: [], bankTransactions: seedState.bankTransactions.map((transaction) => ({ ...transaction, matched: false })) }
    assert.equal(canMatchReconciliation(availablePayment, 'bank-1001', 'pay-1001'), true)
    assert.equal(canMatchReconciliation({ ...availablePayment, reconciliationMatches: [{ id: 'match-test', bankTransactionId: 'other-bank', paymentTransactionId: 'pay-1001', matchedAt: seedState.demoDate }] }, 'bank-1001', 'pay-1001'), false)
    const wrongAmount = { ...unmatched, bankTransactions: unmatched.bankTransactions.map((transaction) => transaction.id === 'bank-test' ? { ...transaction, amount: 501 } : transaction) }
    assert.equal(canMatchReconciliation(wrongAmount, 'bank-test', 'pay-1001'), false)
  })
  it('rejects duplicate invoice inclusion and supplier references', () => {
    const invoice = { ...seedState.customerInvoices[0], lines: [...seedState.customerInvoices[0].lines, { ...seedState.customerInvoices[0].lines[0], id: 'duplicate-line' }] }
    assert.ok(validateInvoice(seedState, invoice).some((error) => error.includes('twice')))
    assert.ok(validateSupplierInvoice(seedState, { reference: 'th-2026-1042' }).length)
  })
  it('returns deterministic dashboard and invoice totals', () => {
    assert.equal(calculateInvoiceTotals(seedState.customerInvoices[0]).total, 1200)
    assert.equal(calculateDashboardKpis(seedState).uninvoicedCharges, 4)
  })
  it('derives operational and finance alerts from deterministic demo conditions', () => {
    const alerts = deriveAlerts(seedState)
    assert.ok(alerts.some((alert) => alert.title === 'Container free time expires tomorrow'))
    assert.ok(alerts.some((alert) => alert.title === 'EDO not released'))
    assert.ok(alerts.some((alert) => alert.title === 'Customer payment overdue by 14 days'))
    assert.ok(alerts.some((alert) => alert.title === 'Warehouse cargo exceeds 30 days'))
    assert.ok(alerts.some((alert) => alert.title === 'Truck road tax due'))
    assert.ok(alerts.some((alert) => alert.title === 'Truck insurance due'))
    assert.ok(alerts.some((alert) => alert.title === 'Required documents missing'))
    assert.ok(alerts.some((alert) => alert.title === 'Billable charge not invoiced'))
    assert.ok(alerts.some((alert) => alert.sourceRecordId === 'generated-forwarding-fwd-1001'))
    assert.ok(alerts.some((alert) => alert.title === 'Invoice awaiting finance approval'))
    assert.ok(alerts.some((alert) => alert.title === 'E-invoice submission failure'))
    assert.ok(alerts.some((alert) => alert.title === 'Supplier invoice awaiting processing'))
    assert.ok(alerts.some((alert) => alert.title === 'Reconciliation exception'))
    assert.ok(alerts.some((alert) => alert.title === 'Shipment follow-up'))
  })
  it('updates alerts when their underlying condition is resolved and filters financial reports by period', () => {
    const resolvedCustoms = { ...seedState, customsRecords: seedState.customsRecords.map((record) => record.id === 'cusrec-1001' ? { ...record, edoStatus: 'released' as const, missingDocuments: [] } : record) }
    assert.ok(!deriveAlerts(resolvedCustoms).some((alert) => alert.sourceRecordId === 'cusrec-1001'))
    const report = calculateFinancialStatements(seedState, '2026-10')
    assert.equal(report.revenue, 1980)
    assert.equal(report.costs, 830)
  })
  it('validates unique job numbers and known customers', () => {
    assert.deepEqual(validateJob(seedState, { jobNumber: 'SKI2610028', customerId: 'cus-meridian' }), ['Job Number must be unique.'])
    assert.deepEqual(validateJob(seedState, { jobNumber: 'SKI2610999', customerId: 'missing' }), ['Customer must reference an existing record.'])
  })
})
