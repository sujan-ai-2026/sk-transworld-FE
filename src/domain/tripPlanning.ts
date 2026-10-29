import type { ActivityEvent, AppState, Trip } from './types.ts'

const activeStatuses: Trip['status'][] = ['planned', 'assigned', 'in-progress']

function overlaps(firstStart?: string, firstEnd?: string, secondStart?: string, secondEnd?: string) {
  if (!firstStart || !secondStart) return false
  const firstFrom = Date.parse(firstStart)
  const secondFrom = Date.parse(secondStart)
  const firstTo = firstEnd ? Date.parse(firstEnd) : firstFrom + 60 * 60 * 1000
  const secondTo = secondEnd ? Date.parse(secondEnd) : secondFrom + 60 * 60 * 1000
  return firstFrom < secondTo && secondFrom < firstTo
}

export function validateTripPlan(state: AppState, trip: Trip, excludingTripId?: string, allowLegacySchedule = false): string[] {
  const errors: string[] = []
  if (!state.jobs.some((job) => job.id === trip.jobId)) errors.push('Select a valid job.')
  if (trip.shipmentId && !state.shipments.some((shipment) => shipment.id === trip.shipmentId && shipment.jobId === trip.jobId)) errors.push('The selected shipment must belong to this job.')
  if (trip.containerId && !state.containers.some((container) => container.id === trip.containerId && container.jobId === trip.jobId && (!trip.shipmentId || container.shipmentId === trip.shipmentId))) errors.push('The selected container must belong to the selected job and shipment.')
  if (trip.outboundOrderId) {
    const order = state.outboundOrders.find((item) => item.id === trip.outboundOrderId && item.jobId === trip.jobId)
    if (!order) errors.push('Outbound trip must reference a delivery order for this job.')
    else if (order.containerId !== trip.containerId || order.shipmentId !== trip.shipmentId) errors.push('Outbound trip shipment and container must match its delivery order.')
    if (trip.outboundQuantity !== undefined && trip.outboundQuantity <= 0) errors.push('Outbound trip quantity must be positive.')
  }
  if (!trip.tripType && !allowLegacySchedule) errors.push('Select a trip type.')
  if (!trip.pickup.trim() || !trip.delivery.trim()) errors.push('Pickup and delivery locations are required.')
  const from = trip.plannedPickup ? Date.parse(trip.plannedPickup) : NaN
  const to = trip.plannedDelivery ? Date.parse(trip.plannedDelivery) : NaN
  const missingLegacySchedule = allowLegacySchedule && !trip.plannedPickup && !trip.plannedDelivery
  if (!missingLegacySchedule && (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)) errors.push('Enter valid planned pickup and delivery dates/times in order.')
  if (trip.portAppointment && !Number.isFinite(Date.parse(trip.portAppointment))) errors.push('Enter a valid port appointment time.')
  if (trip.billingAmount < 0 || trip.truckingCost < 0 || trip.tollCost < 0 || trip.otherCost < 0) errors.push('Agreed rate and estimated trip costs cannot be negative.')

  if (trip.subcontractor) {
    if (!trip.subcontractorName?.trim()) errors.push('Enter the subcontractor name.')
    if (trip.driverId) {
      const subcontractorDriver = state.drivers.find((driver) => driver.id === trip.driverId)
      if (!subcontractorDriver) errors.push('The selected subcontractor driver is not in the driver master.')
      else if (subcontractorDriver.status === 'off-duty') errors.push(`Driver ${subcontractorDriver.name} is off duty.`)
    }
  } else {
    const truck = state.trucks.find((item) => item.id === trip.truckId)
    const trailer = state.trailers.find((item) => item.id === trip.trailerId)
    const driver = state.drivers.find((item) => item.id === trip.driverId)
    if (!truck || !trailer || !driver) errors.push('Select an available driver, truck and trailer, or choose subcontractor.')
    else {
      if (truck.status === 'maintenance') errors.push(`Truck ${truck.registrationNumber} is under maintenance.`)
      if (trailer.status === 'maintenance') errors.push(`Trailer ${trailer.registrationNumber} is under maintenance.`)
      if (trailer.documentStatus === 'expired' || trailer.documentStatus === 'missing') errors.push(`Trailer ${trailer.registrationNumber} has ${trailer.documentStatus} documents.`)
      if (driver.status === 'off-duty') errors.push(`Driver ${driver.name} is off duty.`)
      const pickupDate = trip.plannedPickup?.slice(0, 10) ?? ''
      if (pickupDate && truck.insuranceExpiry && truck.insuranceExpiry < pickupDate) errors.push(`Truck ${truck.registrationNumber} insurance expires before pickup.`)
      if (pickupDate && truck.roadTaxExpiry && truck.roadTaxExpiry < pickupDate) errors.push(`Truck ${truck.registrationNumber} road tax expires before pickup.`)
      if (pickupDate && truck.documentExpiry && truck.documentExpiry < pickupDate) errors.push(`Truck ${truck.registrationNumber} vehicle documents expire before pickup.`)
      if (pickupDate && trailer.documentExpiry && trailer.documentExpiry < pickupDate) errors.push(`Trailer ${trailer.registrationNumber} documents expire before pickup.`)
      if (pickupDate && driver.licenceExpiry && driver.licenceExpiry < pickupDate) errors.push(`Driver ${driver.name}'s licence expires before pickup.`)
      const shipment = state.shipments.find((item) => item.id === trip.shipmentId)
      if (shipment?.weightKg && truck.capacityTons > 0 && shipment.weightKg / 1000 > truck.capacityTons) errors.push(`Shipment weight exceeds ${truck.registrationNumber}'s ${truck.capacityTons} ton capacity.`)
      if (shipment?.weightKg && trailer.capacityTons && shipment.weightKg / 1000 > trailer.capacityTons) errors.push(`Shipment weight exceeds ${trailer.registrationNumber}'s ${trailer.capacityTons} ton capacity.`)
    }
  }

  if (activeStatuses.includes(trip.status)) {
    const conflicts = state.trips.filter((item) => item.id !== excludingTripId && item.id !== trip.id && activeStatuses.includes(item.status)
      && overlaps(trip.plannedPickup, trip.plannedDelivery, item.plannedPickup, item.plannedDelivery))
    if (trip.containerId && conflicts.some((item) => item.containerId === trip.containerId)) errors.push('The selected container already has an overlapping trip assignment.')
    for (const resource of [
      ['driver', trip.driverId, conflicts.map((item) => item.driverId), state.drivers.find((item) => item.id === trip.driverId)?.name],
      ['truck', trip.truckId, conflicts.map((item) => item.truckId), state.trucks.find((item) => item.id === trip.truckId)?.registrationNumber],
      ['trailer', trip.trailerId, conflicts.map((item) => item.trailerId), state.trailers.find((item) => item.id === trip.trailerId)?.registrationNumber],
    ] as const) {
      if (resource[1] && resource[2].includes(resource[1])) errors.push(`${resource[0]} ${resource[3] ?? ''} has an overlapping trip assignment.`)
    }
  }
  return [...new Set(errors)]
}

export function createTripPlan(state: AppState, trip: Trip, activity: ActivityEvent) {
  const errors = [...validateTripPlan(state, trip)]
  if (state.trips.some((item) => item.id === trip.id)) errors.push('Trip ID already exists.')
  if (state.trips.some((item) => item.tripNumber.toLowerCase() === trip.tripNumber.toLowerCase())) errors.push('Trip number already exists.')
  if (trip.assignmentKey && state.trips.some((item) => item.assignmentKey === trip.assignmentKey)) errors.push('This trip assignment was already created.')
  if (activity.entityId !== trip.id || activity.entityType !== 'trip' || state.activity.some((event) => event.id === activity.id)) errors.push('Trip activity must be unique and link to the new trip.')
  const uniqueErrors = [...new Set(errors)]
  if (uniqueErrors.length) return { state, errors: uniqueErrors }
  return { state: { ...state, trips: [...state.trips, trip], activity: [...state.activity, activity] }, record: trip, errors: [] }
}

const transitions: Record<Trip['status'], Trip['status'][]> = {
  planned: ['assigned', 'cancelled'],
  assigned: ['in-progress', 'cancelled'],
  'in-progress': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransitionTrip(from: Trip['status'], to: Trip['status']) {
  return transitions[from].includes(to)
}

export function tripAvailability(state: AppState, kind: 'driver' | 'truck' | 'trailer', resourceId: string, start: string, end: string, excludingTripId?: string) {
  return !state.trips.some((trip) => trip.id !== excludingTripId && activeStatuses.includes(trip.status)
    && trip[`${kind}Id`] === resourceId
    && overlaps(start, end, trip.plannedPickup, trip.plannedDelivery))
}
