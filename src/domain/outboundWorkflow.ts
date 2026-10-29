import { calculateAvailableInventory, calculateReservedInventory } from './calculations.ts'
import { canTransitionTrip, validateTripPlan } from './tripPlanning.ts'
import type { ActivityEvent, AppState, OutboundOrder, Trip, WarehouseTransaction } from './types.ts'

type CommandBase = { orderId: string; occurredAt: string; activity: ActivityEvent }

export type OutboundCommand =
  | { type: 'create'; order: OutboundOrder; activity: ActivityEvent }
  | (CommandBase & { type: 'pick'; quantity: number; complete: boolean; discrepancyNote?: string; transactionId: string })
  | (CommandBase & { type: 'pack'; labelReference: string; transactionId: string })
  | (CommandBase & { type: 'create-loading-task' })
  | { type: 'assign-trip'; orderId: string; trip: Trip; activity: ActivityEvent }
  | (CommandBase & { type: 'load'; quantity: number; transactionId: string })
  | (CommandBase & { type: 'dispatch'; tripId: string; transactionId: string })
  | { type: 'verify'; orderId: string; tripId: string; occurredAt: string; activity: ActivityEvent }

export interface OutboundMutation {
  state: AppState
  errors: string[]
}
export interface TripMutation {
  state: AppState
  errors: string[]
}

const dateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function orderFor(state: AppState, orderId: string) {
  return state.outboundOrders.find((order) => order.id === orderId)
}

function transaction(
  order: OutboundOrder,
  id: string,
  type: WarehouseTransaction['type'],
  quantity: number,
  occurredAt: string,
  reference: string,
  note: string,
): WarehouseTransaction {
  return {
    id,
    jobId: order.jobId,
    inventoryId: order.inventoryId,
    containerId: order.containerId,
    type,
    quantity,
    unit: order.unit,
    reference,
    note,
    occurredAt,
  }
}

function uniqueActivity(state: AppState, activity: ActivityEvent) {
  return !state.activity.some((event) => event.id === activity.id)
    && activity.entityType === 'outbound-order'
}

function activeUnverifiedTrip(state: AppState, orderId: string) {
  return state.trips.some((trip) => trip.outboundOrderId === orderId && trip.podStatus !== 'approved')
}

function addOrderDocument(state: AppState, order: OutboundOrder, category: 'delivery-order' | 'packing-list' | 'label', name: string) {
  const documentId = (() => {
    let sequence = state.documents.length + 1
    let id = `doc-${String(sequence).padStart(4, '0')}`
    while (state.documents.some((document) => document.id === id)) {
      sequence += 1
      id = `doc-${String(sequence).padStart(4, '0')}`
    }
    return id
  })()
  return {
    ...state,
    documents: [...state.documents, {
      id: documentId,
      jobId: order.jobId,
      name,
      category,
      status: 'available' as const,
      uploadedAt: state.demoDate,
      relatedRecordId: order.id,
      accessRule: 'internal' as const,
      previewText: `${category.replaceAll('-', ' ')} metadata linked to delivery order ${order.deliveryOrderNumber}.`,
    }],
  }
}

export function applyOutboundTripUpdate(state: AppState, trip: Trip): TripMutation {
  const current = state.trips.find((item) => item.id === trip.id)
  if (!current) return { state, errors: ['Trip was not found.'] }
  if (current.status !== trip.status && !canTransitionTrip(current.status, trip.status)) return { state, errors: ['Trip status transition is not permitted.'] }
  const errors = validateTripPlan(state, trip, current.id, true)
  if (current.outboundOrderId && trip.status === 'completed'
    && !state.warehouseTransactions.some((movement) => movement.type === 'dispatch' && movement.reference === `${current.tripNumber}-DISPATCH`)) {
    errors.push('Outbound trip cannot be completed before dispatch.')
  }
  if (current.outboundOrderId && trip.status === 'completed' && trip.podStatus !== 'received') {
    errors.push('Submit POD before completing the outbound trip.')
  }
  if (current.outboundOrderId && trip.podStatus === 'received'
    && (!['in-progress', 'completed'].includes(trip.status)
      || !trip.driverMilestones?.some((milestone) => milestone.key === 'laden-delivery')
      || !trip.podReceiverName?.trim() || !trip.podSignatureCaptured || !trip.podReceivedAt || !trip.podPhotoName?.trim())) {
    errors.push('Outbound POD requires a laden delivery, receiver, signature, timestamp and photo.')
  }
  if (errors.length) return { state, errors }
  const nextState = { ...state, trips: state.trips.map((item) => item.id === trip.id ? trip : item) }
  if (!current.outboundOrderId) return { state: nextState, errors: [] }
  const order = state.outboundOrders.find((item) => item.id === current.outboundOrderId && item.jobId === current.jobId)
  if (!order) return { state, errors: ['Outbound trip must reference a delivery order for this job.'] }
  return {
    state: {
      ...nextState,
      outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? {
        ...item,
        status: trip.podStatus === 'received' ? 'delivered' : trip.status === 'completed' ? 'delivered' : trip.status === 'in-progress' ? 'In-Transit' : item.status,
        podStatus: trip.podStatus === 'received' ? 'received' : item.podStatus,
      } : item),
    },
    errors: [],
  }
}

export function validateOutboundOrder(state: AppState, order: OutboundOrder): string[] {
  const errors: string[] = []
  const job = state.jobs.find((item) => item.id === order.jobId)
  const inventory = state.inventory.find((item) => item.id === order.inventoryId)
  if (!job) errors.push('Select an existing Job Number.')
  if (!inventory || inventory.jobId !== order.jobId) errors.push('Inventory must belong to the selected job.')
  if (!order.deliveryOrderNumber.trim()) errors.push('A delivery order number is required.')
  if (!Number.isFinite(order.quantity) || order.quantity <= 0 || (order.unit !== 'CBM' && !Number.isInteger(order.quantity))) errors.push('Enter a positive quantity; carton and pallet quantities must be whole numbers.')
  if (!dateOnly(order.deliveryDate ?? '')) errors.push('Enter a valid required delivery date.')
  if (order.containerId && !state.containers.some((container) => container.id === order.containerId && container.jobId === order.jobId)) errors.push('The selected container must belong to the selected job.')
  if (order.shipmentId && !state.shipments.some((shipment) => shipment.id === order.shipmentId && shipment.jobId === order.jobId)) errors.push('The selected shipment must belong to the selected job.')
  if (order.containerId && order.shipmentId && !state.containers.some((container) => container.id === order.containerId && container.shipmentId === order.shipmentId)) errors.push('The selected container must belong to the selected shipment.')
  if (inventory?.containerId && order.containerId !== inventory.containerId) errors.push('The selected container must match the container recorded on this stock.')
  if (inventory?.batchLot && order.batchLot !== inventory.batchLot) errors.push('The selected batch/lot must match the inventory batch/lot.')
  if (state.outboundOrders.some((item) => item.id === order.id || (item.jobId === order.jobId && item.deliveryOrderNumber.toLowerCase() === order.deliveryOrderNumber.trim().toLowerCase()))) errors.push('That delivery order number is already in use for this job.')
  if (inventory && order.quantity > 0) {
    const balance = calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)[order.unit === 'carton' ? 'cartons' : order.unit === 'pallet' ? 'pallets' : 'cbm']
    const reserved = calculateReservedInventory(inventory.id, state.outboundOrders, undefined, order.unit)
    if (order.quantity > balance - reserved) errors.push(`Insufficient unreserved stock: ${Math.max(0, balance - reserved)} ${order.unit} available.`)
  }
  return errors
}

export function applyOutboundCommand(state: AppState, command: OutboundCommand): OutboundMutation {
  const fail = (...errors: string[]) => ({ state, errors: [...new Set(errors.filter(Boolean))] })
  if (command.type === 'create') {
    const errors = validateOutboundOrder(state, command.order)
    if (!uniqueActivity(state, command.activity) || command.activity.entityId !== command.order.id) errors.push('Delivery order activity must link to the new order.')
    if (errors.length) return fail(...errors)
    const nextState: AppState = {
        ...state,
        outboundOrders: [...state.outboundOrders, command.order],
        activity: [...state.activity, command.activity],
      }
    return {
      state: addOrderDocument(nextState, command.order, 'delivery-order', `${command.order.deliveryOrderNumber} delivery order`),
      errors: [],
    }
  }

  if (command.type === 'assign-trip') {
    const order = orderFor(state, command.orderId)
    if (!order) return fail('Delivery order was not found.')
    if (!order.loadingTaskCreatedAt || order.packingStatus !== 'completed') return fail('Complete packing and create the loading task before assigning a trip.')
    if (activeUnverifiedTrip(state, order.id)) return fail('Verify the previous delivery POD before assigning another trip to this order.')
    const errors = validateTripPlan(state, command.trip)
    if (command.trip.jobId !== order.jobId || command.trip.outboundOrderId !== order.id) errors.push('Trip must reference this delivery order and its job.')
    if (command.trip.containerId !== order.containerId || command.trip.shipmentId !== order.shipmentId) errors.push('Trip container and shipment must match the delivery order.')
    if (state.trips.some((trip) => trip.id === command.trip.id || trip.tripNumber.toLowerCase() === command.trip.tripNumber.toLowerCase())) errors.push('Trip ID or trip number already exists.')
    if (!uniqueActivity(state, command.activity) || command.activity.entityId !== order.id) errors.push('Trip assignment activity must reference the delivery order.')
    if (errors.length) return fail(...errors)
    return {
      state: {
        ...state,
        trips: [...state.trips, command.trip],
        outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? {
          ...item,
          assignedTripId: command.trip.id,
          status: order.dispatchedQuantity ? 'loading' : item.status,
          podStatus: order.dispatchedQuantity ? 'pending' : item.podStatus,
        } : item),
        activity: [...state.activity, command.activity],
      },
      errors: [],
    }
  }

  if (command.type === 'verify') {
    const order = orderFor(state, command.orderId)
    const trip = state.trips.find((item) => item.id === command.tripId && item.outboundOrderId === command.orderId && item.jobId === order?.jobId)
    if (!order || !trip) return fail('POD trip must belong to this delivery order and job.')
    if (trip.status !== 'completed' || trip.podStatus !== 'received') return fail('Complete the assigned trip and capture POD before verifying delivery.')
    if (!trip.podReceiverName?.trim() || !trip.podSignatureCaptured || !trip.podReceivedAt || !trip.podPhotoName?.trim()) return fail('POD requires a receiver name, signature, timestamp and delivery photo.')
    if (!state.documents.some((document) => document.category === 'pod' && document.relatedRecordId === trip.id && document.jobId === order.jobId)) return fail('The POD document must be linked to this trip and job.')
    if (!uniqueActivity(state, command.activity) || command.activity.entityId !== order.id) return fail('Verification activity must reference this delivery order.')
    const dispatchedQuantity = order.dispatchedQuantity ?? 0
    const complete = dispatchedQuantity >= order.quantity
    const updatedOrder: OutboundOrder = {
      ...order,
      status: complete ? 'verified' : 'partial',
      podStatus: 'verified',
      deliveryVerifiedAt: command.occurredAt,
      pickingStatus: complete ? 'completed' : 'pending',
      packingStatus: complete ? 'completed' : 'pending',
      loadingStatus: complete ? 'completed' : 'pending',
      loadingTaskCreatedAt: complete ? order.loadingTaskCreatedAt : undefined,
      dispatchStatus: complete ? 'dispatched' : 'partial',
      assignedTripId: complete ? order.assignedTripId : undefined,
    }
    return {
      state: {
        ...state,
        outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? updatedOrder : item),
        trips: state.trips.map((item) => item.id === trip.id ? { ...item, podStatus: 'approved' } : item),
        activity: [...state.activity, command.activity],
      },
      errors: [],
    }
  }

  const order = orderFor(state, command.orderId)
  if (!order || order.status === 'cancelled' || order.status === 'verified') return fail('This delivery order is not open for further work.')
  if (!uniqueActivity(state, command.activity) || command.activity.entityId !== order.id) return fail('Outbound activity must reference this delivery order.')

  if (command.type === 'create-loading-task') {
    if (order.packingStatus !== 'completed' || (order.packedQuantity ?? 0) <= (order.dispatchedQuantity ?? 0)) return fail('Pack cargo before creating the loading task.')
    if (order.loadingTaskCreatedAt) return fail('A loading task already exists for this delivery order.')
    return {
      state: {
        ...state,
        outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? { ...item, status: 'loading', loadingStatus: 'task-created', loadingTaskCreatedAt: command.occurredAt } : item),
        activity: [...state.activity, command.activity],
      },
      errors: [],
    }
  }

  if (command.type === 'pick') {
    const inventory = state.inventory.find((item) => item.id === order.inventoryId)
    const remaining = order.quantity - (order.pickedQuantity ?? 0)
    const available = inventory && calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)
    const physical = available?.[order.unit === 'carton' ? 'cartons' : order.unit === 'pallet' ? 'pallets' : 'cbm'] ?? 0
    const otherReservations = inventory ? calculateReservedInventory(inventory.id, state.outboundOrders, order.id, order.unit) : 0
    if (!Number.isFinite(command.quantity) || command.quantity <= 0 || (order.unit !== 'CBM' && !Number.isInteger(command.quantity))) return fail('Picked quantity must be positive; cartons and pallets must be whole numbers.')
    if (command.quantity > remaining) return fail(`Picking exceeds the unpicked delivery quantity of ${remaining} ${order.unit}.`)
    if (command.quantity > physical - otherReservations) return fail(`Insufficient unreserved stock: ${Math.max(0, physical - otherReservations)} ${order.unit} available.`)
    if (command.complete && (order.pickedQuantity ?? 0) + command.quantity <= (order.dispatchedQuantity ?? 0)) return fail('Pick at least one undispatched unit before completing the task.')
    const pickedQuantity = (order.pickedQuantity ?? 0) + command.quantity
    const status: NonNullable<OutboundOrder['pickingStatus']> = command.complete ? (command.discrepancyNote?.trim() ? 'discrepancy' : 'completed') : 'in-progress'
    const nextOrder = {
      ...order,
      status: 'picking' as const,
      pickedQuantity,
      pickingStatus: status,
      discrepancyNote: command.discrepancyNote?.trim() || order.discrepancyNote,
    }
    const movement = transaction(order, command.transactionId, 'picking', command.quantity, command.occurredAt, `${order.deliveryOrderNumber}-PICK-${pickedQuantity}`, command.discrepancyNote?.trim() || 'Picking task quantity recorded')
    if (state.warehouseTransactions.some((item) => item.id === movement.id || item.reference === movement.reference)) return fail('This picking movement was already recorded.')
    return { state: { ...state, outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? nextOrder : item), warehouseTransactions: [...state.warehouseTransactions, movement], activity: [...state.activity, command.activity] }, errors: [] }
  }

  if (command.type === 'pack') {
    const picked = order.pickedQuantity ?? 0
    const packed = order.packedQuantity ?? 0
    const quantity = picked - packed
    if (order.pickingStatus !== 'completed' && order.pickingStatus !== 'discrepancy') return fail('Complete the picking task before packing.')
    if (quantity <= 0 || !command.labelReference.trim()) return fail('A positive picked quantity and packing label are required.')
    const movement = transaction(order, command.transactionId, 'packing', quantity, command.occurredAt, command.labelReference.trim(), 'Cargo packed and labelled')
    if (state.warehouseTransactions.some((item) => item.id === movement.id || item.reference === movement.reference)) return fail('This packing label was already recorded.')
    const nextState: AppState = {
        ...state,
        outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? { ...item, status: 'packed', packedQuantity: packed + quantity, packingStatus: 'completed', labelReference: command.labelReference.trim() } : item),
        warehouseTransactions: [...state.warehouseTransactions, movement],
        activity: [...state.activity, command.activity],
      }
    return {
      state: addOrderDocument(
        addOrderDocument(nextState, order, 'packing-list', `${order.deliveryOrderNumber} packing list`),
        order,
        'label',
        `${command.labelReference.trim()} cargo label`,
      ),
      errors: [],
    }
  }

  if (command.type === 'load') {
    const trip = state.trips.find((item) => item.id === order.assignedTripId)
    const availableToLoad = (order.packedQuantity ?? 0) - (order.dispatchedQuantity ?? 0) - ((order.loadedQuantity ?? 0) - (order.dispatchedQuantity ?? 0))
    if (order.loadingStatus !== 'task-created' || !trip || trip.outboundOrderId !== order.id) return fail('Create the loading task and assign its trip before confirming loaded quantities.')
    if (!Number.isFinite(command.quantity) || command.quantity <= 0 || (order.unit !== 'CBM' && !Number.isInteger(command.quantity))) return fail('Loaded quantity must be positive; cartons and pallets must be whole numbers.')
    if (command.quantity > availableToLoad) return fail(`Loaded quantity exceeds the packed, undispatched amount of ${Math.max(0, availableToLoad)} ${order.unit}.`)
    const movement = transaction(order, command.transactionId, 'loading', command.quantity, command.occurredAt, `${trip.tripNumber}-LOAD`, 'Actual loaded quantity confirmed')
    if (state.warehouseTransactions.some((item) => item.id === movement.id || item.reference === movement.reference)) return fail('Actual loaded quantity was already confirmed for this trip.')
    return {
      state: {
        ...state,
        outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? { ...item, status: 'loaded', loadedQuantity: (item.loadedQuantity ?? 0) + command.quantity, loadingStatus: 'completed' } : item),
        trips: state.trips.map((item) => item.id === trip.id ? { ...item, outboundQuantity: command.quantity } : item),
        warehouseTransactions: [...state.warehouseTransactions, movement],
        activity: [...state.activity, command.activity],
      },
      errors: [],
    }
  }

  const trip = state.trips.find((item) => item.id === command.tripId && item.outboundOrderId === order.id && item.jobId === order.jobId)
  if (!trip || order.loadingStatus !== 'completed' || !trip.outboundQuantity || trip.outboundQuantity > (order.loadedQuantity ?? 0) - (order.dispatchedQuantity ?? 0)) return fail('Dispatch must reference this order’s assigned trip and a confirmed, undispatched load.')
  const movement = transaction(order, command.transactionId, 'dispatch', trip.outboundQuantity, command.occurredAt, `${trip.tripNumber}-DISPATCH`, 'Dispatched to the assigned driver')
  if (state.warehouseTransactions.some((item) => item.id === movement.id || item.reference === movement.reference)) return fail('This trip has already been dispatched.')
  const inventory = state.inventory.find((item) => item.id === order.inventoryId)
  const physical = inventory && calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)
  const available = physical?.[order.unit === 'carton' ? 'cartons' : order.unit === 'pallet' ? 'pallets' : 'cbm'] ?? 0
  if (trip.outboundQuantity > available) return fail(`Dispatch exceeds physical available stock of ${available} ${order.unit}.`)
  const dispatchedQuantity = (order.dispatchedQuantity ?? 0) + trip.outboundQuantity
  if (dispatchedQuantity > order.quantity) return fail('Dispatch exceeds the delivery order quantity.')
  return {
    state: {
      ...state,
      outboundOrders: state.outboundOrders.map((item) => item.id === order.id ? {
        ...item,
        status: dispatchedQuantity === order.quantity ? 'dispatched' : 'partial',
        dispatchedQuantity,
        dispatchStatus: dispatchedQuantity === order.quantity ? 'dispatched' : 'partial',
        podStatus: 'pending',
        dispatchedAt: command.occurredAt,
        transactionId: movement.id,
      } : item),
      warehouseTransactions: [...state.warehouseTransactions, movement],
      activity: [...state.activity, command.activity],
    },
    errors: [],
  }
}
