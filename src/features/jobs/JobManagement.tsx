import { useEffect, useState } from 'react'
import { useConfirmation } from '../../../components/useConfirmation.ts'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateInvoiceTotals, calculateJobFinancials, getAllBillableCharges } from '../../domain/calculations.ts'
import { buildJobMilestones } from '../../domain/jobMilestones.ts'
import { shipmentExtractionSamples, type ShipmentExtraction } from '../../domain/shipmentExtraction.ts'
import type { ActivityEvent, DocumentMetadata, Job, Shipment } from '../../domain/types.ts'
import { generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { generateJobNumber } from '../../services/mockStore.ts'
import { useAppState } from '../../state/AppContext.tsx'

type JobStatus = Job['status']
const statusTone = (status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : status === 'in-progress' ? 'info' : status === 'on-hold' ? 'warning' : 'neutral'

function jobCustomer(state: ReturnType<typeof useAppState>['state'], job: Job) {
  return state.customers.find((customer) => customer.id === job.customerId)
}

function JobList({ onCreate, onDetail }: { onCreate: () => void; onDetail: (job: Job) => void }) {
  const { state } = useAppState()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | JobStatus>('all')
  const [customerId, setCustomerId] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 5
  const filtered = state.jobs.filter((job) => {
    const customer = jobCustomer(state, job)
    const shipment = state.shipments.find((item) => item.jobId === job.id)
    const text = `${job.jobNumber} ${customer?.name ?? ''} ${shipment?.reference ?? ''} ${shipment?.origin ?? ''} ${shipment?.destination ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (status === 'all' || job.status === status) && (customerId === 'all' || job.customerId === customerId)
  })
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  return <><PageHeader eyebrow="Operations" title="Jobs & Dockets" description="Create, track and review the shared job record connecting every logistics activity." actions={<Button onClick={onCreate}>＋ Create job</Button>} /><Card><div className="filter-bar"><input aria-label="Search jobs" onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search Job Number, customer, shipment..." value={query} /><select aria-label="Filter job status" onChange={(event) => { setStatus(event.target.value as 'all' | JobStatus); setPage(1) }} value={status}><option value="all">All statuses</option>{(['open', 'in-progress', 'on-hold', 'completed', 'cancelled'] as JobStatus[]).map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Filter job customer" onChange={(event) => { setCustomerId(event.target.value); setPage(1) }} value={customerId}><option value="all">All customers</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><DataTable headers={['Job Number', 'Customer', 'Created', 'Service', 'Shipment / route', 'Owner', 'Status', 'Next action']} rows={rows.map((job) => { const customer = jobCustomer(state, job); const shipment = state.shipments.find((item) => item.jobId === job.id); const customs = state.customsRecords.find((item) => item.jobId === job.id); return [<button className="link-button" onClick={() => onDetail(job)} type="button">{job.jobNumber}</button>, customer?.name ?? 'Unknown', job.openedDate, job.serviceType, shipment ? `${shipment.reference} · ${shipment.origin} → ${shipment.destination}` : 'No shipment linked', job.owner, <StatusBadge tone={statusTone(job.status)}>{job.status}</StatusBadge>, customs?.edoStatus === 'pending' ? 'Follow up EDO' : job.status === 'completed' ? 'Closed' : 'Review activity'] })} /></Card><div className="pagination"><span>Showing {rows.length} of {filtered.length} jobs</span><div><Button variant="ghost" onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><strong>Page {page} / {pages}</strong><Button variant="ghost" onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button></div></div></>
}

function AiExtraction({ onApply }: { onApply: (profile: ShipmentExtraction) => void }) {
  const [sampleId, setSampleId] = useState(shipmentExtractionSamples[0].id)
  const [extracted, setExtracted] = useState(false)
  const sample = shipmentExtractionSamples.find((item) => item.id === sampleId) ?? shipmentExtractionSamples[0]
  const missing = [
    !sample.vessel && 'Vessel', !sample.voyage && 'Voyage', !sample.etd && 'ETD', !sample.eta && 'ETA',
  ].filter(Boolean)
  return <Card className="ai-card"><div className="section-heading"><div><p className="eyebrow">AI extraction simulation — demo only</p><h2>Review a sample shipment document</h2></div><StatusBadge tone="info">No external AI call</StatusBadge></div><p className="card-copy">Choose a fixed sample document. Only values present in that sample are suggested; missing vessel and schedule details stay blank for manual entry.</p><div className="ai-review-controls"><FormField label="Sample document"><select value={sampleId} onChange={(event) => { setSampleId(event.target.value); setExtracted(false) }}>{shipmentExtractionSamples.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><Button variant="secondary" onClick={() => setExtracted(true)}>Extract document</Button></div>{extracted && <div className="ai-review"><div className="ai-suggestion"><StatusBadge tone="warning">Suggested values — confirm before saving</StatusBadge><div className="suggestion-grid"><span>Customer<strong>{sample.customerName}</strong></span><span>Direction / mode<strong>{sample.direction} · {sample.mode}</strong></span><span>Shipment<strong>{sample.shipmentReference}</strong></span><span>Route<strong>{sample.origin} → {sample.destination}</strong></span><span>Vessel / voyage<strong>{sample.vessel || 'Not found — enter manually'} · {sample.voyage || 'Not found — enter manually'}</strong></span><span>ETD / ETA<strong>{sample.etd || 'Not found — enter manually'} · {sample.eta || 'Not found — enter manually'}</strong></span><span>Container<strong>{sample.containerNumber ?? 'Not found — enter manually'}{sample.containerType ? ` · ${sample.containerType}` : ''}</strong></span><span>Cargo<strong>{sample.cargoDescription}</strong></span><span>Quantity / weight<strong>{sample.cartons ?? '—'} cartons · {sample.pallets ?? '—'} pallets · {sample.cbm ?? '—'} CBM · {sample.weightKg ?? '—'} kg</strong></span><span>BL / HBL / MBL<strong>{sample.blReference ?? '—'} · {sample.hblReference ?? '—'} · {sample.mblReference ?? '—'}</strong></span><span>Warehouse<strong>{sample.warehouseRequired ? 'Required' : 'Not required'}</strong></span><span>Supporting documents<strong>{sample.supportingDocuments.join(', ') || 'None found'}</strong></span></div></div>{missing.length > 0 && <p className="form-hint">Manual entry required for: {missing.join(', ')}.</p>}<Button onClick={() => onApply(sample)}>Apply suggestions for review</Button></div>}</Card>
}

function ExistingJobShipmentExtraction({ job, shipment }: { job: Job; shipment: Shipment }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const customer = jobCustomer(state, job)
  const samples = shipmentExtractionSamples.filter((sample) => sample.customerName === customer?.name)
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? '')
  const [extracted, setExtracted] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const sample = samples.find((item) => item.id === sampleId)
  const currentContainer = state.containers.find((item) => item.shipmentId === shipment.id && item.jobId === job.id)

  const apply = () => {
    if (!sample || !confirmed) return
    const conflictingContainer = sample.containerNumber && state.containers.find((item) =>
      item.containerNumber.toLowerCase() === sample.containerNumber?.toLowerCase() && item.jobId !== job.id)
    if (conflictingContainer) {
      showToast(`Container ${sample.containerNumber} is already linked to another job.`)
      return
    }
    const updatedShipment: Shipment = {
      ...shipment,
      vessel: sample.vessel ?? shipment.vessel,
      voyage: sample.voyage ?? shipment.voyage,
      etd: sample.etd ?? shipment.etd,
      eta: sample.eta ?? shipment.eta,
      containerType: sample.containerType ?? shipment.containerType,
      cargoDescription: sample.cargoDescription || shipment.cargoDescription,
      cartons: sample.cartons ?? shipment.cartons,
      pallets: sample.pallets ?? shipment.pallets,
      cbm: sample.cbm ?? shipment.cbm,
      weightKg: sample.weightKg ?? shipment.weightKg,
      blReference: sample.blReference ?? shipment.blReference,
      hblReference: sample.hblReference ?? shipment.hblReference,
      mblReference: sample.mblReference ?? shipment.mblReference,
      pickupRequirements: sample.pickupRequirements ?? shipment.pickupRequirements,
      deliveryRequirements: sample.deliveryRequirements ?? shipment.deliveryRequirements,
    }
    dispatch({ type: 'update-shipment', shipment: updatedShipment })
    if (sample.containerNumber) {
      const container = currentContainer
        ? { ...currentContainer, containerNumber: sample.containerNumber, size: sample.containerType ?? currentContainer.size, vessel: sample.vessel ?? currentContainer.vessel, voyage: sample.voyage ?? currentContainer.voyage, port: shipment.destination, eta: sample.eta ?? currentContainer.eta }
        : {
          id: generateRecordId(state, 'containers'),
          containerNumber: sample.containerNumber,
          jobId: job.id,
          shipmentId: shipment.id,
          size: sample.containerType ?? '40ft HC',
          vessel: sample.vessel ?? '',
          voyage: sample.voyage ?? '',
          port: shipment.destination,
          eta: sample.eta ?? shipment.eta,
          freeDays: 3,
          movementStatus: 'Booked' as const,
        }
      if (currentContainer) dispatch({ type: 'update-container', container })
      else dispatch({ type: 'add-container', container })
    }
    for (const name of sample.supportingDocuments) {
      if (state.documents.some((document) => document.jobId === job.id && document.relatedRecordId === shipment.id && document.name === name)) continue
      dispatch({ type: 'add-document', document: {
        id: generateStableId('doc', state.documents),
        jobId: job.id,
        name,
        category: name.toLowerCase().includes('bill of lading') ? 'bl' : 'packing-list',
        status: 'pending-review',
        uploadedAt: state.demoDate,
        relatedRecordId: shipment.id,
        accessRule: 'internal',
        previewText: 'Sample document metadata from the AI extraction simulation.',
      } })
    }
    dispatch({ type: 'add-activity', activity: {
      id: generateStableId('act', state.activity),
      entityType: 'shipment',
      entityId: shipment.id,
      action: `AI-extracted shipment details confirmed · ${sample.vessel ?? 'vessel not provided'} · ${sample.containerNumber ?? 'container not provided'}`,
      actor: 'Aina Noor',
      occurredAt: `${state.demoDate}T09:00:00Z`,
    } })
    showToast(`Shipment details confirmed for ${job.jobNumber}.`)
    setExtracted(false)
    setConfirmed(false)
  }

  if (!samples.length) return <Card><p className="card-copy">No sample extraction is configured for this customer. Enter shipment details in the linked forwarding workflow.</p></Card>

  return <Card className="ai-card">
    <div className="section-heading"><div><p className="eyebrow">AI extraction simulation — demo only</p><h2>Confirm shipment document details</h2></div><StatusBadge tone="info">No external AI call</StatusBadge></div>
    <div className="ai-review-controls"><FormField label="Sample document"><select value={sampleId} onChange={(event) => { setSampleId(event.target.value); setExtracted(false); setConfirmed(false) }}>{samples.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><Button variant="secondary" onClick={() => { setExtracted(true); setConfirmed(false) }}>Extract document</Button></div>
    {extracted && sample && <div className="ai-review">
      <div className="suggestion-grid">
        <span>Job / shipment<strong>{job.jobNumber} · {shipment.reference}</strong></span>
        <span>Route (kept from accepted request)<strong>{shipment.origin} → {shipment.destination}</strong></span>
        <span>Suggested vessel / voyage<strong>{sample.vessel || 'Not found'} · {sample.voyage || 'Not found'}</strong></span>
        <span>Suggested ETD / ETA<strong>{sample.etd || 'Not found'} · {sample.eta || 'Not found'}</strong></span>
        <span>Suggested container<strong>{sample.containerNumber || 'Not found'} · {sample.containerType || 'Not found'}</strong></span>
        <span>Cargo measures<strong>{sample.cartons ?? '—'} cartons · {sample.pallets ?? '—'} pallets · {sample.cbm ?? '—'} CBM · {sample.weightKg ?? '—'} kg</strong></span>
        <span>Bill of lading<strong>{sample.blReference ?? '—'} · {sample.hblReference ?? '—'} · {sample.mblReference ?? '—'}</strong></span>
      </div>
      <label className="exception-check"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /> I reviewed and confirm these extracted shipment details.</label>
      <Button disabled={!confirmed} onClick={apply}>Confirm extracted details</Button>
    </div>}
  </Card>
}

function JobCreate({ onCancel, onSaved }: { onCancel: () => void; onSaved: (job: Job) => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [step, setStep] = useState(1)
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? '')
  const [quotationId, setQuotationId] = useState('')
  const [exception, setException] = useState(false)
  const [serviceType, setServiceType] = useState<Job['serviceType']>('freight')
  const [shipmentReference, setShipmentReference] = useState('')
  const [direction, setDirection] = useState<Shipment['direction']>('import')
  const [mode, setMode] = useState<Shipment['mode']>('FCL')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [vessel, setVessel] = useState('')
  const [voyage, setVoyage] = useState('')
  const [etd, setEtd] = useState('')
  const [eta, setEta] = useState('')
  const [containerNumber, setContainerNumber] = useState('')
  const [containerType, setContainerType] = useState<NonNullable<Shipment['containerType']>>('40ft HC')
  const [cargoDescription, setCargoDescription] = useState('')
  const [cartons, setCartons] = useState('')
  const [pallets, setPallets] = useState('')
  const [cbm, setCbm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [blReference, setBlReference] = useState('')
  const [hblReference, setHblReference] = useState('')
  const [mblReference, setMblReference] = useState('')
  const [pickupRequirements, setPickupRequirements] = useState('')
  const [deliveryRequirements, setDeliveryRequirements] = useState('')
  const [containerQuantity, setContainerQuantity] = useState('')
  const [warehouseRequired, setWarehouseRequired] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [aiReviewed, setAiReviewed] = useState(false)
  const [supportingDocuments, setSupportingDocuments] = useState<string[]>([])
  const acceptedQuotes = state.quotations.filter((quote) => quote.status === 'accepted' && quote.customerId === customerId)
  const selectedCustomer = state.customers.find((customer) => customer.id === customerId)

  const applyAi = (profile: ShipmentExtraction) => {
    const extractedCustomerId = state.customers.find((customer) => customer.name === profile.customerName)?.id
    if (extractedCustomerId && extractedCustomerId !== customerId) setQuotationId('')
    setCustomerId(extractedCustomerId ?? customerId)
    setShipmentReference(profile.shipmentReference)
    setDirection(profile.direction)
    setMode(profile.mode)
    setOrigin(profile.origin)
    setDestination(profile.destination)
    setVessel(profile.vessel ?? '')
    setVoyage(profile.voyage ?? '')
    setEtd(profile.etd ?? '')
    setEta(profile.eta ?? '')
    setContainerNumber(profile.containerNumber ?? '')
    setContainerType(profile.containerType ?? '40ft HC')
    setCargoDescription(profile.cargoDescription)
    setCartons(profile.cartons === undefined ? '' : String(profile.cartons))
    setPallets(profile.pallets === undefined ? '' : String(profile.pallets))
    setCbm(profile.cbm === undefined ? '' : String(profile.cbm))
    setWeightKg(profile.weightKg === undefined ? '' : String(profile.weightKg))
    setBlReference(profile.blReference ?? '')
    setHblReference(profile.hblReference ?? '')
    setMblReference(profile.mblReference ?? '')
    setPickupRequirements(profile.pickupRequirements ?? '')
    setDeliveryRequirements(profile.deliveryRequirements ?? '')
    setWarehouseRequired(profile.warehouseRequired)
    setContainerQuantity(profile.mode === 'FCL' ? '1' : '')
    setSupportingDocuments(profile.supportingDocuments)
    setAiApplied(true)
    setAiReviewed(false)
  }

  const save = () => {
    if (!customerId || (!quotationId && !exception) || !shipmentReference.trim() || !origin.trim() || !destination.trim()) {
      showToast('Complete the required customer, quotation path, shipment and route fields.')
      return
    }
    if (aiApplied && !aiReviewed) {
      showToast('Confirm that you reviewed the extracted values before saving.')
      return
    }
    const numericFields = [cartons, pallets, cbm, weightKg, containerQuantity].filter(Boolean).map(Number)
    if (numericFields.some((value) => !Number.isFinite(value) || value < 0)
      || (cartons && !Number.isInteger(Number(cartons)))
      || (pallets && !Number.isInteger(Number(pallets)))
      || (containerQuantity && (!Number.isInteger(Number(containerQuantity)) || Number(containerQuantity) < 1))) {
      showToast('Cargo measures and container quantity must be valid non-negative values.')
      return
    }
    if (containerNumber.trim() && (mode !== 'FCL' || !containerQuantity || Number(containerQuantity) < 1)) {
      showToast('Container details require FCL mode and a valid container quantity.')
      return
    }
    if (state.shipments.some((item) => item.reference.toLowerCase() === shipmentReference.trim().toLowerCase())) {
      showToast('That shipment reference is already linked to another job.')
      return
    }
    if (containerNumber.trim() && state.containers.some((item) => item.containerNumber.toLowerCase() === containerNumber.trim().toLowerCase())) {
      showToast('That container is already linked to another job. Check the container number before saving.')
      return
    }
    const id = generateRecordId(state, 'jobs')
    const jobNumber = generateJobNumber(state)
    const job: Job = { id, jobNumber, customerId, quotationId: quotationId || undefined, serviceType, status: 'open', owner: 'Aina Noor', openedDate: state.demoDate }
    const shipmentId = generateRecordId(state, 'shipments')
    const shipment: Shipment = {
      id: shipmentId, jobId: id, reference: shipmentReference.trim(), mode, direction, origin: origin.trim(), destination: destination.trim(),
      eta: eta || '', etd: etd || undefined, vessel: vessel.trim() || undefined, voyage: voyage.trim() || undefined,
      status: 'Booked', containerType: containerNumber.trim() ? containerType : undefined,
      cargoDescription: cargoDescription.trim() || undefined,
      cartons: cartons ? Number(cartons) : undefined, pallets: pallets ? Number(pallets) : undefined,
      cbm: cbm ? Number(cbm) : undefined, weightKg: weightKg ? Number(weightKg) : undefined,
      containerQuantity: containerQuantity ? Number(containerQuantity) : undefined,
      blReference: blReference.trim() || undefined, hblReference: hblReference.trim() || undefined, mblReference: mblReference.trim() || undefined,
      pickupRequirements: pickupRequirements.trim() || undefined, deliveryRequirements: deliveryRequirements.trim() || undefined, warehouseRequired,
    }
    const container = containerNumber.trim() ? {
      id: generateRecordId(state, 'containers'), containerNumber: containerNumber.trim(), jobId: id, shipmentId,
      size: containerType, vessel: vessel.trim(), voyage: voyage.trim(), port: /port/i.test(destination) ? destination.trim() : '', eta: eta || '',
      freeDays: 3, movementStatus: 'Booked' as const,
    } : undefined
    const docs: DocumentMetadata[] = [{ id: generateStableId('doc', state.documents), jobId: id, name: `${jobNumber} Job Docket`, category: 'job-docket', status: 'available', uploadedAt: state.demoDate }]
    supportingDocuments.forEach((name) => {
      docs.push({
        id: generateStableId('doc', [...state.documents, ...docs]), jobId: id, name,
        category: name.toLowerCase().includes('bill of lading') ? 'bl' : 'packing-list',
        status: 'pending-review', uploadedAt: state.demoDate,
      })
    })
    const activity: ActivityEvent = { id: generateStableId('act', state.activity), entityType: 'job', entityId: id, action: exception ? 'Job created via quotation exception path' : 'Job created from accepted quotation', actor: 'Aina Noor', occurredAt: `${state.demoDate}T09:00:00Z` }
    const milestones = buildJobMilestones(id, shipment, job.owner, state.demoDate, state.jobMilestones)
    dispatch({ type: 'add-job-bundle', job, shipment, container, documents: docs, milestones, activity })
    showToast(`${jobNumber} created with shipment details, milestones and digital job folder.`)
    onSaved(job)
  }

  return <>
    <PageHeader eyebrow="Job docket" title="Create a new job" description="Review shipment data, create linked records and apply the configured operational milestones." actions={<Button variant="secondary" onClick={onCancel}>Cancel</Button>} />
    <div className="wizard-steps">{['Customer & quote', 'Shipment details', 'Documents & review'].map((label, index) => <button className={step === index + 1 ? 'wizard-step wizard-step--active' : 'wizard-step'} key={label} onClick={() => setStep(index + 1)} type="button"><span>{index + 1}</span>{label}</button>)}</div>
    <AiExtraction onApply={applyAi} />
    {aiApplied && <div className="ai-applied-note">Suggestions are editable below. Confirm the review on the final step before saving.</div>}
    <Card className="form-card">
      {step === 1 && <div className="form-grid">
        <FormField label="Customer *"><select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setQuotationId('') }}>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></FormField>
        <FormField label="Accepted quotation"><select value={quotationId} onChange={(event) => setQuotationId(event.target.value)}><option value="">Select accepted quotation</option>{acceptedQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.reference}</option>)}</select></FormField>
        <label className="exception-check"><input checked={exception} onChange={(event) => setException(event.target.checked)} type="checkbox" /> Create without accepted quotation <small>Demo exception path — requires operational review.</small></label>
        <FormField label="Service type *"><select value={serviceType} onChange={(event) => setServiceType(event.target.value as Job['serviceType'])}><option value="freight">Freight forwarding</option><option value="customs">Customs clearance</option><option value="haulage">Haulage</option><option value="warehouse">Warehouse</option><option value="other">Other</option></select></FormField>
      </div>}
      {step === 2 && <div className="form-grid">
        <FormField label="Shipment reference *"><input value={shipmentReference} onChange={(event) => setShipmentReference(event.target.value)} placeholder="e.g. SHP-2610041" /></FormField>
        <FormField label="Direction"><select value={direction} onChange={(event) => setDirection(event.target.value as Shipment['direction'])}><option value="import">Import</option><option value="export">Export</option></select></FormField>
        <FormField label="Mode"><select value={mode} onChange={(event) => setMode(event.target.value as Shipment['mode'])}><option value="FCL">FCL</option><option value="LCL">LCL</option><option value="air">Air</option></select></FormField>
        <FormField label="Origin *"><input value={origin} onChange={(event) => setOrigin(event.target.value)} /></FormField>
        <FormField label="Destination *"><input value={destination} onChange={(event) => setDestination(event.target.value)} /></FormField>
        <FormField label="Vessel"><input value={vessel} onChange={(event) => setVessel(event.target.value)} placeholder="Not extracted? Enter manually" /></FormField>
        <FormField label="Voyage"><input value={voyage} onChange={(event) => setVoyage(event.target.value)} placeholder="Not extracted? Enter manually" /></FormField>
        <FormField label="ETD"><input type="date" value={etd} onChange={(event) => setEtd(event.target.value)} /></FormField>
        <FormField label="ETA"><input type="date" value={eta} onChange={(event) => setEta(event.target.value)} /></FormField>
        <FormField label="Container number"><input value={containerNumber} onChange={(event) => setContainerNumber(event.target.value)} placeholder="Optional" /></FormField>
        {containerNumber && <FormField label="Container type"><select value={containerType} onChange={(event) => setContainerType(event.target.value as NonNullable<Shipment['containerType']>)}><option value="20ft">20ft</option><option value="40ft">40ft</option><option value="40ft HC">40ft HC</option></select></FormField>}
        <FormField label="Container quantity"><input min="1" type="number" value={containerQuantity} onChange={(event) => setContainerQuantity(event.target.value)} placeholder="Optional if not yet confirmed" /></FormField>
        <FormField label="Cargo description"><input value={cargoDescription} onChange={(event) => setCargoDescription(event.target.value)} /></FormField>
        <FormField label="Cartons"><input min="0" type="number" value={cartons} onChange={(event) => setCartons(event.target.value)} /></FormField>
        <FormField label="Pallets"><input min="0" type="number" value={pallets} onChange={(event) => setPallets(event.target.value)} /></FormField>
        <FormField label="CBM"><input min="0" step="0.1" type="number" value={cbm} onChange={(event) => setCbm(event.target.value)} /></FormField>
        <FormField label="Weight (kg)"><input min="0" step="0.1" type="number" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} /></FormField>
        <FormField label="BL reference"><input value={blReference} onChange={(event) => setBlReference(event.target.value)} /></FormField>
        <FormField label="HBL reference"><input value={hblReference} onChange={(event) => setHblReference(event.target.value)} /></FormField>
        <FormField label="MBL reference"><input value={mblReference} onChange={(event) => setMblReference(event.target.value)} /></FormField>
        <FormField label="Pickup requirements"><textarea value={pickupRequirements} onChange={(event) => setPickupRequirements(event.target.value)} rows={2} /></FormField>
        <FormField label="Delivery requirements"><textarea value={deliveryRequirements} onChange={(event) => setDeliveryRequirements(event.target.value)} rows={2} /></FormField>
        <label className="exception-check"><input checked={warehouseRequired} onChange={(event) => setWarehouseRequired(event.target.checked)} type="checkbox" /> Warehouse required</label>
      </div>}
      {step === 3 && <div className="review-panel">
        <h2>Review before saving</h2><p>Job Number will be generated as <strong>{generateJobNumber(state)}</strong>.</p>
        <div className="review-grid"><span>Customer<strong>{selectedCustomer?.name}</strong></span><span>Quotation<strong>{quotationId ? state.quotations.find((quote) => quote.id === quotationId)?.reference : 'Exception path'}</strong></span><span>Shipment<strong>{shipmentReference || 'Missing'}</strong></span><span>Direction / mode<strong>{direction} · {mode}</strong></span><span>Route<strong>{origin || 'Missing'} → {destination || 'Missing'}</strong></span><span>Vessel / voyage<strong>{vessel || 'Not provided'} · {voyage || 'Not provided'}</strong></span><span>ETD / ETA<strong>{etd || 'Not provided'} · {eta || 'Not provided'}</strong></span><span>Container<strong>{containerNumber || 'Not provided'}{containerNumber ? ` · ${containerType}` : ''}</strong></span><span>Cargo<strong>{cargoDescription || 'Not provided'}</strong></span><span>Measures<strong>{cartons || '—'} cartons · {pallets || '—'} pallets · {cbm || '—'} CBM · {weightKg || '—'} kg</strong></span><span>BL / HBL / MBL<strong>{blReference || '—'} · {hblReference || '—'} · {mblReference || '—'}</strong></span><span>Pickup / delivery<strong>{pickupRequirements || '—'} / {deliveryRequirements || '—'}</strong></span><span>Warehouse<strong>{warehouseRequired ? 'Required' : 'Not required'}</strong></span><span>Documents<strong>{supportingDocuments.join(', ') || 'None selected'}</strong></span></div>
        <p className="card-copy">Applicable {direction} milestones and a digital job docket will be created with the shipment.</p>
        {aiApplied && <label className="exception-check"><input checked={aiReviewed} onChange={(event) => setAiReviewed(event.target.checked)} type="checkbox" /> I reviewed the suggested and missing values and confirm these shipment details.</label>}
      </div>}
      <div className="form-actions">{step > 1 && <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 3 ? <Button onClick={() => setStep((value) => value + 1)}>Continue</Button> : <Button onClick={save}>Save job docket</Button>}</div>
    </Card>
  </>
}

function JobDetail({ job, onBack, navigate }: { job: Job; onBack: () => void; navigate: (path: string) => void }) {
  const { state, dispatch } = useAppState()
  const confirm = useConfirmation()
  const showToast = useToast()
  const [tab, setTab] = useState('Overview')
  const customer = jobCustomer(state, job)
  const shipment = state.shipments.find((item) => item.jobId === job.id)
  const forwarding = state.forwardingRecords.find((item) => item.jobId === job.id)
  const container = state.containers.find((item) => item.jobId === job.id)
  const customs = state.customsRecords.find((item) => item.jobId === job.id)
  const trips = state.trips.filter((item) => item.jobId === job.id)
  const outboundOrders = state.outboundOrders.filter((item) => item.jobId === job.id)
  const costs = state.supplierCosts.filter((item) => item.jobId === job.id)
  const charges = getAllBillableCharges(state).filter((item) => item.jobId === job.id)
  const invoices = state.customerInvoices.filter((item) => item.jobId === job.id)
  const supplierInvoices = state.supplierInvoices.filter((item) => item.jobId === job.id)
  const financials = calculateJobFinancials(state, job.id)
  const docs = state.documents.filter((item) => item.jobId === job.id)
  const milestones = state.jobMilestones.filter((item) => item.jobId === job.id)
  const relatedEntityIds = new Set([job.id, shipment?.id, container?.id, customs?.id, ...trips.map((item) => item.id), ...outboundOrders.map((item) => item.id), ...docs.map((item) => item.id), ...charges.map((item) => item.id), ...costs.map((item) => item.id), ...invoices.map((item) => item.id), ...supplierInvoices.map((item) => item.id)].filter((id): id is string => Boolean(id)))
  const timeline = [
    ...state.activity.filter((event) => relatedEntityIds.has(event.entityId)),
    ...state.shipmentMilestones.filter((milestone) => milestone.jobId === job.id).map((milestone) => ({ id: milestone.id, entityType: milestone.source, entityId: milestone.jobId, action: milestone.title, actor: milestone.source, occurredAt: milestone.occurredAt })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const billingStatus = invoices.some((invoice) => ['approved', 'finalised', 'paid'].includes(invoice.status))
    ? 'Invoice approved / finalised'
    : invoices.length ? 'Invoice in review'
      : charges.length ? 'Charges not invoiced'
        : 'No billable charges'
  const updateStatus = async (status: JobStatus) => { const accepted = await confirm({ title: `${status === 'cancelled' ? 'Cancel' : 'Close'} job ${job.jobNumber}?`, message: 'This status change will be recorded in the activity history.', confirmLabel: status === 'cancelled' ? 'Cancel job' : 'Close job', variant: status === 'cancelled' ? 'destructive' : 'warning', warningIcon: true }, async () => undefined); if (accepted) { dispatch({ type: 'update-job-status', jobId: job.id, status }); dispatch({ type: 'add-activity', activity: { id: generateStableId('act', state.activity), entityType: 'job', entityId: job.id, action: `Job status changed to ${status}`, actor: 'Aina Noor', occurredAt: `${state.demoDate}T09:00:00Z` } }); showToast(`${job.jobNumber} updated to ${status}.`) } }
  const updateMilestone = (milestoneId: string, status: 'pending' | 'in-progress' | 'completed') => {
    const milestone = milestones.find((item) => item.id === milestoneId)
    if (!milestone || milestone.status === status) return
    dispatch({ type: 'update-job-milestone', milestone: { ...milestone, status, owner: 'Aina Noor', updatedAt: `${state.demoDate}T09:00:00Z`, completedAt: status === 'completed' ? `${state.demoDate}T09:00:00Z` : undefined } })
    dispatch({ type: 'add-activity', activity: { id: generateStableId('act', state.activity), entityType: 'job', entityId: job.id, action: `Milestone "${milestone.title}" changed to ${status}`, actor: 'Aina Noor', occurredAt: `${state.demoDate}T09:00:00Z` } })
    showToast(`${milestone.title} updated.`)
  }
  const quote = state.quotations.find((item) => item.id === job.quotationId)
  const tabs = ['Overview', 'Operations', 'Cost Centre', 'Documents', 'Activity']

  return <>
    <PageHeader
      eyebrow="Job detail"
      title={job.jobNumber}
      description={`${customer?.name ?? 'Unknown customer'} · ${job.serviceType} · opened ${job.openedDate}`}
      actions={<>
        <Button variant="secondary" onClick={onBack}>Back to jobs</Button>
        {job.status !== 'completed' && <Button onClick={() => void updateStatus('completed')}>Close job</Button>}
        {job.status !== 'cancelled' && <Button variant="danger" onClick={() => void updateStatus('cancelled')}>Cancel</Button>}
      </>}
    />
    <div className="detail-tabs">
      {tabs.map((item) => <button className={tab === item ? 'detail-tab detail-tab--active' : 'detail-tab'} key={item} onClick={() => setTab(item)} type="button">{item}</button>)}
    </div>
    <div className="job-related-links">
      <Button variant="secondary" onClick={() => navigate(`/app/forwarding?jobId=${job.id}`)}>Shipment {shipment?.reference ?? '·'}</Button>
      <Button variant="secondary" onClick={() => navigate('/app/customs')}>Customs {customs?.status ?? '·'}</Button>
      <Button variant="secondary" onClick={() => navigate('/app/containers')}>Container {container?.containerNumber ?? '·'}</Button>
      <Button variant="secondary" onClick={() => navigate(`/app/haulage?jobId=${job.id}`)}>Trips {trips.length || '·'}</Button>
      <Button variant="secondary" onClick={() => navigate(`/app/warehouse?jobId=${job.id}`)}>Warehouse records</Button>
      <Button variant="secondary" onClick={() => navigate('/app/documents')}>Documents {docs.length}</Button>
      <Button variant="secondary" onClick={() => navigate('/app/expenses')}>Costs {costs.length} · supplier invoices {supplierInvoices.length}</Button>
      <Button variant="secondary" onClick={() => navigate('/app/billing')}>Charges {charges.length} · customer invoices {invoices.length}</Button>
      <Button variant="secondary" onClick={() => navigate('/app/job-costing')}>Job costing RM {financials.grossProfit.toLocaleString('en-MY')}</Button>
    </div>
    {tab === 'Overview' && <div className="content-grid content-grid--wide">
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Job overview</p><h2>{job.jobNumber}</h2></div><StatusBadge tone={statusTone(job.status)}>{job.status}</StatusBadge></div>
        <div className="detail-grid">
          <span>Customer<strong>{customer?.name ?? 'Unknown customer'}</strong></span>
          <span>Quotation<strong>{quote?.reference ?? 'Exception path'}</strong></span>
          <span>Service scope<strong>{quote?.lines.map((line) => line.description).join(', ') || job.serviceType}</strong></span>
          <span>Shipment<strong>{shipment?.reference ?? 'Not linked'}</strong></span>
          <span>Route<strong>{shipment ? `${shipment.origin} → ${shipment.destination}` : 'Not entered'}</strong></span>
          <span>Operational status<strong>{job.status.replaceAll('-', ' ')}</strong></span>
          <span>Customs status<strong>{customs?.status ?? 'Not started'}</strong></span>
          <span>Billing status<strong>{billingStatus}</strong></span>
        </div>
      </Card>
      <Card>
        <p className="eyebrow">Job costing summary</p><h2>RM {financials.grossProfit.toLocaleString('en-MY')} gross profit</h2>
        <p className="card-copy">Calculated from shared job transactions; invoices and vouchers do not add revenue or cost a second time.</p>
        <div className="finance-summary">
          <div><span>Invoiced revenue</span><strong>RM {financials.revenue.toLocaleString('en-MY')}</strong></div>
          <div><span>Cost</span><strong>RM {financials.cost.toLocaleString('en-MY')}</strong></div>
          <div><span>Unbilled charges</span><strong>RM {financials.unbilledCharges.toLocaleString('en-MY')}</strong></div>
          <div><span>Margin</span><strong>{(financials.margin * 100).toFixed(1)}%</strong></div>
        </div>
      </Card>
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Warehouse outbound</p><h2>Delivery orders · picking · POD</h2></div><Button variant="secondary" onClick={() => navigate(`/app/warehouse?jobId=${job.id}`)}>Open outbound workflow</Button></div>
        {outboundOrders.length ? <DataTable headers={['Delivery order', 'SKU / quantity', 'Picking', 'Packing', 'Loading', 'Dispatch', 'Trip / driver', 'POD']} rows={outboundOrders.map((order) => {
          const inventory = state.inventory.find((item) => item.id === order.inventoryId)
          const linkedTrips = trips.filter((trip) => trip.outboundOrderId === order.id)
          const latestTrip = linkedTrips.at(-1)
          return [
            order.deliveryOrderNumber,
            `${inventory?.sku ?? 'Unknown'} · ${order.dispatchedQuantity ?? 0}/${order.quantity} ${order.unit} dispatched`,
            <StatusBadge tone={order.pickingStatus === 'completed' ? 'success' : order.pickingStatus === 'discrepancy' ? 'warning' : 'neutral'}>{order.pickingStatus ?? 'pending'}</StatusBadge>,
            <StatusBadge tone={order.packingStatus === 'completed' ? 'success' : 'neutral'}>{order.packingStatus ?? 'pending'}</StatusBadge>,
            <StatusBadge tone={order.loadingStatus === 'completed' ? 'success' : 'neutral'}>{order.loadingStatus ?? 'pending'}</StatusBadge>,
            <StatusBadge tone={order.dispatchStatus === 'dispatched' ? 'success' : order.dispatchStatus === 'partial' ? 'warning' : 'neutral'}>{order.dispatchStatus ?? order.status}</StatusBadge>,
            latestTrip ? `${latestTrip.tripNumber} · ${state.drivers.find((driver) => driver.id === latestTrip.driverId)?.name ?? 'Unassigned'}` : 'Not assigned',
            <StatusBadge tone={order.podStatus === 'verified' ? 'success' : order.podStatus === 'received' ? 'warning' : 'neutral'}>{order.podStatus ?? 'pending'}</StatusBadge>,
          ]
        })} /> : <p className="card-copy">No warehouse delivery orders are linked to this job.</p>}
      </Card>
    </div>}
    {tab === 'Operations' && <div className="content-grid content-grid--wide">
      {shipment && <ExistingJobShipmentExtraction job={job} shipment={shipment} />}
      <Card>
        <p className="eyebrow">Shipment and container</p><h2>{shipment?.reference ?? 'No shipment linked'}</h2>
        <p className="card-copy">{shipment ? `${shipment.origin} → ${shipment.destination}` : 'Create a shipment in the guided flow.'}</p>
        {shipment && <div className="detail-grid">
          <span>Vessel / voyage<strong>{shipment.vessel || forwarding?.vessel || container?.vessel || 'Not provided'} · {shipment.voyage || forwarding?.voyage || container?.voyage || 'Not provided'}</strong></span>
          <span>ETD / ETA<strong>{shipment.etd || forwarding?.etd || 'Not provided'} · {shipment.eta || forwarding?.eta || 'Not provided'}</strong></span>
          <span>Container<strong>{container?.containerNumber ?? 'Not linked'}{container ? ` · ${container.size}` : ''}</strong></span>
          <span>Cargo<strong>{shipment.cargoDescription || 'Not entered'}</strong></span>
          <span>Measures<strong>{shipment.cartons ?? '—'} cartons · {shipment.pallets ?? '—'} pallets · {shipment.cbm ?? '—'} CBM · {shipment.weightKg ?? '—'} kg</strong></span>
          <span>BL / HBL / MBL<strong>{shipment.blReference || forwarding?.bl || '—'} · {shipment.hblReference || forwarding?.hbl || '—'} · {shipment.mblReference || forwarding?.mbl || '—'}</strong></span>
          <span>Pickup / delivery<strong>{shipment.pickupRequirements || '—'} / {shipment.deliveryRequirements || '—'}</strong></span>
          <span>Warehouse<strong>{shipment.warehouseRequired ? 'Required' : 'Not required'}</strong></span>
        </div>}
        {container && <StatusBadge tone="info">{container.containerNumber} · {container.movementStatus}</StatusBadge>}
        <div className="job-related-links">
          <Button variant="secondary" onClick={() => navigate(`/app/forwarding?jobId=${job.id}`)}>Open forwarding details</Button>
          <Button variant="secondary" onClick={() => navigate('/app/documents')}>Open digital folder</Button>
        </div>
      </Card>
      <Card>
        <p className="eyebrow">Import / export workflow</p><h2>{shipment?.direction ?? 'Shipment'} milestones</h2>
        {milestones.length ? <DataTable headers={['Milestone', 'Status', 'Owner', 'Last updated']} rows={milestones.map((milestone) => [
          milestone.title,
          <select aria-label={`Update ${milestone.title} status`} value={milestone.status} onChange={(event) => updateMilestone(milestone.id, event.target.value as 'pending' | 'in-progress' | 'completed')}>
            <option value="pending">Pending</option><option value="in-progress">In progress</option><option value="completed">Completed</option>
          </select>,
          milestone.owner,
          milestone.completedAt ?? milestone.updatedAt,
        ])} /> : <p className="card-copy">No workflow template is assigned to this shipment yet.</p>}
        <p className="form-hint">Customs, operational and billing statuses are tracked separately.</p>
      </Card>
      <Card><p className="eyebrow">Trips and driver assignments</p><h2>{trips.length ? `${trips.length} linked trip${trips.length === 1 ? '' : 's'}` : 'No trip linked'}</h2>{trips.length ? <DataTable headers={['Trip', 'Route', 'Driver / assignment', 'Schedule', 'Status', 'Open']} rows={trips.map((trip) => [trip.tripNumber, `${trip.pickup} → ${trip.delivery}`, trip.subcontractor ? trip.subcontractorName ?? 'Subcontractor' : state.drivers.find((driver) => driver.id === trip.driverId)?.name ?? 'Unassigned', `${trip.plannedPickup ? new Date(trip.plannedPickup).toLocaleString('en-MY') : 'Not scheduled'} → ${trip.plannedDelivery ? new Date(trip.plannedDelivery).toLocaleString('en-MY') : 'Not scheduled'}`, trip.status.replaceAll('-', ' '), <Button variant="ghost" onClick={() => navigate(`/app/haulage?jobId=${job.id}&tripId=${trip.id}`)}>Details</Button>])} /> : <p className="card-copy">No haulage trip linked yet.</p>}<Button variant="outline" onClick={() => navigate(`/app/haulage?jobId=${job.id}`)}>Plan another trip</Button></Card>
    </div>}
    {tab === 'Cost Centre' && <Card>
      <p className="eyebrow">Charges and supplier costs</p><h2>Cost records</h2>
      <DataTable headers={['Type', 'Description', 'Amount', 'Status']} rows={[
        ...charges.map((charge) => {
          const linkedInvoice = invoices.find((invoice) => invoice.lines.some((line) => line.chargeId === charge.id))
          const billingLabel = linkedInvoice ? linkedInvoice.status === 'draft' || linkedInvoice.status === 'pending-approval' ? `Invoice ${linkedInvoice.status}` : `Invoiced · ${linkedInvoice.status}` : charge.approved ? 'Eligible · unbilled' : 'Not approved'
          return ['Customer charge', charge.description, `RM ${(charge.quantity * charge.unitPrice).toLocaleString('en-MY')}`, <StatusBadge tone={linkedInvoice && ['approved', 'finalised', 'paid'].includes(linkedInvoice.status) ? 'success' : charge.approved ? 'warning' : 'neutral'}>{billingLabel}</StatusBadge>]
        }),
        ...costs.map((cost) => {
          const costStatus = cost.classification === 'estimated' ? 'Estimate' : cost.approvalStatus ?? (cost.posted ? 'posted' : 'pending')
          return ['Supplier cost', cost.description, `RM ${cost.amount.toLocaleString('en-MY')}`, <StatusBadge tone={cost.classification === 'estimated' ? 'neutral' : ['approved', 'posted'].includes(costStatus) ? 'success' : 'warning'}>{costStatus}</StatusBadge>]
        }),
        ...invoices.map((invoice) => ['Customer invoice', invoice.invoiceNumber, `RM ${calculateInvoiceTotals(invoice).total.toLocaleString('en-MY')}`, <StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>]),
        ...state.tripExpenses.filter((expense) => expense.jobId === job.id).map((expense) => ['Driver expense', expense.description, `RM ${expense.amount.toLocaleString('en-MY')}`, <StatusBadge tone={expense.status === 'approved' || expense.status === 'paid' ? 'success' : 'warning'}>{expense.status}</StatusBadge>]),
        ...state.reimbursements.filter((request) => request.jobId === job.id).map((request) => ['Reimbursement', request.description, `RM ${request.amount.toLocaleString('en-MY')}`, <StatusBadge tone={request.status === 'approved' || request.status === 'paid' ? 'success' : 'warning'}>{request.status}</StatusBadge>]),
        ...supplierInvoices.map((invoice) => ['Supplier invoice', invoice.reference, `RM ${invoice.amount.toLocaleString('en-MY')}`, <StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>]),
      ]} />
    </Card>}
    {tab === 'Documents' && <Card>
      <p className="eyebrow">Digital job folder</p><h2>Documents and checklist</h2>
      {docs.length ? <DataTable headers={['Document', 'Category', 'Status', 'Uploaded']} rows={docs.map((doc) => [doc.name, doc.category, <StatusBadge tone={doc.status === 'available' ? 'success' : 'warning'}>{doc.status}</StatusBadge>, doc.uploadedAt])} /> : <p className="empty-state">No documents are linked to this job.</p>}
    </Card>}
    {tab === 'Activity' && <Card>
      <p className="eyebrow">Audit trail</p><h2>Activity timeline</h2>
      {timeline.length ? <ul className="activity-list">{timeline.map((event) => <li key={event.id}><span className="activity-icon activity-icon--blue">↗</span><div><strong>{event.action}</strong><small>{event.actor} · {event.occurredAt}</small></div></li>)}</ul> : <p className="empty-state">No activity has been recorded for this job yet.</p>}
    </Card>}
  </>
}

export function JobManagement({ navigate, initialJobId }: { navigate: (path: string) => void; initialJobId?: string }) {
  const { state } = useAppState()
  const initialJob = state.jobs.find((job) => job.id === initialJobId)
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>(initialJobId ? 'detail' : 'list')
  const [selected, setSelected] = useState<Job | undefined>(() => initialJob)
  useEffect(() => {
    setSelected(initialJob)
    setMode(initialJob ? 'detail' : 'list')
  }, [initialJobId, initialJob])
  const currentSelected = selected ? state.jobs.find((job) => job.id === selected.id) ?? selected : undefined
  if (mode === 'create') return <JobCreate onCancel={() => setMode('list')} onSaved={(job) => { setSelected(job); setMode('detail') }} />
  if (mode === 'detail' && currentSelected) return <JobDetail job={currentSelected} onBack={() => { setSelected(undefined); setMode('list') }} navigate={navigate} />
  return <JobList onCreate={() => setMode('create')} onDetail={(job) => { setSelected(job); setMode('detail') }} />
}
