import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateAvailableInventory, calculateReservedInventory, getEligibleBillableCharges } from './calculations.ts'
import { applyOutboundCommand, applyOutboundTripUpdate } from './outboundWorkflow.ts'
import { seedState } from '../data/seed.ts'
import { generateRecordId } from '../services/mockDataService.ts'
import type { ActivityEvent, OutboundOrder, Trip } from './types.ts'

describe('warehouse outbound workflow', () => {
  it('reserves stock, dispatches partial quantities, verifies POD, and delivers the remainder', () => {
    let state = structuredClone(seedState)
    const inventory = state.inventory.find((item) => item.id === 'inventory-1001')!
    const order: OutboundOrder = {
      id: 'out-2001',
      jobId: inventory.jobId,
      inventoryId: inventory.id,
      deliveryOrderNumber: 'DO-261029-201',
      quantity: 12,
      unit: 'pallet',
      status: 'open',
      createdAt: state.demoDate,
      deliveryDate: '2026-11-03',
      shipmentId: 'shp-1002',
      pickedQuantity: 0,
      packedQuantity: 0,
      loadedQuantity: 0,
      dispatchedQuantity: 0,
      pickingStatus: 'pending',
      packingStatus: 'pending',
      loadingStatus: 'pending',
      dispatchStatus: 'pending',
      podStatus: 'pending',
    }

    const event = (action: string, id = order.id): ActivityEvent => ({
      id: generateRecordId(state, 'activity'),
      entityType: 'outbound-order',
      entityId: id,
      action,
      actor: 'Warehouse operations',
      occurredAt: state.demoDate,
    })
    const run = (command: Parameters<typeof applyOutboundCommand>[1]) => {
      const result = applyOutboundCommand(state, command)
      assert.deepEqual(result.errors, [])
      state = result.state
    }
    const updateTrip = (trip: Trip) => {
      const result = applyOutboundTripUpdate(state, trip)
      assert.deepEqual(result.errors, [])
      state = result.state
    }

    run({ type: 'create', order, activity: event('Delivery order created') })
    assert.equal(calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory).pallets, 12)
    assert.equal(calculateReservedInventory(inventory.id, state.outboundOrders, undefined, 'pallet'), 12)

    const planTrip = (id: string, number: string, date: string): Trip => ({
      id,
      tripNumber: number,
      jobId: order.jobId,
      shipmentId: order.shipmentId,
      outboundOrderId: order.id,
      outboundQuantity: 12,
      tripType: 'warehouse-delivery',
      driverId: 'drv-nadia',
      truckId: 'trk-102',
      trailerId: 'trl-101',
      pickup: 'Warehouse · B-04-12',
      delivery: 'Apex Retail DC',
      plannedPickup: `${date}T09:00:00.000Z`,
      plannedDelivery: `${date}T17:00:00.000Z`,
      status: 'assigned',
      billingAmount: 0,
      truckingCost: 0,
      tollCost: 0,
      otherCost: 0,
      milestones: ['Outbound loading assignment'],
      podStatus: 'pending',
      subcontractor: false,
    })

    const deliver = (quantity: number, tripId: string, tripNumber: string, date: string) => {
      run({
        type: 'pick', orderId: order.id, quantity, complete: true, transactionId: generateRecordId(state, 'warehouseTransactions'),
        occurredAt: date, activity: event(`Picked ${quantity}`),
      })
      run({
        type: 'pack', orderId: order.id, labelReference: `LBL-${tripNumber}`, transactionId: generateRecordId(state, 'warehouseTransactions'),
        occurredAt: date, activity: event(`Packed ${quantity}`),
      })
      run({
        type: 'create-loading-task', orderId: order.id, occurredAt: date, activity: event('Loading task created'),
      })
      const trip = planTrip(tripId, tripNumber, date)
      run({ type: 'assign-trip', orderId: order.id, trip, activity: event(`Assigned ${tripNumber}`) })
      run({
        type: 'load', orderId: order.id, quantity, transactionId: generateRecordId(state, 'warehouseTransactions'),
        occurredAt: date, activity: event(`Loaded ${quantity}`),
      })
      run({
        type: 'dispatch', orderId: order.id, tripId, transactionId: generateRecordId(state, 'warehouseTransactions'),
        occurredAt: date, activity: event(`Dispatched ${quantity}`),
      })
      const assigned = state.trips.find((item) => item.id === tripId)!
      const startedAt = `${date}T10:00:00Z`
      updateTrip({
        ...assigned,
        status: 'in-progress',
        milestones: [...assigned.milestones, `Trip Started · ${startedAt}`],
        driverMilestones: [{ key: 'trip-started', label: 'Trip Started', occurredAt: startedAt }],
      })
      const inProgress = state.trips.find((item) => item.id === tripId)!
      const ladenAt = `${date}T15:00:00Z`
      updateTrip({
        ...inProgress,
        milestones: [...inProgress.milestones, `Laden Delivery · ${ladenAt}`],
        driverMilestones: [...(inProgress.driverMilestones ?? []), { key: 'laden-delivery', label: 'Laden Delivery', occurredAt: ladenAt }],
      })
      const delivered = state.trips.find((item) => item.id === tripId)!
      const podReceivedAt = `${date}T16:30:00Z`
      const podDocument = {
        id: generateRecordId(state, 'documents'), jobId: order.jobId, name: `${tripNumber}-pod.jpg`, category: 'pod' as const,
        status: 'pending-review' as const, uploadedAt: date, mimeType: 'image/jpeg', relatedRecordId: tripId,
        accessRule: 'customer-visible' as const, previewText: 'Receiver: Apex receiving · signed.',
      }
      state = { ...state, documents: [...state.documents, podDocument] }
      updateTrip({
        ...delivered, podStatus: 'received', podReceiverName: 'Apex receiving', podSignatureCaptured: true,
        podPhotoName: podDocument.name, podReceivedAt,
        driverMilestones: [...(delivered.driverMilestones ?? []), { key: 'pod', label: 'POD', occurredAt: podReceivedAt }],
      })
      const withPod = state.trips.find((item) => item.id === tripId)!
      const completedAt = `${date}T17:00:00Z`
      updateTrip({
        ...withPod,
        status: 'completed',
        milestones: [...withPod.milestones, `Completed · ${completedAt}`],
        driverMilestones: [...(withPod.driverMilestones ?? []), { key: 'completed', label: 'Completed', occurredAt: completedAt }],
      })
      run({ type: 'verify', orderId: order.id, tripId, occurredAt: date, activity: event(`Verified ${tripNumber}`) })
    }

    deliver(5, 'trip-2001', 'TR-DO-261029-201-01', '2026-11-03')
    assert.equal(calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory).pallets, 7)
    assert.equal(calculateReservedInventory(inventory.id, state.outboundOrders, undefined, 'pallet'), 7)
    assert.equal(state.outboundOrders[0].status, 'partial')
    assert.ok(getEligibleBillableCharges(state).some((charge) => charge.category === 'handling'))
    assert.ok(getEligibleBillableCharges(state).some((charge) => charge.category === 'trucking'))
    assert.ok(getEligibleBillableCharges(state).some((charge) => charge.category === 'storage'))

    deliver(7, 'trip-2002', 'TR-DO-261029-201-02', '2026-11-04')
    assert.equal(calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory).pallets, 0)
    assert.equal(calculateReservedInventory(inventory.id, state.outboundOrders, undefined, 'pallet'), 0)
    assert.equal(state.outboundOrders[0].status, 'verified')
    assert.equal(state.outboundOrders[0].dispatchedQuantity, 12)
    assert.equal(state.trips.filter((trip) => trip.outboundOrderId === order.id && trip.podStatus === 'approved').length, 2)
    assert.equal(getEligibleBillableCharges(state).filter((charge) => charge.category === 'handling').length, 2)
  })

  it('rejects duplicate delivery, insufficient stock, missing POD, and mismatched job/container links', () => {
    const state = structuredClone(seedState)
    const inventory = state.inventory[0]
    const base: OutboundOrder = {
      id: 'out-3001', jobId: inventory.jobId, inventoryId: inventory.id, deliveryOrderNumber: 'DO-UNIQUE',
      quantity: 1, unit: 'pallet', status: 'open', createdAt: state.demoDate, deliveryDate: '2026-11-03',
    }
    const activity: ActivityEvent = { id: 'act-out-3001', entityType: 'outbound-order', entityId: base.id, action: 'Create', actor: 'Warehouse', occurredAt: state.demoDate }
    const created = applyOutboundCommand(state, { type: 'create', order: base, activity })
    assert.deepEqual(created.errors, [])
    assert.ok(applyOutboundCommand(created.state, { type: 'create', order: { ...base, id: 'out-3002' }, activity: { ...activity, id: 'act-out-3002', entityId: 'out-3002' } }).errors.some((error) => error.includes('already in use')))
    assert.ok(applyOutboundCommand(state, { type: 'create', order: { ...base, id: 'out-3003', deliveryOrderNumber: 'DO-TOO-MUCH', quantity: 99 }, activity: { ...activity, id: 'act-out-3003', entityId: 'out-3003' } }).errors.some((error) => error.includes('Insufficient')))
    assert.ok(applyOutboundCommand(created.state, { type: 'verify', orderId: base.id, tripId: 'trip-missing', occurredAt: state.demoDate, activity: { ...activity, id: 'act-out-verify' } }).errors.some((error) => error.includes('POD trip')))
    assert.ok(applyOutboundCommand(state, { type: 'create', order: { ...base, id: 'out-3004', deliveryOrderNumber: 'DO-WRONG-JOB', jobId: 'job-1001', containerId: 'con-1001' }, activity: { ...activity, id: 'act-out-3004', entityId: 'out-3004' } }).errors.some((error) => error.includes('Inventory must belong')))
  })
})
