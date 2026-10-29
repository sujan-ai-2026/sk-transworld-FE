import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { Button, Card, FormField, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { useConfirmation } from '../../../components/useConfirmation.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { applyOutboundTripUpdate } from '../../domain/outboundWorkflow.ts'
import { applyDriverMilestone, estimateExpense, getDriverWorkflow, getNextDriverStep, isDriverMilestoneComplete, recordDriverPod, validateDriverExpense } from '../../domain/driverWorkflow.ts'
import type { Trip, TripExpense, TripExpenseCategory } from '../../domain/types.ts'
import { generateRecordId } from '../../services/mockDataService.ts'

const expenseCategories: TripExpenseCategory[] = ['toll', 'fuel', 'parking', 'port charges', 'waiting', 'detention', 'driver allowance', 'other']
const nowForDemo = (date: string) => `${date}T${new Date().toISOString().slice(11, 19)}Z`
const amountLabel = (amount: number) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function DriverApp({ navigate }: { navigate: (path: string) => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const confirm = useConfirmation()
  const driverId = state.drivers[0]?.id ?? ''
  const [selectedTripId, setSelectedTripId] = useState('')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState<TripExpenseCategory>('toll')
  const [expenseAmount, setExpenseAmount] = useState(0)
  const [expenseDescription, setExpenseDescription] = useState('')
  const [photo, setPhoto] = useState<File | undefined>()
  const [photoPreview, setPhotoPreview] = useState('')
  const [receipt, setReceipt] = useState<File | undefined>()
  const [receiptPreview, setReceiptPreview] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [podRemarks, setPodRemarks] = useState('')
  const [signatureCaptured, setSignatureCaptured] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const driver = state.drivers.find((item) => item.id === driverId)
  const trips = state.trips.filter((trip) => trip.driverId === driverId && trip.status !== 'cancelled')
  const selected = trips.find((trip) => trip.id === selectedTripId)
  const job = selected && state.jobs.find((item) => item.id === selected.jobId)
  const outboundOrder = selected?.outboundOrderId
    ? state.outboundOrders.find((item) => item.id === selected.outboundOrderId && item.jobId === selected.jobId)
    : undefined
  const container = selected && (state.containers.find((item) => item.id === selected.containerId) ?? state.containers.find((item) => item.jobId === selected.jobId))
  const activeTrips = trips.filter((trip) => ['planned', 'assigned', 'in-progress'].includes(trip.status)).length
  const tripStages = selected ? getDriverWorkflow(selected) : []
  const nextStage = selected ? getNextDriverStep(selected) : undefined
  const selectedExpenses = selected ? state.tripExpenses.filter((expense) => expense.tripId === selected.id) : []
  const actualExpenseTotal = selectedExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return }
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  useEffect(() => {
    if (!receipt) { setReceiptPreview(''); return }
    const url = URL.createObjectURL(receipt)
    setReceiptPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [receipt])

  const selectTrip = (trip?: Trip) => {
    setSelectedTripId(trip?.id ?? '')
    setPhoto(undefined)
    setReceipt(undefined)
    setExpenseOpen(false)
    setExpenseCategory('toll')
    setExpenseAmount(0)
    setExpenseDescription('')
    setReceiverName('')
    setPodRemarks('')
    setSignatureCaptured(false)
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  const updateTrip = async (milestoneKey: NonNullable<Trip['driverMilestones']>[number]['key']) => {
    if (!selected || selected.driverId !== driverId) return
    const result = applyDriverMilestone(selected, driverId, milestoneKey, nowForDemo(state.demoDate))
    if (result.errors.length || !result.trip) {
      showToast(result.errors.join(' ') || 'Trip milestone could not be updated.')
      return
    }
    const updated = result.trip
    const validation = applyOutboundTripUpdate(state, updated)
    if (validation.errors.length) {
      showToast(validation.errors.join(' '))
      return
    }
    const confirmed = await confirm({ title: 'Confirm milestone update', message: `Record ${updated.driverMilestones?.at(-1)?.label} for ${selected.tripNumber}?`, confirmLabel: 'Confirm update' }, () => undefined)
    if (!confirmed) return
    dispatch({ type: 'update-trip', trip: updated })
    const currentStage = updated.driverMilestones?.at(-1)
    if (currentStage?.key === 'laden-delivery' && container) {
      dispatch({ type: 'update-container', container: { ...container, movementStatus: 'delivered' } })
    }
    if (currentStage?.key === 'return-empty' && container) {
      dispatch({ type: 'update-container', container: { ...container, movementStatus: 'empty-returned' } })
    }
    const customerVisible = currentStage?.key === 'laden-delivery'
    const shipment = selected.shipmentId
      ? state.shipments.find((item) => item.id === selected.shipmentId && item.jobId === selected.jobId)
      : state.shipments.find((item) => item.jobId === selected.jobId)
    if (shipment && customerVisible) {
      dispatch({ type: 'update-shipment', shipment: { ...shipment, status: 'In-Transit' } })
      dispatch({ type: 'add-shipment-milestone', milestone: {
        id: generateRecordId(state, 'shipmentMilestones'),
        shipmentId: shipment.id,
        jobId: selected.jobId,
        title: `Trip ${selected.tripNumber} · ${currentStage.label}`,
        occurredAt: currentStage.occurredAt,
        source: 'driver',
        sourceRecordId: selected.id,
        customerVisible: true,
      } })
    }
    dispatch({ type: 'add-activity', activity: {
      id: generateRecordId(state, 'activity'),
      entityType: 'trip',
      entityId: selected.id,
      action: `Driver recorded ${currentStage?.label ?? milestoneKey}`,
      actor: driver?.name ?? 'Driver',
      occurredAt: currentStage?.occurredAt ?? state.demoDate,
    } })
    showToast(`${currentStage?.label ?? 'Trip milestone'} recorded.`)
  }

  const submitExpense = async () => {
    if (!selected) {
      showToast('Select an assigned trip before submitting an expense.')
      return
    }
    const errors = validateDriverExpense(selected, driverId, expenseCategory, expenseDescription, expenseAmount)
    if (errors.length) {
      showToast(errors.join(' '))
      return
    }
    const confirmed = await confirm({ title: 'Submit trip expense', message: `Submit RM ${expenseAmount.toLocaleString('en-MY')} as ${expenseCategory}?`, confirmLabel: 'Submit expense' }, () => undefined)
    if (!confirmed) return
    const submittedAt = nowForDemo(state.demoDate)
    const expense: TripExpense = {
      id: generateRecordId(state, 'tripExpenses'),
      tripId: selected.id,
      jobId: selected.jobId,
      description: expenseDescription.trim(),
      category: expenseCategory,
      amount: expenseAmount,
      status: 'submitted',
      submittedAt,
      receiptName: receipt?.name,
      receiptSizeBytes: receipt?.size,
      receiptMimeType: receipt?.type,
    }
    dispatch({ type: 'add-trip-expense', expense })
    if (receipt) dispatch({ type: 'add-document', document: {
      id: generateRecordId(state, 'documents'),
      jobId: selected.jobId,
      name: receipt.name,
      category: 'receipt',
      status: 'pending-review',
      uploadedAt: state.demoDate,
      sizeBytes: receipt.size,
      mimeType: receipt.type,
      relatedRecordId: expense.id,
      accessRule: 'finance-only',
      previewText: `Trip expense receipt · ${selected.tripNumber} · ${expenseCategory}`,
    } })
    dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'trip', entityId: selected.id, action: `Driver submitted ${expenseCategory} expense · ${amountLabel(expenseAmount)}`, actor: driver?.name ?? 'Driver', occurredAt: submittedAt } })
    showToast('Expense submitted for operations review.')
    setExpenseOpen(false)
    setExpenseAmount(0)
    setExpenseDescription('')
    setReceipt(undefined)
  }

  const savePod = async () => {
    if (!selected) return
    if (selected.driverId !== driverId) {
      showToast('This trip is not assigned to the selected driver.')
      return
    }
    if (selected.status !== 'in-progress' || nextStage?.key !== 'pod') {
      showToast('Start the trip and complete the laden delivery before submitting proof of delivery.')
      return
    }
    if (state.documents.some((item) => item.category === 'pod' && item.relatedRecordId === selected.id)) {
      showToast('A POD is already linked to this trip.')
      return
    }
    if (!receiverName.trim() || !signatureCaptured) {
      showToast('Enter the receiver name and capture their signature before submitting the POD.')
      return
    }
    if (outboundOrder && !photo) {
      showToast('A delivery photo is required for this outbound order.')
      return
    }
    const confirmed = await confirm({ title: 'Submit proof of delivery', message: 'Submit the receiver signature and delivery photo as a POD record?', confirmLabel: 'Submit POD' }, () => undefined)
    if (!confirmed) return
    const podReceivedAt = nowForDemo(state.demoDate)
    const document = {
      id: generateRecordId(state, 'documents'),
      jobId: selected.jobId,
      name: photo?.name ?? `${selected.tripNumber}-signed-pod`,
      category: 'pod' as const,
      status: 'pending-review' as const,
      uploadedAt: state.demoDate,
      sizeBytes: photo?.size,
      mimeType: photo?.type ?? 'image/png',
      relatedRecordId: selected.id,
      accessRule: 'customer-visible' as const,
      previewText: `Receiver: ${receiverName.trim()} · Signed ${podReceivedAt}${podRemarks.trim() ? ` · ${podRemarks.trim()}` : ''}`,
    }
    const withPodDetails = {
      ...selected,
      podReceiverName: receiverName.trim(),
      podSignatureCaptured: signatureCaptured,
      podPhotoName: photo?.name,
      podRemarks: podRemarks.trim(),
    }
    const podResult = recordDriverPod(withPodDetails, driverId, podReceivedAt)
    if (podResult.errors.length || !podResult.trip) {
      showToast(podResult.errors.join(' ') || 'POD could not be recorded.')
      return
    }
    const updatedTrip = podResult.trip
    const validation = applyOutboundTripUpdate(state, updatedTrip)
    if (validation.errors.length) {
      showToast(validation.errors.join(' '))
      return
    }
    dispatch({ type: 'add-document', document })
    dispatch({ type: 'update-trip', trip: updatedTrip })
    const shipment = selected.shipmentId
      ? state.shipments.find((item) => item.id === selected.shipmentId && item.jobId === selected.jobId)
      : state.shipments.find((item) => item.jobId === selected.jobId)
    if (shipment) {
      dispatch({ type: 'update-shipment', shipment: { ...shipment, status: 'delivered' } })
      dispatch({ type: 'add-shipment-milestone', milestone: {
        id: generateRecordId(state, 'shipmentMilestones'),
        shipmentId: shipment.id,
        jobId: selected.jobId,
        title: 'Proof of delivery received',
        occurredAt: podReceivedAt,
        source: 'driver',
        sourceRecordId: selected.id,
        customerVisible: true,
      } })
    }
    dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'trip', entityId: selected.id, action: 'Driver submitted proof of delivery', actor: driver?.name ?? 'Driver', occurredAt: podReceivedAt } })
    showToast('POD submitted for warehouse verification.')
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    canvas?.getContext('2d')?.beginPath()
    setSignatureCaptured(false)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || event.buttons !== 1) return
    const context = canvas.getContext('2d')
    if (!context) return
    const rect = canvas.getBoundingClientRect()
    context.lineWidth = 2
    context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--blue-hover').trim()
    context.lineCap = 'round'
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top)
    context.stroke()
    context.beginPath()
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top)
    setSignatureCaptured(true)
  }

  return <div className="driver-app">
    <header className="driver-topbar">
      <div className="brand">
        <img src="/sk-logo.png" alt="SK Transworld Logo" className="brand-mark" />
        {/* <div className="brand-text">
          <strong>SK Transworld</strong>
          <small>Driver App · Demo only</small>
        </div> */}
      </div>
      <div className="driver-topbar-actions">
        <button className="icon-button" aria-label="Notifications" onClick={() => navigate('/app/alerts')} type="button">
          <span className="alert-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {state.alerts.filter(a => !a.resolved).length > 0 && <span className="notification-indicator" />}
          </span>
        </button>
        {/* <div className="driver-login">
          <select aria-label="Select demo driver" value={driverId} onChange={(event) => { setDriverId(event.target.value); selectTrip() }}>
            {state.drivers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div> */}
      </div>
    </header>
    <main className="driver-content">
      <div className="driver-welcome"><div><p className="eyebrow">Driver workspace · {state.demoDate}</p><h1>Hi, {driver?.name}</h1></div><StatusBadge tone="success">On duty</StatusBadge></div>
      {selected ? <>
        <div className="driver-detail-heading">
          <button className="driver-back" onClick={() => selectTrip()} type="button">← All trips</button>
          <div><p className="eyebrow">Trip detail · {selected.tripNumber}</p><h2>{job?.jobNumber ?? 'Job pending'} </h2>
            <p>{container?.containerNumber ?? 'No container assigned'}{outboundOrder ? ` · ${outboundOrder.deliveryOrderNumber} · ${selected.outboundQuantity ?? 0} ${outboundOrder.unit}` : ''}</p>
          </div>
        </div>
        <Card className="driver-route-card">
          <div className="trip-card__top"><div><p className="eyebrow">Assigned route · {selected.tripType?.replaceAll('-', ' ') ?? 'General haulage'}</p><h2>{selected.pickup} → {selected.delivery}</h2></div><StatusBadge tone={selected.status === 'completed' ? 'success' : 'info'}>{selected.status}</StatusBadge></div>
          <div className="driver-route-details">
            <div><span className="route-pin route-pin--pickup" /><div><small>Pickup</small><strong>{selected.pickup}</strong><span>Planned · {selected.plannedPickup ? new Date(selected.plannedPickup).toLocaleString('en-MY') : 'Not scheduled'}</span></div></div><i aria-hidden="true" />
            <div><span className="route-pin route-pin--delivery" /><div><small>Delivery</small><strong>{selected.delivery}</strong><span>Planned · {selected.plannedDelivery ? new Date(selected.plannedDelivery).toLocaleString('en-MY') : 'Not scheduled'}</span></div></div>
          </div>
          <div className="driver-trip-facts">
            <span>Appointment<strong>{selected.portAppointment ? new Date(selected.portAppointment).toLocaleString('en-MY') : selected.portSlot ?? 'Not scheduled'}</strong></span>
            <span>Truck / trailer<strong>{state.trucks.find((truck) => truck.id === selected.truckId)?.registrationNumber ?? (selected.subcontractor ? selected.subcontractorName ?? 'Subcontractor' : 'Not assigned')} · {state.trailers.find((trailer) => trailer.id === selected.trailerId)?.registrationNumber ?? (selected.subcontractor ? 'Subcontractor vehicle' : 'Not assigned')}</strong></span>
            {selected.instructions && <span className="driver-trip-instructions">Instructions<strong>{selected.instructions}</strong></span>}
            {selected.subcontractor && <span>Subcontractor haulage cost<strong>{amountLabel(selected.subcontractorHaulageCost ?? selected.estimatedTruckingCost ?? 0)} · separate cost</strong></span>}
          </div>
          <div className="driver-gps"><span className="gps-pulse" /><div><strong>Simulated GPS tracking</strong><small>{selected.status === 'completed' ? 'Trip complete · demo location only' : selected.status === 'in-progress' ? 'Trip in progress · location is simulated' : 'GPS updates are simulated for this demo'}</small></div><span>{selected.status === 'completed' ? 'Complete' : selected.status === 'in-progress' ? 'Tracking' : 'Assigned'}</span></div>
        </Card>
        <Card className="driver-progress-card">
          <div className="section-heading"><div><p className="eyebrow">Trip progress</p><h2>Required milestones</h2></div><span>{tripStages.filter((stage) => isDriverMilestoneComplete(selected, stage.key)).length} / {tripStages.length}</span></div>
          <div className="driver-progress-steps">{tripStages.map((stage, index) => {
            const event = selected.driverMilestones?.find((milestone) => milestone.key === stage.key)
            const complete = isDriverMilestoneComplete(selected, stage.key)
            const inferredTime = stage.key === 'trip-started' ? selected.plannedPickup : undefined
            const occurredAt = event?.occurredAt ?? inferredTime
            return <div className={complete ? 'driver-progress-step driver-progress-step--done' : 'driver-progress-step'} key={stage.key}>
              <span>{complete ? '✓' : index + 1}</span><strong>{stage.label}</strong>{occurredAt && <small>{new Date(occurredAt).toLocaleTimeString('en-MY')}</small>}
            </div>
          })}</div>
          <ul className="driver-milestones">{(selected.driverMilestones ?? []).map((milestone) => <li key={`${milestone.key}-${milestone.occurredAt}`}><span /><div><strong>{milestone.label}</strong><small>{new Date(milestone.occurredAt).toLocaleString('en-MY')}</small></div></li>)}</ul>
          {nextStage && nextStage.key !== 'pod' && <div className="driver-actions"><Button disabled={!selected.driverId || selected.driverId !== driverId} onClick={() => void updateTrip(nextStage.key)}>{nextStage.key === 'trip-started' ? 'Start trip' : `Confirm ${nextStage.label}`}</Button></div>}
        </Card>
        <div className="driver-grid">
          {nextStage?.key === 'pod' && <Card className="driver-task-card">
            <p className="eyebrow">Proof of delivery</p><h2>Capture POD</h2>
            <p className="card-copy">Record the receiver, signature, delivery timestamp and photo. GPS and POD are simulated in this demo.</p>
            <FormField label="Receiver name"><input autoComplete="name" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} /></FormField>
            <canvas aria-label="Receiver signature capture" className="signature-pad" height="120"
              onPointerDown={(event) => {
                const canvas = canvasRef.current
                const context = canvas?.getContext('2d')
                if (!canvas || !context) return
                const rect = canvas.getBoundingClientRect()
                context.beginPath()
                context.moveTo(event.clientX - rect.left, event.clientY - rect.top)
                setSignatureCaptured(true)
              }}
              onPointerMove={draw} ref={canvasRef} width="420" />
            <div className="driver-signature-actions"><p className="form-hint">{signatureCaptured ? 'Signature captured.' : 'Draw the receiver signature above.'}</p><Button disabled={!signatureCaptured} variant="outline" onClick={clearSignature}>Clear signature</Button></div>
            <FormField label="Delivery photo (required)">
              <input accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhoto(event.target.files?.[0])} type="file" />
            </FormField>
            {photo && <><p className="form-hint">Selected: {photo.name}</p>{photoPreview && <img className="driver-attachment-preview" src={photoPreview} alt={`Delivery photo preview: ${photo.name}`} />}</>}
            <FormField label="Delivery remarks (optional)"><textarea value={podRemarks} onChange={(event) => setPodRemarks(event.target.value)} rows={3} /></FormField>
            <Button className="driver-primary-action" disabled={!selected.driverId || selected.driverId !== driverId || selected.podStatus === 'received'} onClick={() => void savePod()}>Submit proof of delivery</Button>
          </Card>}
          <Card className="driver-task-card">
            <p className="eyebrow">Trip expenses</p><h2>Expense entry and history</h2>
            <div className="driver-expense-summary"><span>Estimated trip costs<strong>{amountLabel((selected.estimatedTruckingCost ?? 0) + (selected.estimatedTollCost ?? 0) + (selected.estimatedOtherCost ?? 0))}</strong><small>Estimate only · not submitted</small></span><span>Actual submitted<strong>{amountLabel(actualExpenseTotal)}</strong><small>Pending review unless explicitly approved</small></span></div>
            {expenseOpen ? <div className="form-grid">
              <FormField label="Expense category"><select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value as TripExpenseCategory)}>{expenseCategories.map((item) => <option key={item} value={item}>{item.replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></FormField>
              <p className="form-hint">Configured estimate for this category: {amountLabel(estimateExpense(selected, expenseCategory))}. Estimates do not become actual expenses automatically.</p>
              {estimateExpense(selected, expenseCategory) > 0 && <Button variant="outline" onClick={() => setExpenseAmount(estimateExpense(selected, expenseCategory))}>Use estimate as actual amount</Button>}
              <FormField label="Description"><input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} /></FormField>
              <FormField label="Actual amount (RM)"><input min="0" step="0.01" onChange={(event) => setExpenseAmount(Number(event.target.value))} type="number" value={expenseAmount} /></FormField>
              <FormField label="Receipt attachment (optional)"><input accept="image/*,.pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => setReceipt(event.target.files?.[0])} type="file" /></FormField>
              {receipt && <><p className="form-hint">Receipt: {receipt.name}</p>{receiptPreview && receipt.type.startsWith('image/') && <img className="driver-attachment-preview" src={receiptPreview} alt={`Receipt preview: ${receipt.name}`} />}</>}
              <div className="driver-actions"><Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button><Button disabled={!selected.driverId || selected.driverId !== driverId} onClick={() => void submitExpense()}>Submit actual expense</Button></div>
            </div> : <><p className="card-copy">Actual expenses are submitted for review and are never auto-approved or marked paid.</p><Button disabled={!selected.driverId || selected.driverId !== driverId} variant="outline" onClick={() => setExpenseOpen(true)}>＋ Add expense</Button></>}
            {selectedExpenses.length > 0 && <ul className="driver-expense-history">{selectedExpenses.map((expense) => <li key={expense.id}>
              <span><strong>{expense.category ?? 'Other'} · {expense.description}</strong><small>{expense.submittedAt ? new Date(expense.submittedAt).toLocaleString('en-MY') : 'Submitted'}{expense.receiptName ? ` · Receipt: ${expense.receiptName}` : ''}</small></span>
              <span><strong>{amountLabel(expense.amount)}</strong><StatusBadge tone={expense.status === 'approved' ? 'success' : expense.status === 'paid' ? 'neutral' : 'warning'}>{expense.status === 'submitted' ? 'Pending review' : expense.status}</StatusBadge></span>
            </li>)}</ul>}
          </Card>
        </div>
      </> : <>
        <div className="driver-stats"><Card><span>Assigned today</span><strong>{trips.length}</strong></Card><Card><span>In progress</span><strong>{activeTrips}</strong></Card><Card><span>Completed</span><strong>{trips.length - activeTrips}</strong></Card></div>
        <Card className="assigned-trips-card">
          <div className="section-heading"><div><p className="eyebrow">Dispatch</p><h2>Assigned trips</h2><p className="card-copy">Select a trip to see its linked delivery order, route, and driver milestones.</p></div><StatusBadge tone="info">{trips.length} trips</StatusBadge></div>
          {trips.length ? <div className="driver-trip-list">{trips.map((trip) => {
            const linkedJob = state.jobs.find((item) => item.id === trip.jobId)
            const linkedContainer = state.containers.find((item) => item.id === trip.containerId)
            const linkedOrder = state.outboundOrders.find((item) => item.id === trip.outboundOrderId)
            return <button className="driver-trip-card" key={trip.id} onClick={() => selectTrip(trip)} type="button">
              <span className="driver-trip-card__top"><strong>{trip.tripNumber}</strong><StatusBadge tone={trip.status === 'completed' ? 'success' : 'info'}>{trip.status}</StatusBadge></span>
              <span className="driver-trip-card__route"><span>{trip.pickup}</span><i aria-hidden="true" /><span>{trip.delivery}</span></span>
              <span className="driver-trip-card__meta">{linkedJob?.jobNumber ?? 'Job pending'} · {linkedContainer?.containerNumber ?? 'No container'}{linkedOrder ? ` · ${linkedOrder.deliveryOrderNumber} · ${trip.outboundQuantity} ${linkedOrder.unit}` : ''}</span>
              <span className="driver-trip-card__meta">
                {state.trucks.find((truck) => truck.id === trip.truckId)?.registrationNumber ?? trip.subcontractorName ?? 'Truck not assigned'}
                {' · '}{state.trailers.find((trailer) => trailer.id === trip.trailerId)?.registrationNumber ?? 'Trailer not assigned'}
                {' · Appointment: '}{trip.portAppointment ? new Date(trip.portAppointment).toLocaleString('en-MY') : trip.portSlot ?? 'None'}
              </span>
              {trip.instructions && <span className="driver-trip-card__meta">Instructions: {trip.instructions}</span>}
              <span className="driver-trip-card__footer">View trip details <b aria-hidden="true">→</b></span>
            </button>
          })}</div> : <p className="empty-state">No trips assigned to this demo driver.</p>}
        </Card>
        <Button className="driver-portal-link" variant="outline" onClick={() => navigate('/app/haulage')}>Dispatcher view</Button>
      </>}
    </main>
    {!selected && <nav className="driver-bottom-nav" aria-label="Driver app navigation"><button className="driver-bottom-nav__active" type="button"><span aria-hidden="true">⌂</span>Trips</button><button onClick={() => { setExpenseOpen((open) => !open); if (!selected && trips[0]) selectTrip(trips[0]) }} type="button"><span aria-hidden="true">＋</span>Expenses</button><button onClick={() => navigate('/app/haulage')} type="button"><span aria-hidden="true">↗</span>Dispatch</button></nav>}
  </div>
}
