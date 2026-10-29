import { useMemo, useState } from 'react'
import { Button, Card, DataTable, FormField, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateInvoiceTotals, calculateOutstandingBalance, calculateQuotationTotals, getAllBillableCharges } from '../../domain/calculations.ts'
import type { ActivityEvent, Job, Quotation, QuotationRequest, ServiceType, Shipment } from '../../domain/types.ts'
import { generateJobNumber, generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { useAppState } from '../../state/AppContext.tsx'
import './CustomerPortal.css'

const shipmentTone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => value === 'Delivered' ? 'success' : value === 'delayed' ? 'danger' : 'info'
const invoiceTone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => value === 'paid' ? 'success' : value === 'rejected' ? 'danger' : value === 'pending-approval' || value === 'draft' ? 'warning' : 'info'
const requestTone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => value === 'accepted' || value === 'converted' ? 'success' : value === 'rejected' ? 'danger' : value === 'quoted' ? 'info' : 'warning'
const formatMoney = (value: number) => `RM ${value.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`
const formatDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Not scheduled'
}
const serviceOptions: ServiceType[] = ['freight', 'customs', 'haulage', 'warehouse', 'other']

function RequestQuotationForm({ currentDate, onCancel, onSubmit }: { currentDate: string; onCancel: () => void; onSubmit: (request: Omit<QuotationRequest, 'id' | 'requestNumber' | 'customerId' | 'requestedAt' | 'status'>) => void }) {
  const [serviceType, setServiceType] = useState<ServiceType>('freight')
  const [direction, setDirection] = useState<'import' | 'export'>('import')
  const [mode, setMode] = useState<'FCL' | 'LCL' | 'air'>('FCL')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [cargoDescription, setCargoDescription] = useState('')
  const [containerQuantity, setContainerQuantity] = useState('')
  const [requestedPickupDate, setRequestedPickupDate] = useState('')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('')
  const [warehouseRequired, setWarehouseRequired] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!origin.trim() || !destination.trim() || !cargoDescription.trim() || !requestedPickupDate || !requestedDeliveryDate) {
      setError('Complete the route, cargo details and both requested dates.')
      return
    }
    if (requestedPickupDate < currentDate || requestedDeliveryDate < currentDate) {
      setError('Requested dates must be today or later.')
      return
    }
    if (requestedDeliveryDate < requestedPickupDate) {
      setError('Requested delivery must be on or after the pickup date.')
      return
    }
    if (containerQuantity && (!Number.isInteger(Number(containerQuantity)) || Number(containerQuantity) < 1)) {
      setError('Container quantity must be a positive whole number.')
      return
    }
    setError('')
    onSubmit({
      serviceType,
      direction,
      mode,
      origin: origin.trim(),
      destination: destination.trim(),
      cargoDescription: cargoDescription.trim(),
      containerQuantity: containerQuantity ? Number(containerQuantity) : undefined,
      requestedPickupDate,
      requestedDeliveryDate,
      warehouseRequired,
      instructions: instructions.trim() || undefined,
    })
  }

  return (
    <Card className="customer-request-form">
      <div className="customer-card-heading">
        <div><p className="eyebrow">New enquiry</p><h2 className="section-title">Request a quotation</h2></div>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="form-grid form-grid--three">
        <FormField label="Service type"><select value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)}>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select></FormField>
        <FormField label="Direction"><select value={direction} onChange={(event) => setDirection(event.target.value as 'import' | 'export')}><option value="import">Import</option><option value="export">Export</option></select></FormField>
        <FormField label="Shipment mode"><select value={mode} onChange={(event) => setMode(event.target.value as 'FCL' | 'LCL' | 'air')}><option value="FCL">FCL</option><option value="LCL">LCL</option><option value="air">Air</option></select></FormField>
        <FormField label="Origin"><input autoComplete="address-level2" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="e.g. Shanghai" /></FormField>
        <FormField label="Destination"><input autoComplete="address-level2" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="e.g. Port Klang" /></FormField>
        <FormField label="Container quantity (if known)"><input min="1" step="1" type="number" value={containerQuantity} onChange={(event) => setContainerQuantity(event.target.value)} placeholder="Optional" /></FormField>
        <FormField label="Requested pickup date"><input min={currentDate} type="date" value={requestedPickupDate} onChange={(event) => setRequestedPickupDate(event.target.value)} /></FormField>
        <FormField label="Requested delivery date"><input min={currentDate} type="date" value={requestedDeliveryDate} onChange={(event) => setRequestedDeliveryDate(event.target.value)} /></FormField>
        <FormField label="Cargo details"><input value={cargoDescription} onChange={(event) => setCargoDescription(event.target.value)} placeholder="Commodity, packaging and handling needs" /></FormField>
        <FormField label="Special instructions"><input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional handling instructions" /></FormField>
        <FormField label="Warehouse required"><select value={warehouseRequired ? 'yes' : 'no'} onChange={(event) => setWarehouseRequired(event.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></FormField>
      </div>
      {error && <p className="customer-form-error" role="alert">{error}</p>}
      <div className="form-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button onClick={submit}>Submit quotation request</Button></div>
    </Card>
  )
}

function CustomerQuotationCard({ request, quotations, jobNumber, jobId, currentDate, onDecision, onOpenJob }: { request: QuotationRequest; quotations: Quotation[]; jobNumber?: string; jobId?: string; currentDate: string; onDecision: (quotation: Quotation, decision: 'accepted' | 'rejected' | 'revision-requested', note?: string) => void; onOpenJob: (jobId: string) => void }) {
  const [revisionNote, setRevisionNote] = useState('')
  const latest = request.quotationId ? quotations.find((quotation) => quotation.id === request.quotationId) : undefined
  const versions = quotations.filter((quotation) => quotation.requestId === request.id).sort((a, b) => (a.version ?? 1) - (b.version ?? 1))
  const totals = latest && calculateQuotationTotals(latest.lines)
  const statusLabel = request.status === 'new' || request.status === 'submitted' ? 'New Request' : request.status.replaceAll('-', ' ')
  const isActionable = latest?.status === 'sent' && latest.validUntil >= currentDate && request.status === 'quoted'

  return (
    <article className="customer-request-card">
      <div className="customer-request-card__header">
        <div><span className="eyebrow">{request.requestNumber}</span><h3>{request.serviceType} · {request.origin} → {request.destination}</h3></div>
        <StatusBadge tone={requestTone(request.status)}>{statusLabel}</StatusBadge>
      </div>
      <div className="customer-request-facts">
        <span>Cargo<strong>{request.cargoDescription}</strong></span>
        <span>Mode / direction<strong>{request.mode ?? '—'} · {request.direction ?? '—'}</strong></span>
        <span>Requested dates<strong>{request.requestedPickupDate ? formatDate(request.requestedPickupDate) : '—'} → {request.requestedDeliveryDate ? formatDate(request.requestedDeliveryDate) : '—'}</strong></span>
        <span>Warehouse<strong>{request.warehouseRequired ? 'Required' : 'Not required'}</strong></span>
      </div>
      {request.instructions && <p className="customer-request-instructions">Instructions: {request.instructions}</p>}
      {jobNumber && <div className="customer-job-confirmation"><p><strong>Job created: {jobNumber}</strong> · linked to your accepted quotation.</p>{jobId && <Button variant="secondary" onClick={() => onOpenJob(jobId)}>Open Job Detail</Button>}</div>}
      {latest && totals && (
        <div className="customer-quote-review">
          <div className="customer-card-heading">
            <div><p className="eyebrow">Quotation · version {latest.version ?? 1}</p><h4>{latest.reference}</h4></div>
            <StatusBadge tone={requestTone(latest.status)}>{latest.status.replaceAll('-', ' ')}</StatusBadge>
          </div>
          <p className="customer-quote-validity">Valid through {formatDate(latest.validUntil)} · Subtotal {formatMoney(totals.subtotal)} · Tax {formatMoney(totals.tax)} · <strong>Total {formatMoney(totals.total)}</strong></p>
          <div className="customer-quote-lines">
            {latest.lines.map((line) => <div key={line.id}><span>{line.description}<small>{line.quantity} {line.unit} · tax {(line.taxRate * 100).toLocaleString('en-MY')}%</small></span><strong>{formatMoney(line.quantity * line.unitPrice - line.discount)}</strong></div>)}
          </div>
          {isActionable && (
            <div className="customer-quote-actions">
              <FormField label="Revision request (required to request changes)"><input value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Tell us what should be revised" /></FormField>
              <div><Button onClick={() => onDecision(latest, 'accepted')}>Accept quotation</Button><Button variant="secondary" onClick={() => onDecision(latest, 'revision-requested', revisionNote)}>Request revision</Button><Button variant="danger" onClick={() => onDecision(latest, 'rejected')}>Reject</Button></div>
            </div>
          )}
          {latest.status === 'sent' && latest.validUntil < currentDate && <p className="customer-request-instructions">This quotation has expired. Contact the commercial team for an updated offer.</p>}
          {latest.status === 'revision-requested' && latest.responseNote && <p className="customer-request-instructions">Revision requested: {latest.responseNote}</p>}
          {versions.length > 1 && <details className="customer-quote-history"><summary>Revision history · {versions.length} versions</summary><ol>{versions.map((quote) => <li key={quote.id}><span>v{quote.version ?? 1} · {quote.reference} · {quote.status.replaceAll('-', ' ')}</span><strong>{formatMoney(calculateQuotationTotals(quote.lines).total)}</strong></li>)}</ol></details>}
        </div>
      )}
      {!latest && <p className="customer-request-waiting">Your request is with our commercial team. We’ll show the quotation here once it is sent.</p>}
    </article>
  )
}

export function CustomerPortal({ navigate }: { navigate: (path: string) => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Shipment | undefined>()
  const [requestFormOpen, setRequestFormOpen] = useState(false)
  const customer = state.customers.find((item) => item.id === customerId)
  const jobs = state.jobs.filter((job) => job.customerId === customerId)
  const jobIds = new Set(jobs.map((job) => job.id))
  const customerShipments = state.shipments.filter((shipment) => jobIds.has(shipment.jobId))
  const shipments = customerShipments.filter((shipment) => (
    `${shipment.reference} ${shipment.origin} ${shipment.destination}`.toLowerCase().includes(query.toLowerCase())
  ))
  const activeShipments = customerShipments.filter((shipment) => shipment.status !== 'Delivered')
  const nextShipment = [...activeShipments].sort((a, b) => a.eta.localeCompare(b.eta))[0] ?? customerShipments[0]
  const documents = state.documents
    .filter((document) => jobIds.has(document.jobId) && ['customer-visible', undefined].includes(document.accessRule))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const charges = getAllBillableCharges(state).filter((charge) => charge.customerId === customerId && charge.approved)
  const invoices = state.customerInvoices.filter((invoice) => invoice.customerId === customerId)
  const customerRequests = state.quotationRequests.filter((request) => request.customerId === customerId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  const customerQuotations = state.quotations.filter((quotation) => quotation.customerId === customerId)
  const openAmount = calculateOutstandingBalance(state, customerId)
  const serviceTotals = useMemo(() => charges.reduce<Record<string, number>>((result, charge) => {
    result[charge.serviceType] = (result[charge.serviceType] ?? 0) + charge.quantity * charge.unitPrice
    return result
  }, {}), [charges])
  const detailJob = selected && state.jobs.find((job) => job.id === selected.jobId)
  const detailContainer = selected && state.containers.find((container) => container.shipmentId === selected.id)
  const detailDocs = selected ? documents.filter((document) => document.jobId === selected.jobId) : []
  const normalizedMilestones = selected
    ? state.shipmentMilestones
      .filter((milestone) => milestone.shipmentId === selected.id && milestone.customerVisible !== false)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    : []
  const milestoneTripIds = new Set(normalizedMilestones.map((milestone) => milestone.sourceRecordId).filter(Boolean))
  const tripMilestones = selected
    ? state.trips
      .filter((trip) => trip.jobId === selected.jobId && !milestoneTripIds.has(trip.id))
      .flatMap((trip) => trip.milestones
        .filter((milestone) => /^(at-port|In-Transit|Delivered|arrived at port)\b/i.test(milestone))
        .map((milestone) => `${trip.tripNumber} · ${milestone}`))
    : []
  const milestones = selected
    ? [
      ...(state.forwardingRecords.find((record) => record.shipmentId === selected.id)?.milestones ?? []),
      ...state.containerEvents
        .filter((event) => event.containerId === detailContainer?.id)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .map((event) => event.note),
      ...normalizedMilestones.map((milestone) => milestone.title),
      ...tripMilestones,
    ]
    : []

  const submitRequest = (details: Omit<QuotationRequest, 'id' | 'requestNumber' | 'customerId' | 'requestedAt' | 'status'>) => {
    const dateCode = state.demoDate.replaceAll('-', '').slice(2)
    let sequence = customerRequests.length + 1
    let requestNumber = `QR-${dateCode}-${String(sequence).padStart(3, '0')}`
    while (state.quotationRequests.some((request) => request.requestNumber === requestNumber)) {
      sequence += 1
      requestNumber = `QR-${dateCode}-${String(sequence).padStart(3, '0')}`
    }
    const request: QuotationRequest = {
      ...details,
      id: generateRecordId(state, 'quotationRequests'),
      requestNumber,
      customerId,
      requestedAt: state.demoDate,
      status: 'new',
    }
    const activity: ActivityEvent = {
      id: generateRecordId(state, 'activity'),
      entityType: 'quotation-request',
      entityId: request.id,
      action: `Customer submitted quotation request ${request.requestNumber}`,
      actor: customer?.contactName ?? 'Demo customer',
      occurredAt: `${state.demoDate}T09:00:00Z`,
    }
    dispatch({ type: 'submit-quotation-request', request, activity })
    setRequestFormOpen(false)
    showToast(`Quotation request ${requestNumber} submitted to SK Transworld.`)
  }

  const respondToQuotation = (request: QuotationRequest, quotation: Quotation, decision: 'accepted' | 'rejected' | 'revision-requested', note?: string) => {
    if (decision === 'revision-requested' && !note?.trim()) {
      showToast('Add a short note describing the changes you need.')
      return
    }
    const verb = decision === 'accepted' ? 'accept' : decision === 'rejected' ? 'reject' : 'request a revision for'
    if (!window.confirm(`Confirm that you want to ${verb} quotation ${quotation.reference}?`)) return

    const responseActivity: ActivityEvent = {
      id: generateRecordId(state, 'activity'),
      entityType: 'quotation-request',
      entityId: request.id,
      action: `Customer ${decision === 'revision-requested' ? 'requested a revision for' : decision} quotation ${quotation.reference}${note?.trim() ? `: ${note.trim()}` : ''}`,
      actor: customer?.contactName ?? 'Demo customer',
      occurredAt: `${state.demoDate}T10:00:00Z`,
    }
    if (decision !== 'accepted') {
      dispatch({ type: 'respond-to-request-quotation', quotationId: quotation.id, decision, note: note?.trim(), activity: [responseActivity] })
      showToast(decision === 'rejected' ? 'Quotation declined. The commercial team has been notified.' : 'Revision request sent to the commercial team.')
      return
    }

    if (state.jobs.some((job) => job.quotationRequestId === request.id || job.quotationId === quotation.id)) {
      showToast('A job is already linked to this quotation.')
      return
    }
    const jobId = generateRecordId(state, 'jobs')
    const job: Job = {
      id: jobId,
      jobNumber: generateJobNumber(state),
      customerId,
      quotationId: quotation.id,
      quotationRequestId: request.id,
      serviceType: request.serviceType,
      status: 'open',
      owner: 'Aina Noor',
      openedDate: state.demoDate,
    }
    const shipment: Shipment = {
      id: generateRecordId(state, 'shipments'),
      jobId,
      reference: `SHP-${job.jobNumber}`,
      mode: request.mode ?? 'LCL',
      direction: request.direction ?? 'import',
      origin: request.origin ?? '',
      destination: request.destination ?? '',
      eta: '',
      status: 'Booked',
      cargoDescription: request.cargoDescription,
      containerQuantity: request.containerQuantity,
      warehouseRequired: request.warehouseRequired,
    }
    const jobActivity: ActivityEvent = {
      ...responseActivity,
      id: generateStableId('act', [...state.activity, responseActivity]),
      entityType: 'job',
      entityId: jobId,
      action: `Job ${job.jobNumber} automatically created from accepted quotation ${quotation.reference}`,
      actor: 'CLMS workflow',
    }
    dispatch({ type: 'respond-to-request-quotation', quotationId: quotation.id, decision, job, shipment, activity: [responseActivity, jobActivity] })
    showToast(`Quotation accepted. Job ${job.jobNumber} has been created.`)
  }

  return (
    <div className="standalone-portal customer-portal">
      <header className="standalone-topbar customer-topbar">
        <div className="brand">
          {/* <img src="/sk-logo.png" alt="SK Transworld Logo" className="brand-mark" /> */}
          <div className="brand-copy"><strong>SK Transworld</strong><small>Customer Portal</small></div>
        </div>
        <div className="standalone-actions customer-topbar__actions">
          {/* <StatusBadge tone="warning">SIMULATED LOGIN</StatusBadge> */}
          <FormField label="">
            <select
              aria-label="Select demo customer"
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value)
                setSelected(undefined)
              }}
            >
              {state.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </FormField>
          <Button variant="ghost" onClick={() => navigate('/app/dashboard')}>Exit portal</Button>
        </div>
      </header>

      <main className="standalone-content customer-content">
        {selected ? (
          <div className="customer-detail">
            <div className="customer-detail__heading">
              <div>
                <button className="customer-back-link" onClick={() => setSelected(undefined)} type="button">← All shipments</button>
                <p className="eyebrow">Shipment detail · customer-visible only</p>
                <h1 className="page-title">{selected.reference}</h1>
                <p className="page-description">Job {detailJob?.jobNumber} · {detailContainer?.containerNumber ?? 'Container pending'}</p>
              </div>
              <StatusBadge tone={shipmentTone(selected.status)}>{selected.status}</StatusBadge>
            </div>

            <div className="customer-detail-grid">
              <Card className="customer-route-card">
                <div className="customer-card-heading">
                  <div><p className="eyebrow">Shipment route</p><h2 className="section-title">On the way to you</h2></div>
                  <span className="customer-mode">{selected.mode} · {selected.direction}</span>
                </div>
                <div className="customer-route">
                  <div className="customer-route__point">
                    <span className="customer-route__marker" aria-hidden="true" />
                    <div><span>Origin</span><strong>{selected.origin}</strong></div>
                  </div>
                  <div className="customer-route__line" aria-hidden="true" />
                  <div className="customer-route__point customer-route__point--destination">
                    <span className="customer-route__marker" aria-hidden="true" />
                    <div><span>Destination</span><strong>{selected.destination}</strong></div>
                  </div>
                </div>
                <div className="customer-shipment-facts">
                  <div><span>Estimated arrival</span><strong>{formatDate(selected.eta)}</strong></div>
                  <div><span>Container</span><strong>{detailContainer?.containerNumber ?? 'Not assigned'}</strong></div>
                  <div><span>Job number</span><strong>{detailJob?.jobNumber}</strong></div>
                </div>
                <p className="customer-privacy-note">Internal notes, supplier costs and finance approval controls are not visible in this portal.</p>
              </Card>

              <Card className="customer-milestones-card">
                <p className="eyebrow">Milestones</p>
                <h2 className="section-title">Shipment progress</h2>
                {milestones.length > 0 ? (
                  <ol className="customer-timeline">
                    {milestones.map((milestone, index) => (
                      <li className={index === milestones.length - 1 ? 'customer-timeline__item customer-timeline__item--current' : 'customer-timeline__item'} key={`${milestone}-${index}`}>
                        <span className="customer-timeline__dot" aria-hidden="true" />
                        <span>{milestone}</span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="customer-empty">Shipment milestones will appear here when available.</p>}
              </Card>

              <Card className="customer-documents-card">
                <div className="customer-card-heading">
                  <div><p className="eyebrow">Authorised documents</p><h2 className="section-title">Job folder</h2></div>
                  <span className="customer-count">{detailDocs.length} files</span>
                </div>
                {detailDocs.length > 0
                  ? <DataTable headers={['Document', 'Category', 'Date']} rows={detailDocs.map((document) => [document.name, document.category.replaceAll('-', ' '), formatDate(document.uploadedAt)])} />
                  : <p className="customer-empty">No customer-visible documents are available for this shipment yet.</p>}
              </Card>
            </div>
          </div>
        ) : (
          <>
            <section className="customer-hero" aria-labelledby="customer-welcome-title">
              <div className="customer-hero__welcome">
                <p className="eyebrow">Your logistics workspace</p>
                <h1 className="page-title" id="customer-welcome-title">Welcome back, {customer?.contactName}</h1>
                <p className="page-description">A clear view of your shipments, documents and account activity with {customer?.name}.</p>
                <div className="customer-hero__meta">
                  <span className="customer-avatar" aria-hidden="true">{customer?.name.slice(0, 1)}</span>
                  <span><strong>{customer?.name}</strong><small>{customer?.email}</small></span>
                </div>
              </div>
              {nextShipment ? (
                <button className="customer-featured-shipment" onClick={() => setSelected(nextShipment)} type="button">
                  <span className="customer-featured-shipment__top"><span>Next shipment</span><span className="customer-featured-shipment__arrow" aria-hidden="true">↗</span></span>
                  <strong className="customer-featured-shipment__reference">{nextShipment.reference}</strong>
                  <span className="customer-featured-shipment__route">{nextShipment.origin}<span aria-hidden="true">→</span>{nextShipment.destination}</span>
                  <span className="customer-featured-shipment__bottom">
                    <span><small>Estimated arrival</small><strong>{formatDate(nextShipment.eta)}</strong></span>
                    <StatusBadge tone={shipmentTone(nextShipment.status)}>{nextShipment.status}</StatusBadge>
                  </span>
                </button>
              ) : (
                <div className="customer-featured-shipment customer-featured-shipment--empty">
                  <span>Shipment overview</span><strong>No active shipments</strong><small>Your shipment updates will appear here.</small>
                </div>
              )}
            </section>

            <section className="customer-requests-section" aria-labelledby="customer-requests-title">
              <div className="customer-requests-heading">
                <div><p className="eyebrow">Commercial workspace</p><h2 className="section-title" id="customer-requests-title">Quotations & requests</h2><p>Request a service quote, review the rates, and accept it to open a linked job.</p></div>
                {!requestFormOpen && <Button onClick={() => setRequestFormOpen(true)}>＋ Request new quotation</Button>}
              </div>
              {requestFormOpen && <RequestQuotationForm key={customerId} currentDate={state.demoDate} onCancel={() => setRequestFormOpen(false)} onSubmit={submitRequest} />}
              {customerRequests.length > 0 ? (
                <div className="customer-request-list">
                  {customerRequests.map((request) => {
                    const linkedJob = state.jobs.find((job) => job.id === request.jobId || job.quotationRequestId === request.id)
                    return <CustomerQuotationCard key={request.id} request={request} quotations={customerQuotations} jobNumber={linkedJob?.jobNumber} jobId={linkedJob?.id} currentDate={state.demoDate} onDecision={(quotation, decision, note) => respondToQuotation(request, quotation, decision, note)} onOpenJob={(jobId) => navigate(`/app/jobs?jobId=${jobId}`)} />
                  })}
                </div>
              ) : !requestFormOpen ? (
                <Card className="customer-empty customer-empty--large"><strong>No quotation requests yet</strong><span>Tell us what you need moved and our team will prepare a quote for you.</span></Card>
              ) : null}
              {customerQuotations.some((quotation) => !quotation.requestId) && (
                <Card className="customer-existing-quotes">
                  <div className="customer-card-heading"><div><p className="eyebrow">Account history</p><h3 className="section-title">Other quotations</h3></div></div>
                  {customerQuotations.filter((quotation) => !quotation.requestId).map((quotation) => <div className="customer-existing-quote" key={quotation.id}><span><strong>{quotation.reference}</strong><small>Valid through {formatDate(quotation.validUntil)} · {quotation.lines.length} service lines</small></span><span>{formatMoney(calculateQuotationTotals(quotation.lines).total)}</span><StatusBadge tone={requestTone(quotation.status)}>{quotation.status.replaceAll('-', ' ')}</StatusBadge></div>)}
                </Card>
              )}
            </section>

            <section className="customer-metrics" aria-label="Account overview">
              <Card className="customer-metric"><span className="customer-metric__icon" aria-hidden="true">↗</span><span className="customer-metric__label">Active shipments</span><strong>{activeShipments.length}</strong><small>{customerShipments.length} total across your jobs</small></Card>
              <Card className="customer-metric"><span className="customer-metric__icon customer-metric__icon--blue" aria-hidden="true">◷</span><span className="customer-metric__label">Next arrival</span><strong className="customer-metric__date">{nextShipment ? formatDate(nextShipment.eta) : '—'}</strong><small>{nextShipment?.reference ?? 'No upcoming shipment'}</small></Card>
              <Card className="customer-metric"><span className="customer-metric__icon customer-metric__icon--amber" aria-hidden="true">▤</span><span className="customer-metric__label">Open invoices</span><strong>{invoices.filter((invoice) => invoice.paymentStatus !== 'paid').length}</strong><small>For your account</small></Card>
              <Card className="customer-metric customer-metric--balance"><span className="customer-metric__icon customer-metric__icon--green" aria-hidden="true">RM</span><span className="customer-metric__label">Outstanding balance</span><strong>{formatMoney(openAmount)}</strong><small>Based on posted payments</small></Card>
            </section>

            <div className="customer-dashboard-grid">
              <Card className="customer-shipments-card">
                <div className="customer-card-heading">
                  <div><p className="eyebrow">Live overview</p><h2 className="section-title">Your shipments</h2></div>
                  <span className="customer-count">{shipments.length} shown</span>
                </div>
                <label className="customer-search">
                  <span aria-hidden="true">⌕</span>
                  <input aria-label="Search shipments" onChange={(event) => setQuery(event.target.value)} placeholder="Search by reference or route" value={query} />
                  {query && <button aria-label="Clear shipment search" onClick={() => setQuery('')} type="button">×</button>}
                </label>
                {shipments.length > 0 ? (
                  <div className="customer-shipment-list">
                    {shipments.map((shipment) => {
                      const job = state.jobs.find((item) => item.id === shipment.jobId)
                      const container = state.containers.find((item) => item.shipmentId === shipment.id)
                      return (
                        <article className="customer-shipment-row" key={shipment.id}>
                          <div className="customer-shipment-row__main">
                            <span className="customer-shipment-row__icon" aria-hidden="true">↗</span>
                            <div>
                              <div className="customer-shipment-row__title"><strong>{shipment.reference}</strong><StatusBadge tone={shipmentTone(shipment.status)}>{shipment.status}</StatusBadge></div>
                              <span className="customer-shipment-row__route">{shipment.origin}<span aria-hidden="true">→</span>{shipment.destination}</span>
                              <span className="customer-shipment-row__meta">{job?.jobNumber} <span aria-hidden="true">·</span> {container?.containerNumber ?? 'Container pending'}</span>
                            </div>
                          </div>
                          <div className="customer-shipment-row__arrival"><span>ETA</span><strong>{formatDate(shipment.eta)}</strong></div>
                          <Button variant="secondary" onClick={() => setSelected(shipment)}>Track shipment <span aria-hidden="true">→</span></Button>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="customer-empty customer-empty--large">
                    <strong>{customerShipments.length ? 'No shipments match that search' : 'No shipments to display'}</strong>
                    <span>{customerShipments.length ? 'Try a reference number or a different route.' : 'Your shipment updates will appear here.'}</span>
                  </div>
                )}
              </Card>

              <aside className="customer-side-stack" aria-label="Account information">
                <Card className="customer-documents-summary">
                  <div className="customer-card-heading">
                    <div><p className="eyebrow">Ready when you need them</p><h2 className="section-title">Recent documents</h2></div>
                    <span className="customer-count">{documents.length}</span>
                  </div>
                  {documents.length > 0 ? (
                    <ul className="customer-document-list">
                      {documents.slice(0, 4).map((document) => (
                        <li key={document.id}>
                          <span className="customer-document-icon" aria-hidden="true">▤</span>
                          <span className="customer-document-copy"><strong>{document.name}</strong><small>{document.category.replaceAll('-', ' ')} · {formatDate(document.uploadedAt)}</small></span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="customer-empty">Customer-visible documents will appear here.</p>}
                  <p className="customer-privacy-note">Only authorised documents are shown in this portal.</p>
                </Card>

                <Card className="customer-billing-summary">
                  <div className="customer-card-heading">
                    <div><p className="eyebrow">Account</p><h2 className="section-title">Invoices & charges</h2></div>
                  </div>
                  <div className="customer-balance-line"><span>Outstanding balance</span><strong>{formatMoney(openAmount)}</strong></div>
                  {invoices.length > 0 ? (
                    <ul className="customer-invoice-list">
                      {invoices.slice(0, 3).map((invoice) => {
                        const invoiceAmount = calculateInvoiceTotals(invoice).total
                        const paidAmount = state.paymentTransactions
                          .filter((payment) => payment.invoiceId === invoice.id && payment.status === 'posted')
                          .reduce((sum, payment) => sum + payment.amount, 0)
                        return (
                          <li key={invoice.id}>
                            <span><strong>{invoice.invoiceNumber}</strong><small>Due {formatDate(invoice.dueDate)}</small></span>
                            <span><strong>{formatMoney(Math.max(0, invoiceAmount - paidAmount))}</strong><StatusBadge tone={invoiceTone(invoice.paymentStatus)}>{invoice.paymentStatus.replaceAll('-', ' ')}</StatusBadge></span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : <p className="customer-empty">There are no invoices for this account yet.</p>}
                  {Object.keys(serviceTotals).length > 0 && (
                    <div className="customer-charge-summary">
                      <span>Approved charges by service</span>
                      {Object.entries(serviceTotals).map(([service, amount]) => <div key={service}><span>{service}</span><strong>{formatMoney(amount)}</strong></div>)}
                    </div>
                  )}
                  <p className="customer-privacy-note">Invoice and charge visibility is a demo assumption. Amounts are shown in MYR.</p>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
