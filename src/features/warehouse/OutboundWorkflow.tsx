import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DataTable, FormField, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateAvailableInventory, calculateReservedInventory } from '../../domain/calculations.ts'
import { applyOutboundCommand, type OutboundCommand } from '../../domain/outboundWorkflow.ts'
import type { OutboundOrder, Trip } from '../../domain/types.ts'
import { generateRecordId } from '../../services/mockDataService.ts'
import { useAppState } from '../../state/AppContext.tsx'

const formatQuantity = (value: number) => value.toLocaleString('en-MY', { maximumFractionDigits: 3 })
const unitBalance = (order: Pick<OutboundOrder, 'unit'>, balance: { cartons: number; pallets: number; cbm: number }) =>
  order.unit === 'carton' ? balance.cartons : order.unit === 'pallet' ? balance.pallets : balance.cbm

export function OutboundWorkflow({ initialJobId }: { initialJobId?: string }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const firstInventory = state.inventory.find((item) => !initialJobId || item.jobId === initialJobId)
  const [selectedJobId, setSelectedJobId] = useState(initialJobId ?? firstInventory?.jobId ?? state.jobs[0]?.id ?? '')
  const [inventoryId, setInventoryId] = useState(firstInventory?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState<OutboundOrder['unit']>('carton')
  const [batchLot, setBatchLot] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(state.demoDate)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [pickQuantity, setPickQuantity] = useState(1)
  const [discrepancy, setDiscrepancy] = useState('')
  const [labelReference, setLabelReference] = useState('')
  const [loadQuantity, setLoadQuantity] = useState(1)
  const [driverId, setDriverId] = useState(state.drivers.find((driver) => driver.status !== 'off-duty')?.id ?? '')
  const [truckId, setTruckId] = useState(state.trucks.find((truck) => truck.status !== 'maintenance')?.id ?? '')
  const [trailerId, setTrailerId] = useState(state.trailers.find((trailer) => trailer.status !== 'maintenance')?.id ?? '')
  const [deliveryLocation, setDeliveryLocation] = useState('Customer delivery')

  const availableInventory = useMemo(() => state.inventory.filter((item) => item.jobId === selectedJobId), [state.inventory, selectedJobId])
  const selectedOrder = state.outboundOrders.find((order) => order.id === selectedOrderId)
  const plannedDate = selectedOrder?.deliveryDate ?? deliveryDate
  const availableDrivers = useMemo(() => state.drivers.filter((driver) =>
    driver.status !== 'off-duty' && (!driver.licenceExpiry || driver.licenceExpiry >= plannedDate)), [state.drivers, plannedDate])
  const availableTrucks = useMemo(() => state.trucks.filter((truck) =>
    truck.status !== 'maintenance'
    && (!truck.documentExpiry || truck.documentExpiry >= plannedDate)
    && (!truck.roadTaxExpiry || truck.roadTaxExpiry >= plannedDate)
    && (!truck.insuranceExpiry || truck.insuranceExpiry >= plannedDate)), [state.trucks, plannedDate])
  const availableTrailers = useMemo(() => state.trailers.filter((trailer) =>
    trailer.status !== 'maintenance' && trailer.documentStatus !== 'expired' && trailer.documentStatus !== 'missing'
    && (!trailer.documentExpiry || trailer.documentExpiry >= plannedDate)), [state.trailers, plannedDate])
  useEffect(() => {
    if (!initialJobId) return
    const inventory = state.inventory.find((item) => item.jobId === initialJobId)
    setSelectedJobId(initialJobId)
    setInventoryId(inventory?.id ?? '')
    setBatchLot(inventory?.batchLot ?? '')
  }, [initialJobId, state.inventory])
  useEffect(() => {
    if (!availableDrivers.some((driver) => driver.id === driverId)) setDriverId(availableDrivers[0]?.id ?? '')
    if (!availableTrucks.some((truck) => truck.id === truckId)) setTruckId(availableTrucks[0]?.id ?? '')
    if (!availableTrailers.some((trailer) => trailer.id === trailerId)) setTrailerId(availableTrailers[0]?.id ?? '')
  }, [availableDrivers, availableTrailers, availableTrucks, driverId, trailerId, truckId])
  const selectedInventory = state.inventory.find((item) => item.id === inventoryId && item.jobId === selectedJobId)
  const orderInventory = selectedOrder && state.inventory.find((item) => item.id === selectedOrder.inventoryId)
  const orderTrips = selectedOrder ? state.trips.filter((trip) => trip.outboundOrderId === selectedOrder.id).sort((a, b) => a.tripNumber.localeCompare(b.tripNumber)) : []
  const assignedTrip = selectedOrder && state.trips.find((trip) => trip.id === selectedOrder.assignedTripId)
  const dispatchTrip = selectedOrder && assignedTrip && state.warehouseTransactions.some((transaction) => transaction.reference === `${assignedTrip.tripNumber}-DISPATCH`)
  const remainingQuantity = selectedOrder ? Math.max(0, selectedOrder.quantity - (selectedOrder.dispatchedQuantity ?? 0)) : 0
  const nextPickable = selectedOrder ? Math.max(0, selectedOrder.quantity - (selectedOrder.pickedQuantity ?? 0)) : 0
  const nextPackable = selectedOrder ? Math.max(0, (selectedOrder.pickedQuantity ?? 0) - (selectedOrder.packedQuantity ?? 0)) : 0
  const nextLoadable = selectedOrder ? Math.max(0, (selectedOrder.packedQuantity ?? 0) - (selectedOrder.loadedQuantity ?? 0)) : 0

  const activityFor = (order: OutboundOrder, action: string) => ({
    id: generateRecordId(state, 'activity'),
    entityType: 'outbound-order',
    entityId: order.id,
    action,
    actor: 'Warehouse operations',
    occurredAt: `${state.demoDate}T09:00:00Z`,
  })

  const run = (command: OutboundCommand, success: string) => {
    const result = applyOutboundCommand(state, command)
    if (result.errors.length) {
      showToast(result.errors.join(' '))
      return false
    }
    dispatch({ type: 'outbound-command', command })
    showToast(success)
    return true
  }

  const createOrder = () => {
    const inventory = state.inventory.find((item) => item.id === inventoryId && item.jobId === selectedJobId)
    if (!inventory) {
      showToast('Select stock belonging to the selected job.')
      return
    }
    const linkedContainer = state.containers.find((container) => container.id === inventory.containerId)
    const jobShipment = state.shipments.find((shipment) => shipment.id === linkedContainer?.shipmentId)
      ?? state.shipments.find((shipment) => shipment.jobId === selectedJobId)
    const orderNumber = `DO-${state.demoDate.replaceAll('-', '').slice(2)}-${String(state.outboundOrders.length + 1).padStart(3, '0')}`
    const order: OutboundOrder = {
      id: generateRecordId(state, 'outboundOrders'),
      jobId: selectedJobId,
      inventoryId: inventory.id,
      deliveryOrderNumber: orderNumber,
      quantity,
      unit,
      status: 'open',
      createdAt: state.demoDate,
      deliveryDate,
      batchLot: batchLot.trim() || undefined,
      shipmentId: jobShipment?.id,
      containerId: inventory.containerId,
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
    const created = run({ type: 'create', order, activity: activityFor(order, `Delivery order created · ${quantity} ${unit} reserved`) }, `${orderNumber} created and stock reserved.`)
    if (created) {
      setSelectedOrderId(order.id)
      setPickQuantity(quantity)
      setLabelReference(`LBL-${order.deliveryOrderNumber}-01`)
      setLoadQuantity(quantity)
    }
  }

  const pick = (complete: boolean) => {
    if (!selectedOrder) return
    run({
      type: 'pick',
      orderId: selectedOrder.id,
      quantity: pickQuantity,
      complete,
      discrepancyNote: discrepancy,
      transactionId: generateRecordId(state, 'warehouseTransactions'),
      occurredAt: state.demoDate,
      activity: activityFor(selectedOrder, `${complete ? 'Picking task completed' : 'Picking quantity recorded'} · ${pickQuantity} ${selectedOrder.unit}${discrepancy.trim() ? ` · ${discrepancy.trim()}` : ''}`),
    }, complete ? 'Picking completed.' : 'Picked quantity recorded.')
  }

  const pack = () => {
    if (!selectedOrder) return
    run({
      type: 'pack',
      orderId: selectedOrder.id,
      labelReference: labelReference.trim(),
      transactionId: generateRecordId(state, 'warehouseTransactions'),
      occurredAt: state.demoDate,
      activity: activityFor(selectedOrder, `Cargo packed and labelled · ${labelReference.trim()}`),
    }, 'Packing and label recorded.')
  }

  const createLoadingTask = () => {
    if (!selectedOrder) return
    run({
      type: 'create-loading-task',
      orderId: selectedOrder.id,
      occurredAt: state.demoDate,
      activity: activityFor(selectedOrder, 'Loading task created'),
    }, 'Loading task created.')
  }

  const assignTrip = () => {
    if (!selectedOrder || !orderInventory) return
    const tripId = generateRecordId(state, 'trips')
    const tripNumber = `TR-${selectedOrder.deliveryOrderNumber}-${String(state.trips.length + 1).padStart(2, '0')}`
    const trip: Trip = {
      id: tripId,
      tripNumber,
      jobId: selectedOrder.jobId,
      driverId,
      truckId,
      trailerId,
      shipmentId: selectedOrder.shipmentId,
      containerId: selectedOrder.containerId,
      outboundOrderId: selectedOrder.id,
      outboundQuantity: Math.max(0, (selectedOrder.packedQuantity ?? 0) - (selectedOrder.dispatchedQuantity ?? 0)),
      tripType: 'warehouse-delivery',
      pickup: `Warehouse · ${orderInventory.bin}`,
      delivery: deliveryLocation.trim(),
      plannedPickup: `${selectedOrder.deliveryDate ?? state.demoDate}T09:00:00.000Z`,
      plannedDelivery: `${selectedOrder.deliveryDate ?? state.demoDate}T17:00:00.000Z`,
      status: 'assigned',
      billingAmount: 0,
      truckingCost: 0,
      tollCost: 0,
      otherCost: 0,
      milestones: ['Outbound loading assignment'],
      podStatus: 'pending',
      subcontractor: false,
    }
    run({
      type: 'assign-trip',
      orderId: selectedOrder.id,
      trip,
      activity: activityFor(selectedOrder, `Assigned ${trip.tripNumber} to ${state.drivers.find((driver) => driver.id === driverId)?.name ?? 'driver'}`),
    }, `${trip.tripNumber} assigned to the outbound order.`)
  }

  const load = () => {
    if (!selectedOrder) return
    run({
      type: 'load',
      orderId: selectedOrder.id,
      quantity: loadQuantity,
      transactionId: generateRecordId(state, 'warehouseTransactions'),
      occurredAt: state.demoDate,
      activity: activityFor(selectedOrder, `Actual loaded quantity confirmed · ${loadQuantity} ${selectedOrder.unit}`),
    }, 'Actual loaded quantity confirmed.')
  }

  const dispatchOrder = () => {
    if (!selectedOrder || !assignedTrip) return
    run({
      type: 'dispatch',
      orderId: selectedOrder.id,
      tripId: assignedTrip.id,
      transactionId: generateRecordId(state, 'warehouseTransactions'),
      occurredAt: state.demoDate,
      activity: activityFor(selectedOrder, `Dispatched ${assignedTrip.outboundQuantity ?? 0} ${selectedOrder.unit} on ${assignedTrip.tripNumber}`),
    }, `Dispatched to ${state.drivers.find((driver) => driver.id === assignedTrip.driverId)?.name ?? 'assigned driver'}.`)
  }

  const verify = (tripId: string) => {
    if (!selectedOrder) return
    const verified = run({
      type: 'verify',
      orderId: selectedOrder.id,
      tripId,
      occurredAt: `${state.demoDate}T17:00:00Z`,
      activity: activityFor(selectedOrder, `Delivery verified for ${state.trips.find((trip) => trip.id === tripId)?.tripNumber ?? tripId}`),
    }, 'POD verified. Eligible handling, storage and delivery charges are now available in billing.')
    if (verified && remainingQuantity > 0) {
      setPickQuantity(remainingQuantity)
      setLabelReference(`LBL-${selectedOrder.deliveryOrderNumber}-${orderTrips.length + 1}`)
    }
  }

  const selectedBalance = selectedInventory
    ? calculateAvailableInventory(selectedInventory, state.warehouseTransactions, state.inventory)
    : undefined
  const reservation = selectedInventory ? calculateReservedInventory(selectedInventory.id, state.outboundOrders, undefined, unit) : 0
  const availableToReserve = selectedBalance ? Math.max(0, unitBalance({ unit }, selectedBalance) - reservation) : 0
  const orders = state.outboundOrders
    .filter((order) => order.jobId === selectedJobId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return <div className="content-grid content-grid--wide">
    <Card>
      <div className="section-heading">
        <div><p className="eyebrow">Create and reserve</p><h2>New delivery order</h2></div>
        <StatusBadge tone="info">Job Number linked</StatusBadge>
      </div>
      <div className="form-grid form-grid--three">
        <FormField label="Job Number">
          <select value={selectedJobId} onChange={(event) => {
            const nextJob = event.target.value
            const nextInventory = state.inventory.find((item) => item.jobId === nextJob)
            setSelectedJobId(nextJob)
            setInventoryId(nextInventory?.id ?? '')
            setBatchLot(nextInventory?.batchLot ?? '')
          }}>
            {state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}
          </select>
        </FormField>
        <FormField label="Stock / SKU">
          <select value={inventoryId} onChange={(event) => {
            const item = availableInventory.find((candidate) => candidate.id === event.target.value)
            setInventoryId(event.target.value)
            setBatchLot(item?.batchLot ?? '')
          }}>
            <option value="">Select eligible stock</option>
            {availableInventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.description}</option>)}
          </select>
        </FormField>
        <FormField label="Batch / lot">
          <input value={batchLot} onChange={(event) => setBatchLot(event.target.value)} placeholder="Stock batch/lot" />
        </FormField>
        <FormField label="Quantity">
          <input min="0.001" step={unit === 'CBM' ? '0.001' : '1'} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
        </FormField>
        <FormField label="Unit">
          <select value={unit} onChange={(event) => setUnit(event.target.value as OutboundOrder['unit'])}>
            <option value="carton">Carton</option><option value="pallet">Pallet</option><option value="CBM">CBM</option>
          </select>
        </FormField>
        <FormField label="Required delivery date">
          <input type="date" min={state.demoDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
        </FormField>
      </div>
      {selectedBalance && selectedInventory && <div className="detail-grid">
        <span>Physical stock<strong>{formatQuantity(unitBalance({ unit }, selectedBalance))} {unit}</strong></span>
        <span>Reserved for open orders<strong>{formatQuantity(reservation)} {unit}</strong></span>
        <span>Available to reserve<strong>{formatQuantity(availableToReserve)} {unit}</strong></span>
        <span>Related container<strong>{state.containers.find((item) => item.id === selectedInventory.containerId)?.containerNumber ?? 'Not linked'}</strong></span>
      </div>}
      <p className="form-hint">Reservations do not reduce physical stock. Stock leaves inventory only when a dispatched trip is confirmed.</p>
      <div className="form-actions"><Button disabled={!selectedInventory} onClick={createOrder}>Create delivery order & reserve</Button></div>
    </Card>

    <Card>
      <div className="section-heading">
        <div><p className="eyebrow">Outbound queue</p><h2>Delivery orders</h2></div>
        <StatusBadge tone="info">{orders.length} orders</StatusBadge>
      </div>
      {orders.length ? <DataTable headers={['Delivery order', 'SKU / batch', 'Requested', 'Picked', 'Dispatched', 'Remaining', 'Required date', 'Status', 'Action']} rows={orders.map((order) => {
        const inventory = state.inventory.find((item) => item.id === order.inventoryId)
        const remaining = Math.max(0, order.quantity - (order.dispatchedQuantity ?? (order.status === 'dispatched' ? order.quantity : 0)))
        return [
          order.deliveryOrderNumber,
          `${inventory?.sku ?? 'Unknown'}${order.batchLot ? ` · ${order.batchLot}` : ''}`,
          `${formatQuantity(order.quantity)} ${order.unit}`,
          `${formatQuantity(order.pickedQuantity ?? 0)} ${order.unit}`,
          `${formatQuantity(order.dispatchedQuantity ?? (order.status === 'dispatched' ? order.quantity : 0))} ${order.unit}`,
          `${formatQuantity(remaining)} ${order.unit}`,
          order.deliveryDate ?? '—',
          <StatusBadge tone={order.status === 'verified' ? 'success' : order.status === 'cancelled' ? 'danger' : order.status === 'partial' ? 'warning' : 'info'}>{order.status}</StatusBadge>,
          <Button variant="ghost" onClick={() => {
            setSelectedOrderId(order.id)
            setPickQuantity(Math.max(1, order.quantity - (order.pickedQuantity ?? 0)))
            setLoadQuantity(Math.max(1, (order.packedQuantity ?? 0) - (order.loadedQuantity ?? 0)))
            setLabelReference(`LBL-${order.deliveryOrderNumber}-${state.trips.filter((trip) => trip.outboundOrderId === order.id).length + 1}`)
          }}>Manage</Button>,
        ]
      })} /> : <p className="empty-state">No outbound delivery orders for this job yet.</p>}
    </Card>

    {selectedOrder && <Card>
      <div className="section-heading">
        <div><p className="eyebrow">Warehouse execution · {selectedOrder.deliveryOrderNumber}</p><h2>{state.jobs.find((job) => job.id === selectedOrder.jobId)?.jobNumber} · {orderInventory?.sku}</h2></div>
        <StatusBadge tone={selectedOrder.status === 'verified' ? 'success' : selectedOrder.status === 'partial' ? 'warning' : 'info'}>{selectedOrder.status}</StatusBadge>
      </div>
      <div className="detail-grid">
        <span>Picking<strong>{selectedOrder.pickingStatus ?? 'pending'} · {formatQuantity(selectedOrder.pickedQuantity ?? 0)} / {selectedOrder.quantity} {selectedOrder.unit}</strong></span>
        <span>Packing & labels<strong>{selectedOrder.packingStatus ?? 'pending'} · {selectedOrder.labelReference ?? 'Not labelled'}</strong></span>
        <span>Loading task<strong>{selectedOrder.loadingStatus ?? 'pending'}</strong></span>
        <span>Dispatch<strong>{selectedOrder.dispatchStatus ?? (selectedOrder.status === 'dispatched' ? 'dispatched' : 'pending')} · {formatQuantity(selectedOrder.dispatchedQuantity ?? 0)} / {selectedOrder.quantity} {selectedOrder.unit}</strong></span>
        <span>POD<strong>{selectedOrder.podStatus ?? 'pending'}</strong></span>
        <span>Reserved remainder<strong>{formatQuantity(remainingQuantity)} {selectedOrder.unit}</strong></span>
      </div>
      {orderInventory && remainingQuantity > 0 && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'verified' && <>
        <div className="form-grid form-grid--three">
          <FormField label={`Pick quantity (${selectedOrder.unit})`}>
            <input min="0.001" step={selectedOrder.unit === 'CBM' ? '0.001' : '1'} type="number" value={pickQuantity} onChange={(event) => setPickQuantity(Number(event.target.value))} />
          </FormField>
          <FormField label="Picking discrepancy (optional)">
            <input value={discrepancy} onChange={(event) => setDiscrepancy(event.target.value)} placeholder="Short, damaged or substituted stock" />
          </FormField>
          <div className="form-actions form-actions--bottom">
            <Button variant="secondary" disabled={nextPickable <= 0} onClick={() => pick(false)}>Record picked qty</Button>
            <Button disabled={nextPickable <= 0} onClick={() => pick(true)}>Complete picking</Button>
          </div>
          <FormField label="Pack label reference">
            <input value={labelReference} onChange={(event) => setLabelReference(event.target.value)} />
          </FormField>
          <div className="form-actions form-actions--bottom">
            <Button disabled={nextPackable <= 0 || !['completed', 'discrepancy'].includes(selectedOrder.pickingStatus ?? '')} onClick={pack}>Pack & label {formatQuantity(nextPackable)} {selectedOrder.unit}</Button>
          </div>
          <div className="form-actions form-actions--bottom">
            <Button variant="secondary" disabled={selectedOrder.packingStatus !== 'completed' || Boolean(selectedOrder.loadingTaskCreatedAt)} onClick={createLoadingTask}>Create loading task</Button>
          </div>
        </div>
        {selectedOrder.loadingTaskCreatedAt && <>
          <div className="form-grid form-grid--three">
            <FormField label="Driver">
              <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select>
            </FormField>
            <FormField label="Truck">
              <select value={truckId} onChange={(event) => setTruckId(event.target.value)}>{availableTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber}</option>)}</select>
            </FormField>
            <FormField label="Trailer">
              <select value={trailerId} onChange={(event) => setTrailerId(event.target.value)}>{availableTrailers.map((trailer) => <option key={trailer.id} value={trailer.id}>{trailer.registrationNumber}</option>)}</select>
            </FormField>
            <FormField label="Delivery location">
              <input value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.target.value)} />
            </FormField>
          </div>
          <div className="form-actions">
            <Button disabled={Boolean(assignedTrip)} onClick={assignTrip}>Assign truck, trailer, driver & trip</Button>
          </div>
        </>}
        {assignedTrip && <div className="content-grid content-grid--wide">
          <Card className="workflow-callout">
            <div><strong>Loading · {assignedTrip.tripNumber}</strong><p>{assignedTrip.pickup} → {assignedTrip.delivery} · Driver: {state.drivers.find((driver) => driver.id === assignedTrip.driverId)?.name ?? 'Unassigned'}</p></div>
            <StatusBadge tone={dispatchTrip ? 'success' : 'info'}>{dispatchTrip ? 'Dispatched' : assignedTrip.status}</StatusBadge>
          </Card>
          {!dispatchTrip && <div className="form-grid form-grid--three">
            <FormField label={`Actual loaded quantity (${selectedOrder.unit})`}>
              <input min="0.001" max={nextLoadable} step={selectedOrder.unit === 'CBM' ? '0.001' : '1'} type="number" value={loadQuantity} onChange={(event) => setLoadQuantity(Number(event.target.value))} />
            </FormField>
            <div className="form-actions form-actions--bottom"><Button disabled={nextLoadable <= 0} onClick={load}>Confirm actual loaded quantity</Button></div>
            <div className="form-actions form-actions--bottom"><Button disabled={selectedOrder.loadingStatus !== 'completed'} onClick={dispatchOrder}>Dispatch delivery</Button></div>
          </div>}
        </div>}
      </>}
      {orderTrips.length > 0 && <div className="section-heading"><div><p className="eyebrow">Trip assignment & POD</p><h3>Linked driver trips</h3></div><StatusBadge tone="info">{orderTrips.length} trip(s)</StatusBadge></div>}
      {orderTrips.length > 0 && <DataTable headers={['Trip', 'Driver', 'Quantity', 'Trip status', 'POD', 'Action']} rows={orderTrips.map((trip) => [
        trip.tripNumber,
        state.drivers.find((driver) => driver.id === trip.driverId)?.name ?? 'Unassigned',
        `${formatQuantity(trip.outboundQuantity ?? 0)} ${selectedOrder.unit}`,
        <StatusBadge tone={trip.status === 'completed' ? 'success' : 'info'}>{trip.status}</StatusBadge>,
        <StatusBadge tone={trip.podStatus === 'approved' ? 'success' : trip.podStatus === 'received' ? 'warning' : 'neutral'}>{trip.podStatus ?? 'pending'}</StatusBadge>,
        trip.podStatus === 'received' ? <Button onClick={() => verify(trip.id)}>Verify delivery</Button> : trip.podStatus === 'approved' ? 'Verified' : 'Driver App',
      ])} />}
      {selectedOrder.discrepancyNote && <p className="form-hint">Picking discrepancy: {selectedOrder.discrepancyNote}</p>}
      <div className="form-actions"><Button variant="secondary" onClick={() => setSelectedOrderId('')}>Close order detail</Button></div>
    </Card>}
  </div>
}
