import type { DriverMilestoneEvent, DriverMilestoneKey, Trip } from './types.ts'

export interface DriverWorkflowStep {
  key: DriverMilestoneKey
  label: string
}

const stepsByType: Record<NonNullable<Trip['tripType']>, DriverWorkflowStep[]> = {
  'container-pickup': [
    { key: 'trip-started', label: 'Trip Started' },
    { key: 'empty-pickup', label: 'Empty Pickup' },
    { key: 'laden-delivery', label: 'Laden Delivery' },
    { key: 'pod', label: 'POD' },
    { key: 'return-empty', label: 'Return Empty' },
    { key: 'completed', label: 'Completed' },
  ],
  'warehouse-delivery': [
    { key: 'trip-started', label: 'Trip Started' },
    { key: 'laden-delivery', label: 'Laden Delivery' },
    { key: 'pod', label: 'POD' },
    { key: 'completed', label: 'Completed' },
  ],
  'empty-return': [
    { key: 'trip-started', label: 'Trip Started' },
    { key: 'return-empty', label: 'Return Empty' },
    { key: 'completed', label: 'Completed' },
  ],
  'port-delivery': [
    { key: 'trip-started', label: 'Trip Started' },
    { key: 'laden-delivery', label: 'Laden Delivery' },
    { key: 'pod', label: 'POD' },
    { key: 'completed', label: 'Completed' },
  ],
  'general-haulage': [
    { key: 'trip-started', label: 'Trip Started' },
    { key: 'laden-delivery', label: 'Laden Delivery' },
    { key: 'pod', label: 'POD' },
    { key: 'completed', label: 'Completed' },
  ],
}

export function getDriverWorkflow(trip: Trip): DriverWorkflowStep[] {
  return stepsByType[trip.tripType ?? 'general-haulage']
}

export function isDriverMilestoneComplete(trip: Trip, key: DriverMilestoneKey): boolean {
  if (trip.driverMilestones?.some((milestone) => milestone.key === key)) return true
  if (key === 'trip-started' && ['in-progress', 'completed'].includes(trip.status)) return true
  if (key === 'pod' && trip.podStatus && trip.podStatus !== 'pending') return true
  if (trip.status === 'completed') {
    const podIndex = getDriverWorkflow(trip).findIndex((step) => step.key === 'pod')
    const stepIndex = getDriverWorkflow(trip).findIndex((step) => step.key === key)
    if (key === 'completed') return true
    if (podIndex < 0 || trip.podStatus === 'received') return true
    return stepIndex >= 0 && stepIndex < podIndex
  }
  return false
}

export function getNextDriverStep(trip: Trip): DriverWorkflowStep | undefined {
  return getDriverWorkflow(trip).find((step) => !isDriverMilestoneComplete(trip, step.key))
}

export function applyDriverMilestone(
  trip: Trip,
  activeDriverId: string,
  key: DriverMilestoneKey,
  occurredAt: string,
): { trip?: Trip; errors: string[] } {
  if (!trip.driverId || trip.driverId !== activeDriverId) return { errors: ['This trip is not assigned to the selected driver.'] }
  if (trip.status === 'cancelled' || trip.status === 'completed') return { errors: ['This trip can no longer be updated.'] }
  const next = getNextDriverStep(trip)
  if (!next || next.key !== key) return { errors: [`Complete the ${next?.label ?? 'available'} milestone before continuing.`] }
  if (!Number.isFinite(Date.parse(occurredAt))) return { errors: ['A valid milestone timestamp is required.'] }
  if (key === 'pod') return { errors: ['Submit POD using the proof-of-delivery form.'] }
  if (key === 'trip-started' && trip.status !== 'assigned') return { errors: ['Only an assigned trip can be started.'] }
  if (key !== 'trip-started' && trip.status !== 'in-progress') return { errors: ['Start the assigned trip before updating its milestones.'] }

  const event: DriverMilestoneEvent = { key, label: next.label, occurredAt }
  return {
    trip: {
      ...trip,
      status: key === 'trip-started' ? 'in-progress' : key === 'completed' ? 'completed' : trip.status,
      driverMilestones: [...(trip.driverMilestones ?? []), event],
      milestones: [...trip.milestones, `${next.label} · ${occurredAt}`],
    },
    errors: [],
  }
}

export function recordDriverPod(
  trip: Trip,
  activeDriverId: string,
  occurredAt: string,
): { trip?: Trip; errors: string[] } {
  if (!trip.driverId || trip.driverId !== activeDriverId) return { errors: ['This trip is not assigned to the selected driver.'] }
  if (trip.status !== 'in-progress') return { errors: ['Start the trip and complete the laden delivery before submitting POD.'] }
  const next = getNextDriverStep(trip)
  if (next?.key !== 'pod') return { errors: ['POD is not the next milestone for this trip type.'] }
  if (!trip.podReceiverName?.trim() || !trip.podSignatureCaptured || !trip.podPhotoName?.trim() || !Number.isFinite(Date.parse(occurredAt))) {
    return { errors: ['POD requires a receiver, signature, delivery photo and valid timestamp.'] }
  }
  const event: DriverMilestoneEvent = { key: 'pod', label: 'POD', occurredAt }
  return {
    trip: {
      ...trip,
      podStatus: 'received',
      podReceivedAt: occurredAt,
      driverMilestones: [...(trip.driverMilestones ?? []), event],
      milestones: [...trip.milestones, `POD submitted · ${occurredAt}`],
    },
    errors: [],
  }
}

export function estimateExpense(trip: Trip, category: string): number {
  if (category === 'toll') return trip.estimatedTollCost ?? 0
  if (category === 'fuel') return trip.estimatedTruckingCost ?? 0
  if (category === 'other') return trip.estimatedOtherCost ?? 0
  return 0
}

export function validateDriverExpense(
  trip: Trip,
  activeDriverId: string,
  category: string,
  description: string,
  amount: number,
): string[] {
  const errors: string[] = []
  if (!trip.driverId || trip.driverId !== activeDriverId) errors.push('This trip is not assigned to the selected driver.')
  const permittedCategories: readonly string[] = ['toll', 'fuel', 'parking', 'port charges', 'waiting', 'detention', 'driver allowance', 'other']
  if (!permittedCategories.includes(category)) {
    errors.push('Select a permitted expense category.')
  }
  if (!description.trim()) errors.push('Enter an expense description.')
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter a positive actual expense amount.')
  return errors
}
