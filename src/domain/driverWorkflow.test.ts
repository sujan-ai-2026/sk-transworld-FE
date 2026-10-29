import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDriverMilestone, getDriverWorkflow, recordDriverPod, validateDriverExpense } from './driverWorkflow.ts'
import type { Trip } from './types.ts'

const assignedTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 'trip-1',
  tripNumber: 'TR-1',
  jobId: 'job-1',
  driverId: 'driver-1',
  tripType: 'warehouse-delivery',
  pickup: 'Warehouse',
  delivery: 'Customer',
  status: 'assigned',
  billingAmount: 100,
  truckingCost: 0,
  tollCost: 0,
  otherCost: 0,
  milestones: ['Trip planned'],
  podStatus: 'pending',
  ...overrides,
})

test('driver workflow follows only the milestones required by the trip type', () => {
  assert.deepEqual(getDriverWorkflow(assignedTrip({ tripType: 'warehouse-delivery' })).map((step) => step.key), [
    'trip-started', 'laden-delivery', 'pod', 'completed',
  ])
  assert.deepEqual(getDriverWorkflow(assignedTrip({ tripType: 'empty-return' })).map((step) => step.key), [
    'trip-started', 'return-empty', 'completed',
  ])
  assert.deepEqual(getDriverWorkflow(assignedTrip({ tripType: 'container-pickup' })).map((step) => step.key), [
    'trip-started', 'empty-pickup', 'laden-delivery', 'pod', 'return-empty', 'completed',
  ])
})

test('assigned driver can progress through delivery, POD and completion in order', () => {
  let trip = assignedTrip()
  for (const key of ['trip-started', 'laden-delivery'] as const) {
    const result = applyDriverMilestone(trip, 'driver-1', key, '2026-10-29T10:00:00Z')
    assert.deepEqual(result.errors, [])
    trip = result.trip!
  }
  const pod = recordDriverPod({
    ...trip,
    podReceiverName: 'Receiver',
    podSignatureCaptured: true,
    podPhotoName: 'delivery.jpg',
  }, 'driver-1', '2026-10-29T11:00:00Z')
  assert.deepEqual(pod.errors, [])
  trip = pod.trip!
  const completed = applyDriverMilestone(trip, 'driver-1', 'completed', '2026-10-29T11:05:00Z')
  assert.deepEqual(completed.errors, [])
  assert.equal(completed.trip?.status, 'completed')
  assert.equal(completed.trip?.driverMilestones?.length, 4)
})

test('container pickup requires empty pickup, laden delivery, POD, return empty, then completion', () => {
  let trip = assignedTrip({ tripType: 'container-pickup' })
  for (const key of ['trip-started', 'empty-pickup', 'laden-delivery'] as const) {
    const result = applyDriverMilestone(trip, 'driver-1', key, '2026-10-29T10:00:00Z')
    assert.deepEqual(result.errors, [])
    trip = result.trip!
  }
  const pod = recordDriverPod({
    ...trip,
    podReceiverName: 'Receiver',
    podSignatureCaptured: true,
    podPhotoName: 'delivery.jpg',
  }, 'driver-1', '2026-10-29T11:00:00Z')
  assert.deepEqual(pod.errors, [])
  trip = pod.trip!
  const returnEmpty = applyDriverMilestone(trip, 'driver-1', 'return-empty', '2026-10-29T12:00:00Z')
  assert.deepEqual(returnEmpty.errors, [])
  trip = returnEmpty.trip!
  const completed = applyDriverMilestone(trip, 'driver-1', 'completed', '2026-10-29T13:00:00Z')
  assert.deepEqual(completed.errors, [])
  assert.equal(completed.trip?.status, 'completed')
  assert.deepEqual(completed.trip?.driverMilestones?.map((milestone) => milestone.key), [
    'trip-started', 'empty-pickup', 'laden-delivery', 'pod', 'return-empty', 'completed',
  ])
})

test('rejects unassigned drivers, skipped milestones, and missing POD data', () => {
  const trip = assignedTrip()
  assert.match(applyDriverMilestone(trip, 'driver-2', 'trip-started', '2026-10-29T10:00:00Z').errors[0], /not assigned/)
  assert.match(applyDriverMilestone(trip, 'driver-1', 'laden-delivery', '2026-10-29T10:00:00Z').errors[0], /Trip Started/)
  const started = applyDriverMilestone(trip, 'driver-1', 'trip-started', '2026-10-29T10:00:00Z').trip!
  assert.match(recordDriverPod(started, 'driver-1', '2026-10-29T11:00:00Z').errors[0], /POD is not the next milestone/)
})

test('validates manual expense categories, assignment and positive actual amounts', () => {
  const trip = assignedTrip()
  assert.match(validateDriverExpense(trip, 'driver-2', 'toll', 'Port toll', 20)[0], /not assigned/)
  assert.match(validateDriverExpense(trip, 'driver-1', 'unlisted', 'Other cost', 20)[0], /permitted/)
  assert.match(validateDriverExpense(trip, 'driver-1', 'fuel', 'Fuel receipt', 0)[0], /positive actual/)
  assert.deepEqual(validateDriverExpense(trip, 'driver-1', 'other', 'Parking', 20), [])
})
