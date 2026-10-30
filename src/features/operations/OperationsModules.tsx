import { useState } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { useConfirmation } from '../../../components/useConfirmation.ts'
import { calculateHaulageProfitLoss, calculateJobFinancials } from '../../domain/calculations.ts'
import type { Container, CustomsRecord, Driver, ForwardingRecord, Trailer, Trip, Truck } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { canTransitionTrip, tripAvailability, validateTripPlan } from '../../domain/tripPlanning.ts'
import './TripDetail.css'

const tone = (value: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => ['Delivered', 'completed', 'released', 'approved', 'empty-returned'].includes(value) ? 'success' : ['inspection', 'at-port', 'In-Transit', 'in-progress', 'pending', 'submitted'].includes(value) ? 'warning' : ['cancelled', 'hold'].includes(value) ? 'danger' : 'info'
const trackingDate = (value?: string) => {
  if (!value) return 'Not recorded'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}
const trackingDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const trackingDaysUntil = (date: string | undefined, referenceDate: string) => {
  if (!date) return undefined
  const expiry = Date.parse(`${date}T00:00:00Z`)
  const reference = Date.parse(`${referenceDate}T00:00:00Z`)
  return Number.isNaN(expiry) || Number.isNaN(reference) ? undefined : Math.ceil((expiry - reference) / 86_400_000)
}

function Shell({ title, description, children, action }: { title: string; description: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <><PageHeader eyebrow="Operations" title={title} description={description} actions={action} />{children}</>
}

function Forwarding({ initialJobId }: { initialJobId?: string }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ForwardingRecord | undefined>(() => state.forwardingRecords.find((record) => record.jobId === initialJobId))
  const [editing, setEditing] = useState(false)
  const [milestone, setMilestone] = useState('Cargo received')
  const linkedShipment = state.shipments.find((shipment) => shipment.jobId === initialJobId)
  const rows = state.forwardingRecords.filter((record) => (!initialJobId || record.jobId === initialJobId) && `${record.bookingReference} ${record.vessel} ${record.customerId}`.toLowerCase().includes(query.toLowerCase()))
  if (editing) return <ForwardingForm existing={selected} initialJobId={initialJobId} onDone={() => setEditing(false)} />
  if (selected) {
    const job = state.jobs.find((item) => item.id === selected.jobId)
    const shipment = state.shipments.find((item) => item.id === selected.shipmentId)
    const container = state.containers.find((item) => item.jobId === selected.jobId)
    const customer = state.customers.find((item) => item.id === selected.customerId)
    const shipmentStatus = shipment?.status ?? 'Not provided'
    const containerStatus = container?.movementStatus ?? 'Not provided'
    const recordMilestone = () => {
      if (!shipment || selected.milestones.some((item) => item.toLowerCase().startsWith(milestone.toLowerCase()))) {
        showToast(!shipment ? 'The forwarding booking has no linked shipment.' : 'That milestone has already been recorded.')
        return
      }
      const occurredAt = `${state.demoDate}T10:00:00Z`
      const updatedRecord = { ...selected, milestones: [...selected.milestones, `${milestone} · ${state.demoDate}`] }
      dispatch({ type: 'update-forwarding', record: updatedRecord })
      if (['Vessel departed', 'In transit'].includes(milestone)) dispatch({ type: 'update-shipment', shipment: { ...shipment, status: 'In-Transit' } })
      if (milestone === 'Delivery completed') dispatch({ type: 'update-shipment', shipment: { ...shipment, status: 'Delivered' } })
      dispatch({ type: 'add-shipment-milestone', milestone: { id: generateRecordId(state, 'shipmentMilestones'), shipmentId: shipment.id, jobId: selected.jobId, title: milestone, occurredAt, source: 'forwarding', sourceRecordId: selected.id, customerVisible: true } })
      if (container && milestone === 'Discharged at port') {
        dispatch({ type: 'update-container', container: { ...container, movementStatus: 'at-port' } })
        dispatch({ type: 'add-container-event', event: { id: generateRecordId(state, 'containerEvents'), containerId: container.id, status: 'at-port', location: container.port, occurredAt, note: milestone } })
      }
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'forwarding', entityId: selected.id, action: `${milestone} · ${selected.bookingReference}`, actor: 'Forwarding operations', occurredAt } })
      setSelected(updatedRecord)
      showToast(`${milestone} recorded against ${shipment.reference}.`)
    }
    const milestoneOptions = ['Booking confirmed', 'Cargo received', 'Loaded on vessel', 'Vessel departed', 'In transit', 'Discharged at port', 'Cargo released', 'Delivery completed']
    return (
      <Shell
        title={selected.bookingReference}
        description="Forwarding detail, milestones and linked container records."
        action={<Button variant="secondary" onClick={() => setSelected(undefined)}>Back to forwarding</Button>}
      >
        <div className="forwarding-detail-layout">
          <Card className="forwarding-detail-card">
            <div className="forwarding-detail__heading">
              <div>
                <p className="eyebrow">Booking details</p>
                <h2>Shipment information</h2>
              </div>
              <div className="forwarding-detail__status">
                <small>Shipment status</small>
                <StatusBadge tone={tone(shipmentStatus)}>{shipmentStatus}</StatusBadge>
              </div>
            </div>
            <section className="forwarding-detail__section" aria-labelledby="forwarding-shipment-heading">
              <h3 id="forwarding-shipment-heading">Shipment</h3>
              <dl className="forwarding-detail__facts">
                <div><dt>Job number</dt><dd>{job?.jobNumber ?? 'Not provided'}</dd></div>
                <div><dt>Customer</dt><dd>{customer?.name ?? 'Not provided'}</dd></div>
                <div><dt>Shipment reference</dt><dd>{shipment?.reference ?? 'Not provided'}</dd></div>
                <div><dt>Transport</dt><dd>{selected.mode} · {selected.direction}</dd></div>
                <div><dt>Route</dt><dd>{shipment ? `${shipment.origin} → ${shipment.destination}` : 'Not provided'}</dd></div>
                <div><dt>Cargo description</dt><dd>{shipment?.cargoDescription || 'Not provided'}</dd></div>
                <div><dt>Transshipment</dt><dd>{selected.transshipment ? 'Yes' : 'No'}</dd></div>
                <div><dt>Carrier</dt><dd>{selected.carrier || 'Not provided'}</dd></div>
                <div><dt>Vessel / voyage</dt><dd>{selected.vessel || 'Not provided'} / {selected.voyage || 'Not provided'}</dd></div>
                <div><dt>ETD</dt><dd>{selected.etd || shipment?.etd || 'Not provided'}</dd></div>
                <div><dt>ETA</dt><dd>{selected.eta || shipment?.eta || 'Not provided'}</dd></div>
                <div><dt>Container</dt><dd>{container?.containerNumber ?? 'Not linked'}</dd></div>
                <div><dt>Container size</dt><dd>{container?.size ?? shipment?.containerType ?? 'Not provided'}</dd></div>
                <div><dt>Port / location</dt><dd>{container?.port ?? 'Not provided'}</dd></div>
                <div><dt>Container status</dt><dd>{containerStatus}</dd></div>
                <div><dt>Free days</dt><dd>{selected.freeDays} days{container?.freeTimeExpiryDate ? ` · expires ${container.freeTimeExpiryDate}` : ''}</dd></div>
                <div><dt>Demurrage</dt><dd>RM {selected.demurrageRate.toLocaleString('en-MY')} / day</dd></div>
                <div><dt>Detention</dt><dd>RM {selected.detentionRate.toLocaleString('en-MY')} / day</dd></div>
                <div><dt>BL / HBL / MBL</dt><dd>{selected.bl || shipment?.blReference || '—'} / {selected.hbl || shipment?.hblReference || '—'} / {selected.mbl || shipment?.mblReference || '—'}</dd></div>
                <div><dt>Cargo quantity</dt><dd>{[
                  shipment?.containerQuantity ? `${shipment.containerQuantity} containers` : undefined,
                  shipment?.cartons ? `${shipment.cartons} cartons` : undefined,
                  shipment?.pallets ? `${shipment.pallets} pallets` : undefined,
                  shipment?.cbm ? `${shipment.cbm} CBM` : undefined,
                  shipment?.weightKg ? `${shipment.weightKg.toLocaleString('en-MY')} kg` : undefined,
                ].filter(Boolean).join(' · ') || 'Not provided'}</dd></div>
              </dl>
            </section>
          </Card>
          <Card className="forwarding-detail-card forwarding-detail-card--milestones">
            <div className="forwarding-detail__heading">
              <div>
                <p className="eyebrow">Shipment milestones</p>
                <h2>{container?.containerNumber ?? shipment?.reference ?? 'Shipment timeline'}</h2>
              </div>
              <div className="forwarding-detail__status">
                <small>Container status</small>
                <StatusBadge tone={tone(containerStatus)}>{containerStatus}</StatusBadge>
              </div>
            </div>
            {selected.milestones.length > 0 ? (
              <ol className="forwarding-detail__timeline">
                {selected.milestones.map((item, index) => {
                  const [title, recordedDate] = item.split(' · ')
                  const eventDate = recordedDate ?? state.shipmentMilestones.find((event) =>
                    event.shipmentId === shipment?.id && event.sourceRecordId === selected.id && event.title === title,
                  )?.occurredAt.slice(0, 10)
                  return (
                    <li className="forwarding-detail__milestone" key={item}>
                      <span className="forwarding-detail__milestone-marker" aria-hidden="true">{index + 1}</span>
                      <div>
                        <strong>{title}</strong>
                        {eventDate && <small>{eventDate}</small>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="forwarding-detail__empty">No forwarding milestones have been recorded yet.</p>
            )}
            <div className="forwarding-detail__recorder">
              <FormField label="Record forwarding milestone">
                <select value={milestone} onChange={(event) => setMilestone(event.target.value)}>
                  {milestoneOptions
                    .filter((option) => !selected.milestones.some((item) => item.toLowerCase().startsWith(option.toLowerCase())))
                    .map((option) => <option key={option}>{option}</option>)}
                </select>
              </FormField>
              <Button variant="secondary" onClick={recordMilestone}>Record milestone</Button>
            </div>
          </Card>
        </div>
      </Shell>
    )
  }
  return <Shell title="Freight Forwarding" description="Bookings, bills of lading, vessels, free days and shipment milestones." action={<Button onClick={() => { setSelected(undefined); setEditing(true) }}>＋ New booking</Button>}>{initialJobId && linkedShipment && !rows.length && <Card className="workflow-callout"><div><strong>{state.jobs.find((job) => job.id === initialJobId)?.jobNumber} · {linkedShipment.reference}</strong><p>Shipment details are shared with Job Management. Create a forwarding booking to add carrier and vessel details without creating another shipment.</p></div><Button onClick={() => { setSelected(undefined); setEditing(true) }}>Create linked booking</Button></Card>}<Card><div className="filter-bar"><input aria-label="Search forwarding" onChange={(event) => setQuery(event.target.value)} placeholder="Search booking, vessel or customer..." value={query} /><select aria-label="Filter shipment mode"><option>All modes</option><option>FCL</option><option>LCL</option></select></div><DataTable headers={['Booking', 'Job Number', 'Customer', 'Mode', 'Vessel / voyage', 'ETA', 'Container', 'Status', 'Action']} rows={rows.map((record) => [record.bookingReference, state.jobs.find((job) => job.id === record.jobId)?.jobNumber, state.customers.find((customer) => customer.id === record.customerId)?.name, `${record.mode} · ${record.direction}`, `${record.vessel || 'Not provided'} / ${record.voyage || 'Not provided'}`, record.eta || 'Not provided', state.containers.find((container) => container.jobId === record.jobId)?.containerNumber ?? 'Pending', <StatusBadge tone={tone(record.milestones.at(-1) ?? 'pending')}>{record.milestones.at(-1) ?? 'Booking created'}</StatusBadge>, <div className="table-actions"><Button variant="ghost" onClick={() => setSelected(record)}>Details</Button><Button variant="ghost" onClick={() => { setSelected(record); setEditing(true) }}>Edit</Button></div>])} />{!rows.length && !initialJobId && <p className="empty-state">No forwarding bookings match this search.</p>}</Card></Shell>
}

function ForwardingForm({ existing, initialJobId, onDone }: { existing?: ForwardingRecord; initialJobId?: string; onDone: () => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const targetJob = state.jobs.find((job) => job.id === initialJobId) ?? state.jobs[0]
  const targetShipment = state.shipments.find((shipment) => shipment.jobId === targetJob?.id)
  const base = existing ?? { id: generateRecordId(state, 'forwardingRecords'), jobId: targetJob?.id ?? '', bookingReference: `BK-DEMO-${state.forwardingRecords.length + 1}`, shipmentId: targetShipment?.id ?? '', customerId: targetJob?.customerId ?? '', mode: targetShipment?.mode === 'LCL' ? 'LCL' as const : 'FCL' as const, direction: targetShipment?.direction ?? 'import' as const, transshipment: false, carrier: '', vessel: targetShipment?.vessel ?? '', voyage: targetShipment?.voyage ?? '', etd: targetShipment?.etd ?? '', eta: targetShipment?.eta ?? '', mbl: targetShipment?.mblReference ?? '', hbl: targetShipment?.hblReference ?? '', bl: targetShipment?.blReference ?? '', freeDays: 3, demurrageRate: 180, detentionRate: 150, milestones: [] }
  const [form, setForm] = useState(base)
  const update = (key: keyof ForwardingRecord, value: string) => setForm((current) => ({ ...current, [key]: ['freeDays', 'demurrageRate', 'detentionRate'].includes(key) ? Number(value) : value }))
  const availableShipments = state.shipments.filter((shipment) => shipment.jobId === form.jobId)
  return <Shell title={existing ? 'Edit forwarding booking' : 'Create forwarding booking'} description="Maintain booking details on the existing shared shipment. Unknown vessel and schedule details remain blank." action={<Button variant="secondary" onClick={onDone}>Cancel</Button>}><Card className="form-card"><div className="form-grid form-grid--three"><FormField label="Job"><select value={form.jobId} onChange={(event) => { const job = state.jobs.find((item) => item.id === event.target.value); const shipment = state.shipments.find((item) => item.jobId === event.target.value); setForm((current) => ({ ...current, jobId: event.target.value, customerId: job?.customerId ?? current.customerId, shipmentId: shipment?.id ?? '', direction: shipment?.direction ?? current.direction })) }}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Booking reference"><input value={form.bookingReference} onChange={(event) => update('bookingReference', event.target.value)} /></FormField><FormField label="Shipment"><select value={form.shipmentId} onChange={(event) => update('shipmentId', event.target.value)}>{availableShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.reference}</option>)}</select></FormField><FormField label="Mode"><select value={form.mode} onChange={(event) => update('mode', event.target.value)}><option>FCL</option><option>LCL</option></select></FormField><FormField label="Direction"><select value={form.direction} onChange={(event) => update('direction', event.target.value)}><option>import</option><option>export</option></select></FormField><FormField label="Carrier / co-loader"><input value={form.carrier} onChange={(event) => update('carrier', event.target.value)} /></FormField><FormField label="Vessel"><input value={form.vessel} onChange={(event) => update('vessel', event.target.value)} /></FormField><FormField label="Voyage"><input value={form.voyage} onChange={(event) => update('voyage', event.target.value)} /></FormField><FormField label="ETD"><input type="date" value={form.etd} onChange={(event) => update('etd', event.target.value)} /></FormField><FormField label="ETA"><input type="date" value={form.eta} onChange={(event) => update('eta', event.target.value)} /></FormField><FormField label="HBL"><input value={form.hbl} onChange={(event) => update('hbl', event.target.value)} /></FormField><FormField label="MBL"><input value={form.mbl} onChange={(event) => update('mbl', event.target.value)} /></FormField><FormField label="Free days"><input type="number" value={form.freeDays} onChange={(event) => update('freeDays', event.target.value)} /></FormField><FormField label="Demurrage / day"><input type="number" value={form.demurrageRate} onChange={(event) => update('demurrageRate', event.target.value)} /></FormField><FormField label="Detention / day"><input type="number" value={form.detentionRate} onChange={(event) => update('detentionRate', event.target.value)} /></FormField></div><div className="form-actions"><Button onClick={() => { if (!form.bookingReference.trim() || !form.shipmentId || !state.shipments.some((shipment) => shipment.id === form.shipmentId && shipment.jobId === form.jobId)) { showToast('Choose a linked shipment and enter a booking reference.'); return } const shipment = state.shipments.find((item) => item.id === form.shipmentId); const record = { ...form, vessel: form.vessel || shipment?.vessel || '', voyage: form.voyage || shipment?.voyage || '', etd: form.etd || shipment?.etd || '', eta: form.eta || shipment?.eta || '', bl: form.bl || shipment?.blReference || '', hbl: form.hbl || shipment?.hblReference || '', mbl: form.mbl || shipment?.mblReference || '' }; dispatch({ type: existing ? 'update-forwarding' : 'add-forwarding', record }); showToast('Forwarding booking saved to the linked job shipment.'); onDone() }}>Save booking</Button></div></Card></Shell>
}

function Customs() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [selected, setSelected] = useState<CustomsRecord | undefined>()
  const [creating, setCreating] = useState(false)
  const records = state.customsRecords
  const progress = ['K1', 'Duty', 'SSR', 'Customs Approval', 'EDO', 'Gate Pass', 'Release']
  if (creating) return <CustomsRecordForm onCancel={() => setCreating(false)} onSaved={(record) => { setSelected(record); setCreating(false) }} />
  if (selected) {
    const job = state.jobs.find((item) => item.id === selected.jobId)
    const container = state.containers.find((item) => item.jobId === selected.jobId)
    const missingDocuments = selected.missingDocuments ?? []
    const checklistDocuments = missingDocuments.length
      ? missingDocuments
      : ['K1 declaration', 'Packing list', 'Commercial invoice']
    const currentIndex = selected.status === 'released' ? 6 : selected.status === 'approved' ? 3 : selected.status === 'inspection' ? 2 : selected.status === 'submitted' ? 1 : 0
    const nextStatus: CustomsRecord['status'] | undefined = selected.status === 'draft' ? 'submitted' : selected.status === 'submitted' ? 'inspection' : selected.status === 'inspection' ? 'approved' : selected.status === 'approved' ? 'released' : undefined
    const updateRecord = (record: CustomsRecord, action: string) => {
      dispatch({ type: 'update-customs', record })
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'customs', entityId: record.id, action, actor: 'Customs operations', occurredAt: `${state.demoDate}T10:00:00Z` } })
      setSelected(record)
      showToast(action)
    }
    return (
      <Shell
        title={`Customs · ${job?.jobNumber}`}
        description="Simulated customs workflow — no authority integration."
        action={<Button variant="secondary" onClick={() => setSelected(undefined)}>Back to customs</Button>}
      >
        <Card className="customs-detail">
          <div className="detail-grid">
            <span>Job / container<strong>{job?.jobNumber} · {container?.containerNumber ?? 'Pending'}</strong></span>
            <span>Declaration<strong>{selected.declarationType}</strong></span>
            <span>Customs status<strong><StatusBadge tone={tone(selected.status)}>{selected.status}</StatusBadge></strong></span>
            <span>Duty / SST<strong>RM {selected.dutyAndSst.toLocaleString('en-MY')} · {selected.dutyStatus ?? 'unpaid'}</strong></span>
            <span>Inspection<strong>{selected.inspectionResult ?? 'pending'}</strong></span>
            <span>EDO<strong>{selected.edoStatus}</strong></span>
          </div>
          <div className="customs-detail__progress">
            <ol aria-label="Customs workflow progress" className="customs-detail__stepper">
              {progress.map((item, index) => (
                <li
                  aria-current={index === currentIndex ? 'step' : undefined}
                  className={index <= currentIndex ? 'customs-detail__step customs-detail__step--done' : 'customs-detail__step'}
                  key={item}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <small>{item}</small>
                </li>
              ))}
            </ol>
          </div>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Document checklist</p>
              <h2>Required customs documents</h2>
            </div>
            <StatusBadge tone={missingDocuments.length ? 'warning' : 'success'}>
              {missingDocuments.length ? `${missingDocuments.length} missing` : 'Complete'}
            </StatusBadge>
          </div>
          <ul className="customs-detail__checklist">
            {checklistDocuments.map((item) => {
              const isMissing = missingDocuments.includes(item)
              return (
                <li key={item}>
                  <span
                    aria-hidden="true"
                    className={isMissing ? 'customs-detail__document-marker' : 'customs-detail__document-marker customs-detail__document-marker--complete'}
                  >
                    {isMissing ? '' : '✓'}
                  </span>
                  {item}
                </li>
              )
            })}
          </ul>
          <div className="customs-detail__actions">
            {missingDocuments.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => updateRecord({
                  ...selected,
                  missingDocuments: [],
                  history: [...(selected.history ?? []), 'Required customs documents confirmed received'],
                }, 'Required customs documents confirmed received.')}
              >
                Confirm missing documents received
              </Button>
            )}
            <Button disabled={!nextStatus || missingDocuments.length > 0} onClick={() => {
              if (!nextStatus) return
              if (missingDocuments.length > 0) {
                showToast('Resolve the customs document checklist before advancing this declaration.')
                return
              }
              const next: CustomsRecord = {
                ...selected,
                status: nextStatus,
                inspectionResult: nextStatus === 'inspection' ? 'pending' : nextStatus === 'approved' ? 'passed' : selected.inspectionResult,
                edoStatus: nextStatus === 'released' ? 'released' : selected.edoStatus,
                history: [...(selected.history ?? []), `Customs status changed to ${nextStatus}`],
              }
              updateRecord(next, `Customs status changed to ${nextStatus}.`)
              const shipment = state.shipments.find((item) => item.jobId === selected.jobId)
              if (shipment) dispatch({ type: 'add-shipment-milestone', milestone: { id: generateRecordId(state, 'shipmentMilestones'), shipmentId: shipment.id, jobId: selected.jobId, title: `Customs ${nextStatus}`, occurredAt: `${state.demoDate}T10:00:00Z`, source: 'customs', sourceRecordId: selected.id, customerVisible: true } })
            }}>
              {nextStatus ? `Advance to ${nextStatus}` : 'Workflow released'}
            </Button>
          </div>
        </Card>
      </Shell>
    )
  }
  return <Shell title="Customs Clearance" description="Track K1–K8, ZB, DG, DSO, IGM, SSR, EDO, gate pass and release using a simulated workflow." action={<Button onClick={() => setCreating(true)}>＋ New customs record</Button>}><Card><DataTable headers={['Job', 'Container', 'Declaration', 'Customs status', 'Duty / SST', 'EDO', 'Next action']} rows={records.map((record) => [state.jobs.find((job) => job.id === record.jobId)?.jobNumber, state.containers.find((container) => container.jobId === record.jobId)?.containerNumber ?? '—', record.declarationType, <StatusBadge tone={tone(record.status)}>{record.status}</StatusBadge>, `RM ${record.dutyAndSst.toLocaleString('en-MY')} · ${record.dutyStatus ?? 'unpaid'}`, record.edoStatus, <Button variant="ghost" onClick={() => setSelected(record)}>Open workflow</Button>])} /></Card></Shell>
}

function CustomsRecordForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (record: CustomsRecord) => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const eligibleJobs = state.jobs.filter((job) => state.shipments.some((shipment) => shipment.jobId === job.id))
  const [jobId, setJobId] = useState(eligibleJobs[0]?.id ?? '')
  const [declarationType, setDeclarationType] = useState<CustomsRecord['declarationType']>('K1')
  const [dutyAndSst, setDutyAndSst] = useState(0)
  const [missingDocuments, setMissingDocuments] = useState('')
  const save = () => {
    if (!jobId || !Number.isFinite(dutyAndSst) || dutyAndSst < 0) { showToast('Select a linked job and enter a non-negative duty / SST amount.'); return }
    if (state.customsRecords.some((record) => record.jobId === jobId && record.declarationType === declarationType)) { showToast('A customs record with this declaration type already exists for the job.'); return }
    const record: CustomsRecord = {
      id: generateRecordId(state, 'customsRecords'),
      jobId,
      declarationType,
      status: 'draft',
      dutyAndSst,
      edoStatus: 'pending',
      dutyStatus: 'unpaid',
      inspectionResult: 'pending',
      missingDocuments: missingDocuments.split(',').map((item) => item.trim()).filter(Boolean),
      history: ['Customs record created'],
    }
    dispatch({ type: 'add-customs-record', record })
    showToast(`Customs declaration created for ${state.jobs.find((job) => job.id === jobId)?.jobNumber}.`)
    onSaved(record)
  }
  return <Shell title="New customs record" description="Create a demo declaration linked to an existing shipment and Job Number." action={<Button variant="secondary" onClick={onCancel}>Cancel</Button>}><Card className="form-card"><div className="form-grid form-grid--three"><FormField label="Job Number"><select value={jobId} onChange={(event) => setJobId(event.target.value)}>{eligibleJobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Declaration type"><select value={declarationType} onChange={(event) => setDeclarationType(event.target.value as CustomsRecord['declarationType'])}>{['K1', 'K2', 'K3', 'K4', 'K5', 'K8', 'ZB'].map((type) => <option key={type}>{type}</option>)}</select></FormField><FormField label="Duty / SST (MYR)"><input min="0" type="number" value={dutyAndSst} onChange={(event) => setDutyAndSst(Number(event.target.value))} /></FormField><FormField label="Missing documents (comma separated)"><input value={missingDocuments} onChange={(event) => setMissingDocuments(event.target.value)} placeholder="e.g. Packing list, Commercial invoice" /></FormField></div><p className="form-hint">Declaration labels are demo records and do not assert official legal meanings or external authority submission.</p><div className="form-actions"><Button onClick={save}>Create customs record</Button></div></Card></Shell>
}

function Containers() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [selected, setSelected] = useState<Container | undefined>()
  const [filter, setFilter] = useState('all')
  const rows = state.containers.filter((container) => filter === 'all' || container.movementStatus === filter)
  if (selected) {
    const shipment = state.shipments.find((item) => item.id === selected.shipmentId)
    const job = state.jobs.find((item) => item.id === selected.jobId)
    const customer = job && state.customers.find((item) => item.id === job.customerId)
    const forwarding = state.forwardingRecords.find((record) => record.shipmentId === selected.shipmentId)
    const trip = state.trips.find((item) => item.containerId === selected.id)
    const customs = state.customsRecords.find((record) => record.jobId === selected.jobId)
    const events = state.containerEvents
      .filter((event) => event.containerId === selected.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    const latestEvent = events[0]
    const freeTimeDays = trackingDaysUntil(selected.freeTimeExpiryDate, state.demoDate)
    const statusSteps: Container['movementStatus'][] = ['Booked', 'at-port', 'Delivered', 'empty-returned']
    const currentStep = Math.max(0, statusSteps.indexOf(selected.movementStatus))
    const canAdvance = selected.movementStatus !== 'empty-returned'
    const simulateUpdate = () => {
      const nextStatus: Container['movementStatus'] = selected.movementStatus === 'Booked' ? 'at-port' : selected.movementStatus === 'at-port' ? 'Delivered' : 'empty-returned'
      const next = { ...selected, movementStatus: nextStatus }
      const location = nextStatus === 'Delivered' ? trip?.delivery ?? selected.port : selected.port
      const note = nextStatus === 'at-port'
        ? 'Container arrival recorded at destination terminal.'
        : nextStatus === 'Delivered'
          ? 'Laden container delivered to the consignee.'
          : 'Empty container return recorded at the port depot.'
      const occurredAt = `${state.demoDate}T10:00:00Z`
      dispatch({ type: 'update-container', container: next })
      dispatch({ type: 'add-container-event', event: { id: generateRecordId(state, 'containerEvents'), containerId: selected.id, status: nextStatus, location, occurredAt, note } })
      if (shipment && nextStatus === 'Delivered') dispatch({ type: 'update-shipment', shipment: { ...shipment, status: 'Delivered' } })
      if (shipment) dispatch({ type: 'add-shipment-milestone', milestone: { id: generateRecordId(state, 'shipmentMilestones'), shipmentId: shipment.id, jobId: selected.jobId, title: note, occurredAt, source: 'container', sourceRecordId: selected.id, customerVisible: true } })
      setSelected(next)
      showToast(`Container movement recorded: ${nextStatus}.`)
    }
    return <Shell title={selected.containerNumber} description="Container movement, shipment and port-event details from shared demo records." action={<Button variant="secondary" onClick={() => setSelected(undefined)}>← Back to tracking</Button>}>
      <div className="container-detail">
        <Card className="container-detail__hero">
          <div className="container-detail__hero-copy">
            <div className="container-detail__identity">
              <span className="container-detail__icon" aria-hidden="true">▤</span>
              <div><p className="eyebrow">{selected.size} container · {shipment?.direction ?? 'import'}</p><h2>{selected.containerNumber}</h2><p>{customer?.name ?? 'Customer'} · {job?.jobNumber ?? 'Job not linked'}</p></div>
            </div>
            <StatusBadge tone={tone(selected.movementStatus)}>{selected.movementStatus.replaceAll('-', ' ')}</StatusBadge>
          </div>
          <div className="container-route">
            <div><span className="container-route__pin container-route__pin--origin" /><small>Origin</small><strong>{shipment?.origin ?? 'Not recorded'}</strong></div>
            <div className="container-route__line"><span>Vessel transit</span></div>
            <div><span className="container-route__pin container-route__pin--destination" /><small>Current location</small><strong>{latestEvent?.location ?? selected.port}</strong></div>
            <div className="container-route__line container-route__line--short"><span>Final delivery</span></div>
            <div><span className="container-route__pin container-route__pin--final" /><small>Destination</small><strong>{shipment?.destination ?? 'Not recorded'}</strong></div>
          </div>
          <div className="container-progress" aria-label={`Movement progress: step ${currentStep + 1} of ${statusSteps.length}`}>
            <div className="container-progress__bar"><span style={{ width: `${(currentStep / (statusSteps.length - 1)) * 100}%` }} /></div>
            <div className="container-progress__steps">{statusSteps.map((step, index) => <span className={index <= currentStep ? 'is-complete' : ''} key={step}>{step.replaceAll('-', ' ')}</span>)}</div>
          </div>
        </Card>
        <div className="container-detail__columns">
          <div className="container-detail__main">
            <Card className="container-detail__facts">
              <div className="container-section-heading"><div><p className="eyebrow">Shipment overview</p><h2>Container details</h2></div><StatusBadge tone={tone(shipment?.status ?? 'info')}>{shipment?.status ?? 'Shipment status unavailable'}</StatusBadge></div>
              <div className="container-facts">
                <span>Job number<strong>{job?.jobNumber ?? '—'}</strong></span>
                <span>Shipment reference<strong>{shipment?.reference ?? '—'}</strong></span>
                <span>Booking reference<strong>{forwarding?.bookingReference ?? '—'}</strong></span>
                <span>Vessel / voyage<strong>{selected.vessel} / {selected.voyage}</strong></span>
                <span>Port of discharge<strong>{selected.port}</strong></span>
                <span>Original ETA<strong>{trackingDate(shipment?.eta ?? selected.eta)}</strong></span>
                <span>Container size<strong>{selected.size}</strong></span>
                <span>Direction / mode<strong>{(shipment?.direction ?? 'import')} · {(shipment?.mode ?? 'FCL')}</strong></span>
                <span>Bill of lading<strong>{forwarding?.mbl ?? shipment?.mblReference ?? 'Not recorded'}</strong></span>
                <span>Last update<strong>{latestEvent ? trackingDateTime(latestEvent.occurredAt) : 'No movement events'}</strong></span>
              </div>
            </Card>
            <Card className="container-detail__events">
              <div className="container-section-heading"><div><p className="eyebrow">Event history</p><h2>Movement timeline</h2></div><span className="container-event-count">{events.length} {events.length === 1 ? 'event' : 'events'}</span></div>
              {events.length ? <ol className="container-timeline">{events.map((event, index) => <li className={index === 0 ? 'is-latest' : ''} key={event.id}><span className="container-timeline__marker" aria-hidden="true" /><div className="container-timeline__content"><div><strong>{event.status.replaceAll('-', ' ')}</strong><time>{trackingDateTime(event.occurredAt)}</time></div><span>{event.location}</span><p>{event.note}</p></div></li>)}</ol> : <p className="empty-state">No tracking events have been recorded for this container.</p>}
            </Card>
          </div>
          <aside className="container-detail__side">
            <Card className="container-detail__free-time">
              <p className="eyebrow">Port free time</p><h2>{selected.freeDays} free days</h2>
              <p>Free-time expiry: <strong>{trackingDate(selected.freeTimeExpiryDate)}</strong></p>
              {freeTimeDays !== undefined && <StatusBadge tone={freeTimeDays < 0 ? 'danger' : freeTimeDays <= 1 ? 'warning' : 'success'}>{freeTimeDays < 0 ? `${Math.abs(freeTimeDays)} days overdue` : freeTimeDays === 0 ? 'Expires today' : `${freeTimeDays} days until expiry`}</StatusBadge>}
              {/* <p className="container-detail__note">Countdown uses the current demo date. Port storage or demurrage charges are not calculated here.</p> */}
            </Card>
            <Card className="container-detail__operations">
              <p className="eyebrow">Clearance & delivery</p><h2>Related operations</h2>
              <div className="container-operation-row"><span>Customs declaration</span><strong>{customs?.declarationType ?? 'Not created'}</strong></div>
              <div className="container-operation-row"><span>Customs status</span><StatusBadge tone={tone(customs?.status ?? 'pending')}>{customs?.status ?? 'Not available'}</StatusBadge></div>
              <div className="container-operation-row"><span>EDO</span><StatusBadge tone={tone(customs?.edoStatus ?? 'pending')}>{customs?.edoStatus ?? 'Not available'}</StatusBadge></div>
              <div className="container-operation-row"><span>Linked trip</span><strong>{trip?.tripNumber ?? 'Not assigned'}</strong></div>
              {trip && <div className="container-operation-row"><span>Delivery point</span><strong>{trip.delivery}</strong></div>}
            </Card>
            <Card className="container-detail__action">
              <div><p className="eyebrow">Demo control</p><h2>Tracking update</h2><p>{canAdvance ? 'Advance the container to its next movement stage.' : 'The empty return is recorded; no further movement stage is available.'}</p></div>
              <Button disabled={!canAdvance} onClick={simulateUpdate}>{canAdvance ? 'Simulate tracking update' : 'Journey completed'}</Button>
              <small>Updates shared container and shipment activity. No port integration is connected.</small>
            </Card>
          </aside>
        </div>
      </div>
    </Shell>
  }
  return <Shell title="Container Tracking" description="Monitor container locations, ETAs, free days and movement history." action={<div className="filter-bar"><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">All statuses</option><option value="Booked">Booked</option><option value="at-port">At port</option><option value="Delivered">Delivered</option></select></div>}><Card><DataTable headers={['Container', 'Job', 'Shipment', 'Vessel / voyage', 'Port', 'ETA', 'Free days', 'Status', 'Action']} rows={rows.map((container) => [container.containerNumber, state.jobs.find((job) => job.id === container.jobId)?.jobNumber, state.shipments.find((shipment) => shipment.id === container.shipmentId)?.reference, `${container.vessel} / ${container.voyage}`, container.port, container.eta, `${container.freeDays} days`, <StatusBadge tone={tone(container.movementStatus)}>{container.movementStatus}</StatusBadge>, <Button variant="ghost" onClick={() => setSelected(container)}>Details</Button>])} /></Card></Shell>
}

function MasterTabs({ active, onNavigate }: { active: 'list' | 'trucks' | 'trailers' | 'drivers'; onNavigate: (screen: 'list' | 'trucks' | 'trailers' | 'drivers') => void }) {
  return <div className="module-tabs" aria-label="Haulage modules"><Button variant={active === 'list' ? 'primary' : 'secondary'} onClick={() => onNavigate('list')}>Trips</Button><Button variant={active === 'trucks' ? 'primary' : 'secondary'} onClick={() => onNavigate('trucks')}>Truck Master</Button><Button variant={active === 'trailers' ? 'primary' : 'secondary'} onClick={() => onNavigate('trailers')}>Trailer Master</Button><Button variant={active === 'drivers' ? 'primary' : 'secondary'} onClick={() => onNavigate('drivers')}>Driver Master</Button></div>
}

function TruckMaster({ onNavigate }: { onNavigate: (screen: 'list' | 'trucks' | 'trailers' | 'drivers') => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [editing, setEditing] = useState<Truck>()
  const [formOpen, setFormOpen] = useState(false)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [truckType, setTruckType] = useState<NonNullable<Truck['truckType']>>('prime-mover')
  const [capacity, setCapacity] = useState('')
  const [ownership, setOwnership] = useState<NonNullable<Truck['ownership']>>('owned')
  const [status, setStatus] = useState<Truck['status']>('available')
  const [insuranceExpiry, setInsuranceExpiry] = useState('')
  const [roadTaxExpiry, setRoadTaxExpiry] = useState('')
  const [documentExpiry, setDocumentExpiry] = useState('')
  const [documents, setDocuments] = useState('')
  const clear = () => { setEditing(undefined); setRegistrationNumber(''); setTruckType('prime-mover'); setCapacity(''); setOwnership('owned'); setStatus('available'); setInsuranceExpiry(''); setRoadTaxExpiry(''); setDocumentExpiry(''); setDocuments(''); setFormOpen(false) }
  const edit = (truck: Truck) => { setEditing(truck); setRegistrationNumber(truck.registrationNumber); setTruckType(truck.truckType ?? 'prime-mover'); setCapacity(String(truck.capacityTons)); setOwnership(truck.ownership ?? 'owned'); setStatus(truck.status); setInsuranceExpiry(truck.insuranceExpiry ?? ''); setRoadTaxExpiry(truck.roadTaxExpiry ?? ''); setDocumentExpiry(truck.documentExpiry); setDocuments((truck.vehicleDocuments ?? []).join(', ')); setFormOpen(true) }
  const save = () => {
    const tons = Number(capacity)
    if (!registrationNumber.trim() || !Number.isFinite(tons) || tons <= 0 || !documentExpiry) { showToast('Registration, positive capacity and vehicle document expiry are required.'); return }
    if (state.trucks.some((truck) => truck.registrationNumber.toLowerCase() === registrationNumber.trim().toLowerCase() && truck.id !== editing?.id)) { showToast('That truck registration is already in the fleet.'); return }
    const truck: Truck = { id: editing?.id ?? generateRecordId(state, 'trucks'), registrationNumber: registrationNumber.trim(), truckType, capacityTons: tons, ownership, status, insuranceExpiry: insuranceExpiry || undefined, roadTaxExpiry: roadTaxExpiry || undefined, documentExpiry, vehicleDocuments: documents.split(',').map((item) => item.trim()).filter(Boolean) }
    dispatch({ type: editing ? 'update-truck' : 'add-truck', truck })
    showToast(editing ? 'Truck master updated.' : 'Truck added to the fleet.')
    clear()
  }
  const tripsFor = (truckId: string) => state.trips.filter((trip) => trip.truckId === truckId && ['planned', 'assigned', 'in-progress'].includes(trip.status))
  return <Shell title="Truck Master" description="Maintain vehicle identity, ownership, capacity, availability, expiry dates and document checklist." action={<Button onClick={() => { clear(); setFormOpen(true) }}>＋ Add truck</Button>}>
    <MasterTabs active="trucks" onNavigate={onNavigate} />
    {formOpen && <Card className="form-card"><div className="form-grid form-grid--three">
      <FormField label="Registration *"><input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></FormField>
      <FormField label="Truck type"><select value={truckType} onChange={(event) => setTruckType(event.target.value as NonNullable<Truck['truckType']>)}><option value="prime-mover">Prime mover</option><option value="rigid">Rigid</option><option value="lorry">Lorry</option><option value="other">Other</option></select></FormField>
      <FormField label="Capacity (tonnes) *"><input min="0.1" step="0.1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></FormField>
      <FormField label="Ownership"><select value={ownership} onChange={(event) => setOwnership(event.target.value as NonNullable<Truck['ownership']>)}><option value="owned">Owned</option><option value="leased">Leased</option><option value="subcontracted">Subcontracted</option></select></FormField>
      <FormField label="Availability"><select value={status} onChange={(event) => setStatus(event.target.value as Truck['status'])}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="assigned">Assigned</option></select></FormField>
      <FormField label="Insurance expiry"><input type="date" value={insuranceExpiry} onChange={(event) => setInsuranceExpiry(event.target.value)} /></FormField>
      <FormField label="Road-tax expiry"><input type="date" value={roadTaxExpiry} onChange={(event) => setRoadTaxExpiry(event.target.value)} /></FormField>
      <FormField label="Vehicle document expiry *"><input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} /></FormField>
      <FormField label="Vehicle documents (comma separated)"><input value={documents} onChange={(event) => setDocuments(event.target.value)} placeholder="Registration, insurance certificate" /></FormField>
    </div><div className="form-actions"><Button variant="secondary" onClick={clear}>Cancel</Button><Button onClick={save}>{editing ? 'Save truck' : 'Add truck'}</Button></div></Card>}
    <Card className="fleet-master-card"><DataTable headers={['Registration', 'Type / ownership', 'Capacity', 'Availability', 'Insurance / road tax', 'Documents', 'Assignment', 'Action']} rows={state.trucks.map((truck) => { const availability = truck.status === 'maintenance' ? 'maintenance' : tripsFor(truck.id).length ? 'assigned' : 'available'; return [truck.registrationNumber, `${truck.truckType ?? 'Truck'} · ${truck.ownership ?? 'Unspecified'}`, `${truck.capacityTons} t`, <StatusBadge tone={availability === 'available' ? 'success' : availability === 'maintenance' ? 'danger' : 'warning'}>{availability}</StatusBadge>, `${truck.insuranceExpiry ?? '—'} / ${truck.roadTaxExpiry ?? '—'}`, `${(truck.vehicleDocuments ?? []).join(', ') || 'No documents'} · expiry ${truck.documentExpiry}`, tripsFor(truck.id).map((trip) => trip.tripNumber).join(', ') || 'No active trip', <Button variant="ghost" onClick={() => edit(truck)}>Edit</Button>] })} /></Card>
  </Shell>
}

function TrailerMaster({ onNavigate }: { onNavigate: (screen: 'list' | 'trucks' | 'trailers' | 'drivers') => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [editing, setEditing] = useState<Trailer>()
  const [formOpen, setFormOpen] = useState(false)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [type, setType] = useState<Trailer['type']>('skeletal')
  const [capacity, setCapacity] = useState('')
  const [status, setStatus] = useState<NonNullable<Trailer['status']>>('available')
  const [documentStatus, setDocumentStatus] = useState<NonNullable<Trailer['documentStatus']>>('valid')
  const [documentExpiry, setDocumentExpiry] = useState('')
  const close = () => { setEditing(undefined); setRegistrationNumber(''); setType('skeletal'); setCapacity(''); setStatus('available'); setDocumentStatus('valid'); setDocumentExpiry(''); setFormOpen(false) }
  const edit = (trailer: Trailer) => { setEditing(trailer); setRegistrationNumber(trailer.registrationNumber); setType(trailer.type); setCapacity(String(trailer.capacityTons ?? '')); setStatus(trailer.status ?? 'available'); setDocumentStatus(trailer.documentStatus ?? 'valid'); setDocumentExpiry(trailer.documentExpiry); setFormOpen(true) }
  const save = () => {
    const tons = Number(capacity)
    if (!registrationNumber.trim() || !Number.isFinite(tons) || tons <= 0 || !documentExpiry) { showToast('Registration, positive capacity and document expiry are required.'); return }
    if (state.trailers.some((trailer) => trailer.registrationNumber.toLowerCase() === registrationNumber.trim().toLowerCase() && trailer.id !== editing?.id)) { showToast('That trailer registration is already in the fleet.'); return }
    const trailer: Trailer = { id: editing?.id ?? generateRecordId(state, 'trailers'), registrationNumber: registrationNumber.trim(), type, capacityTons: tons, status, documentStatus, documentExpiry }
    dispatch({ type: editing ? 'update-trailer' : 'add-trailer', trailer })
    showToast(editing ? 'Trailer master updated.' : 'Trailer added to the fleet.')
    close()
  }
  const tripsFor = (trailerId: string) => state.trips.filter((trip) => trip.trailerId === trailerId && ['planned', 'assigned', 'in-progress'].includes(trip.status))
  return <Shell title="Trailer Master" description="Maintain trailer registration, type, capacity, availability and document status." action={<Button onClick={() => { close(); setFormOpen(true) }}>＋ Add trailer</Button>}>
    <MasterTabs active="trailers" onNavigate={onNavigate} />
    {formOpen && <Card className="form-card"><div className="form-grid">
      <FormField label="Registration *"><input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></FormField>
      <FormField label="Trailer type"><select value={type} onChange={(event) => setType(event.target.value as Trailer['type'])}><option value="skeletal">Skeletal</option><option value="flatbed">Flatbed</option><option value="box">Box</option></select></FormField>
      <FormField label="Capacity (tonnes) *"><input min="0.1" step="0.1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></FormField>
      <FormField label="Availability"><select value={status} onChange={(event) => setStatus(event.target.value as NonNullable<Trailer['status']>)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="assigned">Assigned</option></select></FormField>
      <FormField label="Document status"><select value={documentStatus} onChange={(event) => setDocumentStatus(event.target.value as NonNullable<Trailer['documentStatus']>)}><option value="valid">Valid</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="missing">Missing</option></select></FormField>
      <FormField label="Document expiry *"><input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} /></FormField>
    </div><div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save}>{editing ? 'Save trailer' : 'Add trailer'}</Button></div></Card>}
    <Card className="fleet-master-card"><DataTable headers={['Registration', 'Type', 'Capacity', 'Availability', 'Document status', 'Expiry', 'Assignment', 'Action']} rows={state.trailers.map((trailer) => { const availability = trailer.status === 'maintenance' ? 'maintenance' : tripsFor(trailer.id).length ? 'assigned' : 'available'; return [trailer.registrationNumber, trailer.type, `${trailer.capacityTons ?? '—'} t`, <StatusBadge tone={availability === 'maintenance' ? 'danger' : availability === 'available' ? 'success' : 'warning'}>{availability}</StatusBadge>, <StatusBadge tone={trailer.documentStatus === 'expired' || trailer.documentStatus === 'missing' ? 'danger' : trailer.documentStatus === 'expiring' ? 'warning' : 'success'}>{trailer.documentStatus ?? 'valid'}</StatusBadge>, trailer.documentExpiry, tripsFor(trailer.id).map((trip) => trip.tripNumber).join(', ') || 'No active trip', <Button variant="ghost" onClick={() => edit(trailer)}>Edit</Button>] })} /></Card>
  </Shell>
}

function DriverMaster({ onNavigate }: { onNavigate: (screen: 'list' | 'trucks' | 'trailers' | 'drivers') => void }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [editing, setEditing] = useState<Driver>()
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [identityNumber, setIdentityNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [licenceNumber, setLicenceNumber] = useState('')
  const [licenceExpiry, setLicenceExpiry] = useState('')
  const [status, setStatus] = useState<Driver['status']>('available')
  const close = () => { setEditing(undefined); setName(''); setIdentityNumber(''); setPhone(''); setEmail(''); setLicenceNumber(''); setLicenceExpiry(''); setStatus('available'); setFormOpen(false) }
  const edit = (driver: Driver) => { setEditing(driver); setName(driver.name); setIdentityNumber(driver.identityNumber ?? ''); setPhone(driver.phone); setEmail(driver.email ?? ''); setLicenceNumber(driver.licenceNumber ?? ''); setLicenceExpiry(driver.licenceExpiry); setStatus(driver.status); setFormOpen(true) }
  const save = () => {
    if (!name.trim() || !identityNumber.trim() || !phone.trim() || !licenceNumber.trim() || !licenceExpiry) { showToast('Name, identity, phone, licence number and licence expiry are required.'); return }
    if (state.drivers.some((driver) => driver.name.toLowerCase() === name.trim().toLowerCase() && driver.id !== editing?.id)) { showToast('A driver with that name already exists.'); return }
    const driver: Driver = { id: editing?.id ?? generateRecordId(state, 'drivers'), name: name.trim(), identityNumber: identityNumber.trim(), phone: phone.trim(), email: email.trim() || undefined, licenceNumber: licenceNumber.trim(), licenceExpiry, status }
    dispatch({ type: editing ? 'update-driver' : 'add-driver', driver })
    showToast(editing ? 'Driver master updated.' : 'Driver added to the roster.')
    close()
  }
  const assignedTrips = (driverId: string) => state.trips.filter((trip) => trip.driverId === driverId && ['planned', 'assigned', 'in-progress'].includes(trip.status))
  return <Shell title="Driver Master" description="Manage driver identity, contacts, licence validity, availability and current trip assignments." action={<Button onClick={() => { close(); setFormOpen(true) }}>＋ Add driver</Button>}>
    <MasterTabs active="drivers" onNavigate={onNavigate} />
    {formOpen && <Card className="form-card"><div className="form-grid">
      <FormField label="Full name *"><input value={name} onChange={(event) => setName(event.target.value)} /></FormField>
      <FormField label="Identity number *"><input value={identityNumber} onChange={(event) => setIdentityNumber(event.target.value)} /></FormField>
      <FormField label="Phone *"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></FormField>
      <FormField label="Email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></FormField>
      <FormField label="Licence number *"><input value={licenceNumber} onChange={(event) => setLicenceNumber(event.target.value)} /></FormField>
      <FormField label="Licence expiry *"><input type="date" value={licenceExpiry} onChange={(event) => setLicenceExpiry(event.target.value)} /></FormField>
      <FormField label="Availability"><select value={status} onChange={(event) => setStatus(event.target.value as Driver['status'])}><option value="available">Available</option><option value="assigned">Assigned</option><option value="off-duty">Off duty</option></select></FormField>
    </div><div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save}>{editing ? 'Save driver' : 'Add driver'}</Button></div></Card>}
    <Card className="fleet-master-card"><DataTable headers={['Driver', 'Identity', 'Contact', 'Licence', 'Availability', 'Current assignments', 'Action']} rows={state.drivers.map((driver) => { const availability = driver.status === 'off-duty' ? 'off-duty' : assignedTrips(driver.id).length ? 'assigned' : 'available'; return [driver.name, driver.identityNumber ?? '—', `${driver.phone}${driver.email ? ` · ${driver.email}` : ''}`, `${driver.licenceNumber ?? 'No licence no.'} · expires ${driver.licenceExpiry}`, <StatusBadge tone={availability === 'available' ? 'success' : availability === 'off-duty' ? 'danger' : 'warning'}>{availability}</StatusBadge>, assignedTrips(driver.id).map((trip) => trip.tripNumber).join(', ') || 'No active trip', <Button variant="ghost" onClick={() => edit(driver)}>Edit</Button>] })} /></Card>
  </Shell>
}

function TripPlanningForm({ initialJobId, onCancel, onSaved }: { initialJobId?: string; onCancel: () => void; onSaved: (trip: Trip) => void }) {
  const { state, dispatch } = useAppState()
  const confirm = useConfirmation()
  const showToast = useToast()
  const [jobId, setJobId] = useState(initialJobId ?? state.jobs[0]?.id ?? '')
  const jobShipments = state.shipments.filter((shipment) => shipment.jobId === jobId)
  const [shipmentId, setShipmentId] = useState(jobShipments[0]?.id ?? '')
  const shipmentContainers = state.containers.filter((container) => container.jobId === jobId && (!shipmentId || container.shipmentId === shipmentId))
  const [containerId, setContainerId] = useState('')
  const [tripType, setTripType] = useState<NonNullable<Trip['tripType']>>('container-pickup')
  const [pickup, setPickup] = useState('')
  const [delivery, setDelivery] = useState('')
  const [instructions, setInstructions] = useState('')
  const [plannedPickup, setPlannedPickup] = useState(`${state.demoDate}T09:00`)
  const [plannedDelivery, setPlannedDelivery] = useState(`${state.demoDate}T15:00`)
  const [portAppointment, setPortAppointment] = useState('')
  const [portSlot, setPortSlot] = useState('')
  const [emptyPickup, setEmptyPickup] = useState('')
  const [ladenDelivery, setLadenDelivery] = useState('')
  const [returnEmpty, setReturnEmpty] = useState('')
  const [subcontractor, setSubcontractor] = useState(false)
  const [subcontractorName, setSubcontractorName] = useState('')
  const [driverId, setDriverId] = useState('')
  const [truckId, setTruckId] = useState('')
  const [trailerId, setTrailerId] = useState('')
  const [billingAmount, setBillingAmount] = useState('0')
  const [estimatedTruckingCost, setEstimatedTruckingCost] = useState('0')
  const [estimatedTollCost, setEstimatedTollCost] = useState('0')
  const [estimatedOtherCost, setEstimatedOtherCost] = useState('0')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [assignmentKey] = useState(() => `plan:${state.demoDate}:${generateStableId('trip', state.trips)}`)

  const updateJob = (nextJobId: string) => {
    setJobId(nextJobId)
    const nextShipment = state.shipments.find((shipment) => shipment.jobId === nextJobId)
    setShipmentId(nextShipment?.id ?? '')
    setContainerId('')
  }
  const changeSchedule = (start: string, end: string) => {
    setPlannedPickup(start)
    setPlannedDelivery(end)
  }
  const iso = (value: string) => value ? new Date(value).toISOString() : undefined
  const plan: Trip = {
    id: generateRecordId(state, 'trips'),
    tripNumber: `TR-${generateStableId('trip', state.trips).split('-').at(-1)}`,
    jobId, shipmentId: shipmentId || undefined, containerId: containerId || undefined, tripType,
    pickup, delivery, plannedPickup: iso(plannedPickup), plannedDelivery: iso(plannedDelivery),
    instructions: instructions.trim() || undefined,
    status: 'assigned', billingAmount: Number(billingAmount), truckingCost: 0, tollCost: 0, otherCost: 0,
    estimatedTruckingCost: Number(estimatedTruckingCost), estimatedTollCost: Number(estimatedTollCost), estimatedOtherCost: Number(estimatedOtherCost),
    subcontractorHaulageCost: subcontractor ? Number(estimatedTruckingCost) : undefined,
    milestones: ['Trip planned', 'Assignment published to Driver App'],
    portAppointment: iso(portAppointment), portSlot: portSlot.trim() || undefined,
    emptyPickup: iso(emptyPickup), ladenDelivery: iso(ladenDelivery), returnEmpty: iso(returnEmpty),
    subcontractor, subcontractorName: subcontractor ? subcontractorName.trim() : undefined,
    driverId: driverId || undefined, truckId: subcontractor ? undefined : truckId || undefined,
    trailerId: subcontractor ? undefined : trailerId || undefined, podStatus: 'pending', assignmentKey,
  }
  const availability = {
    driver: driverId ? state.drivers.find((driver) => driver.id === driverId)?.status !== 'off-duty' && tripAvailability(state, 'driver', driverId, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') : false,
    truck: truckId ? state.trucks.find((truck) => truck.id === truckId)?.status !== 'maintenance' && tripAvailability(state, 'truck', truckId, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') : false,
    trailer: trailerId ? state.trailers.find((trailer) => trailer.id === trailerId)?.status !== 'maintenance' && state.trailers.find((trailer) => trailer.id === trailerId)?.documentStatus !== 'expired' && state.trailers.find((trailer) => trailer.id === trailerId)?.documentStatus !== 'missing' && tripAvailability(state, 'trailer', trailerId, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') : false,
  }
  const save = async () => {
    const validation = validateTripPlan(state, plan)
    setErrors(validation)
    if (validation.length) return
    const accepted = await confirm({ title: 'Confirm and publish trip', message: `${plan.tripNumber} will be assigned to ${subcontractor ? subcontractorName : state.drivers.find((driver) => driver.id === driverId)?.name} and shown in the Driver App.`, confirmLabel: 'Confirm trip' }, () => undefined)
    if (!accepted) return
    setSaving(true)
    const activity = { id: generateRecordId(state, 'activity'), entityType: 'trip', entityId: plan.id, action: `${plan.tripNumber} planned and assignment published`, actor: 'Operations', occurredAt: `${state.demoDate}T09:00:00Z` }
    dispatch({ type: 'plan-trip', trip: plan, activity })
    showToast(`${plan.tripNumber} confirmed and published.`)
    onSaved(plan)
  }
  const portRelevant = ['container-pickup', 'port-delivery', 'empty-return'].includes(tripType)
  const emptyReturnRelevant = ['container-pickup', 'empty-return'].includes(tripType)
  const plannedText = (date: string) => date ? new Date(date).toLocaleString('en-MY') : 'Not scheduled'

  return <Shell title="Trip Planning" description="Link an existing job and shipment, validate equipment and driver availability, then publish the confirmed assignment." action={<Button variant="secondary" onClick={onCancel}>Cancel</Button>}>
    <div className="content-grid content-grid--wide"><Card className="form-card">
      <div className="form-grid form-grid--three">
        <FormField label="Job *"><select value={jobId} onChange={(event) => updateJob(event.target.value)}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {state.customers.find((customer) => customer.id === job.customerId)?.name}</option>)}</select></FormField>
        <FormField label="Shipment"><select value={shipmentId} onChange={(event) => { setShipmentId(event.target.value); setContainerId('') }}><option value="">No shipment selected</option>{jobShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.reference} · {shipment.origin} → {shipment.destination}</option>)}</select></FormField>
        <FormField label="Container"><select value={containerId} onChange={(event) => setContainerId(event.target.value)}><option value="">No container selected</option>{shipmentContainers.map((container) => <option key={container.id} value={container.id}>{container.containerNumber} · {container.size}</option>)}</select></FormField>
        <FormField label="Trip type *"><select value={tripType} onChange={(event) => setTripType(event.target.value as NonNullable<Trip['tripType']>)}><option value="container-pickup">Container pickup</option><option value="warehouse-delivery">Warehouse delivery</option><option value="empty-return">Empty return</option><option value="port-delivery">Port delivery</option><option value="general-haulage">General haulage</option></select></FormField>
        <FormField label="Pickup location *"><input value={pickup} onChange={(event) => setPickup(event.target.value)} /></FormField>
        <FormField label="Delivery location *"><input value={delivery} onChange={(event) => setDelivery(event.target.value)} /></FormField>
        <FormField label="Driver instructions"><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} /></FormField>
        <FormField label="Planned pickup *"><input type="datetime-local" value={plannedPickup} onChange={(event) => changeSchedule(event.target.value, plannedDelivery)} /></FormField>
        <FormField label="Planned delivery *"><input type="datetime-local" value={plannedDelivery} onChange={(event) => changeSchedule(plannedPickup, event.target.value)} /></FormField>
        {portRelevant && <><FormField label="Port appointment"><input type="datetime-local" value={portAppointment} onChange={(event) => setPortAppointment(event.target.value)} /></FormField><FormField label="Port slot"><input value={portSlot} onChange={(event) => setPortSlot(event.target.value)} /></FormField></>}
        {emptyReturnRelevant && <FormField label="Empty pickup requirement"><input type="datetime-local" value={emptyPickup} onChange={(event) => setEmptyPickup(event.target.value)} /></FormField>}
        {tripType !== 'empty-return' && <FormField label="Laden delivery requirement"><input type="datetime-local" value={ladenDelivery} onChange={(event) => setLadenDelivery(event.target.value)} /></FormField>}
        {emptyReturnRelevant && <FormField label="Return-empty requirement"><input type="datetime-local" value={returnEmpty} onChange={(event) => setReturnEmpty(event.target.value)} /></FormField>}
        <label className="exception-check"><input checked={subcontractor} onChange={(event) => setSubcontractor(event.target.checked)} type="checkbox" /> Use subcontractor</label>
        {subcontractor
          ? <FormField label="Subcontractor *"><input value={subcontractorName} onChange={(event) => setSubcontractorName(event.target.value)} /></FormField>
          : <>
            <FormField label={`Driver *${driverId && !availability.driver ? ' · assignment conflict' : ''}`}><select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Select driver</option>{state.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.status}{!tripAvailability(state, 'driver', driver.id, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') ? ' · overlapping trip' : ''}</option>)}</select></FormField>
            <FormField label={`Truck *${truckId && !availability.truck ? ' · assignment conflict' : ''}`}><select value={truckId} onChange={(event) => setTruckId(event.target.value)}><option value="">Select truck</option>{state.trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber} · {truck.capacityTons}t · {truck.status}{!tripAvailability(state, 'truck', truck.id, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') ? ' · overlapping trip' : ''}</option>)}</select></FormField>
            <FormField label={`Trailer *${trailerId && !availability.trailer ? ' · assignment conflict' : ''}`}><select value={trailerId} onChange={(event) => setTrailerId(event.target.value)}><option value="">Select trailer</option>{state.trailers.map((trailer) => <option key={trailer.id} value={trailer.id}>{trailer.registrationNumber} · {trailer.type} · {trailer.status ?? 'available'}{!tripAvailability(state, 'trailer', trailer.id, plan.plannedPickup ?? '', plan.plannedDelivery ?? '') ? ' · overlapping trip' : ''}</option>)}</select></FormField>
          </>}
        <FormField label="Agreed haulage rate (RM)"><input min="0" step="0.01" type="number" value={billingAmount} onChange={(event) => setBillingAmount(event.target.value)} /></FormField>
        <FormField label={subcontractor ? 'Subcontractor haulage cost (RM)' : 'Estimated trucking cost (RM)'}><input min="0" step="0.01" type="number" value={estimatedTruckingCost} onChange={(event) => setEstimatedTruckingCost(event.target.value)} /></FormField>
        <FormField label="Estimated toll (RM)"><input min="0" step="0.01" type="number" value={estimatedTollCost} onChange={(event) => setEstimatedTollCost(event.target.value)} /></FormField>
        <FormField label="Estimated other cost (RM)"><input min="0" step="0.01" type="number" value={estimatedOtherCost} onChange={(event) => setEstimatedOtherCost(event.target.value)} /></FormField>
      </div>
      {errors.length > 0 && <ul className="form-error" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <div className="form-actions"><Button onClick={() => void save()} disabled={saving}>Confirm and publish assignment</Button></div>
    </Card><Card><p className="eyebrow">Schedule & resource check</p><h2>{state.jobs.find((job) => job.id === jobId)?.jobNumber ?? 'Select a job'}</h2><p>{plannedText(plannedPickup)} → {plannedText(plannedDelivery)}</p><p className="card-copy">Estimated costs are planning values; actual trip costs remain zero until operations posts actuals. Confirmed assignments appear in the selected driver's app.</p><div className="detail-grid"><span>Driver availability<strong>{driverId ? availability.driver ? 'Available' : 'Conflict' : subcontractor ? 'Subcontractor' : 'Not assigned'}</strong></span><span>Truck availability<strong>{truckId ? availability.truck ? 'Available' : 'Conflict' : subcontractor ? 'Subcontracted' : 'Not assigned'}</strong></span><span>Trailer availability<strong>{trailerId ? availability.trailer ? 'Available' : 'Conflict' : subcontractor ? 'Subcontracted' : 'Not assigned'}</strong></span><span>Trip ID<strong>{plan.id}</strong></span></div></Card></div>
  </Shell>
}

function Haulage({ initialJobId, initialTripId }: { initialJobId?: string; initialTripId?: string }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const confirm = useConfirmation()
  const [selected, setSelected] = useState<Trip | undefined>(() => state.trips.find((trip) => trip.id === initialTripId))
  const [screen, setScreen] = useState<'list' | 'plan' | 'trucks' | 'trailers' | 'drivers'>('list')
  const [planningJobId, setPlanningJobId] = useState(initialJobId)
  if (selected) {
    const driver = state.drivers.find((item) => item.id === selected.driverId)
    const truck = state.trucks.find((item) => item.id === selected.truckId)
    const trailer = state.trailers.find((item) => item.id === selected.trailerId)
    const job = state.jobs.find((item) => item.id === selected.jobId)
    const customer = state.customers.find((item) => item.id === job?.customerId)
    const financials = calculateJobFinancials(state, selected.jobId)
    const expenses = state.tripExpenses.filter((expense) => expense.tripId === selected.id)
    const tripFinancials = calculateHaulageProfitLoss(selected, expenses, state.supplierCosts, state.reimbursements)
    const tripExpenses = tripFinancials.expensesByStatus.submitted
    const approvedExpenses = tripFinancials.tripExpenses
    const tripCost = tripFinancials.operatingCosts
    const tripProfit = tripFinancials.profitLoss
    const order: Trip['status'][] = ['planned', 'assigned', 'in-progress', 'completed']
    const currentStage = order.indexOf(selected.status)
    const nextStage = currentStage >= 0 ? order[currentStage + 1] : undefined
    const linkedShipment = state.shipments.find((shipment) => shipment.id === selected.shipmentId)
    const linkedContainer = state.containers.find((container) => container.id === selected.containerId)
    const formatDateTime = (value?: string) => value
      ? new Date(value).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Not scheduled'
    const formatAmount = (value: number) => `RM ${value.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`
    const updateStatus = async () => {
      const next = order[Math.min(currentStage + 1, order.length - 1)]
      if (!canTransitionTrip(selected.status, next)) return
      const accepted = await confirm({ title: 'Update trip status', message: `Move ${selected.tripNumber} from ${selected.status.replaceAll('-', ' ')} to ${next.replaceAll('-', ' ')}?`, confirmLabel: 'Update status' }, () => undefined)
      if (!accepted) return
      const updated = {
        ...selected,
        status: next,
        milestones: [...selected.milestones, `${next} · ${state.demoDate}`],
      }
      dispatch({ type: 'update-trip', trip: updated })
      if (linkedShipment) dispatch({ type: 'add-shipment-milestone', milestone: { id: generateRecordId(state, 'shipmentMilestones'), shipmentId: linkedShipment.id, jobId: selected.jobId, title: `Trip ${selected.tripNumber} · ${next}`, occurredAt: state.demoDate, source: 'trip', sourceRecordId: selected.id, customerVisible: true } })
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'trip', entityId: selected.id, action: `${selected.tripNumber} status changed to ${next}`, actor: 'Operations', occurredAt: state.demoDate } })
      showToast(`Trip status updated to ${next}.`)
      setSelected(updated)
    }
    const cancelTrip = async () => {
      if (!canTransitionTrip(selected.status, 'cancelled')) return
      const accepted = await confirm({ title: 'Cancel trip assignment', message: `Cancel ${selected.tripNumber}? The trip will no longer be available for execution.`, confirmLabel: 'Cancel trip', variant: 'destructive' }, () => undefined)
      if (!accepted) return
      const updated = { ...selected, status: 'cancelled' as const, milestones: [...selected.milestones, `cancelled · ${state.demoDate}`] }
      dispatch({ type: 'update-trip', trip: updated })
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'trip', entityId: selected.id, action: `${selected.tripNumber} cancelled`, actor: 'Operations', occurredAt: state.demoDate } })
      setSelected(updated)
      showToast(`${selected.tripNumber} cancelled.`)
    }
    const approveExpense = async (expense: (typeof expenses)[number]) => {
      if (expense.status !== 'submitted') return
      const accepted = await confirm({ title: 'Approve driver expense', message: `Approve RM ${expense.amount.toLocaleString('en-MY')} for ${expense.description}?`, confirmLabel: 'Approve expense' }, () => undefined)
      if (!accepted) return
      dispatch({ type: 'update-trip-expense', expense: { ...expense, status: 'approved' } })
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'trip-expense', entityId: expense.id, action: 'Trip expense approved', actor: 'Operations', occurredAt: state.demoDate } })
      showToast('Trip expense approved and added to actual job costing.')
    }

    return (
      <Shell
        title={selected.tripNumber}
        description="Review the assigned resources, route, linked records, execution milestones and estimated versus actual costs."
        action={<><Button variant="ghost" onClick={() => setScreen('plan')}>＋ Plan another trip</Button><Button variant="secondary" onClick={() => setSelected(undefined)}>← Back to trips</Button></>}
      >
        <div className="trip-detail">
          <Card className="trip-detail__route-card">
            <div className="trip-detail__route-heading">
              <div>
                <p className="eyebrow">Assigned route</p>
                <h2>{selected.pickup} <span aria-hidden="true">→</span> {selected.delivery}</h2>
                <p>{job?.jobNumber ?? 'Job not linked'}{customer ? ` · ${customer.name}` : ''}</p>
              </div>
              <StatusBadge tone={tone(selected.status)}>{selected.status.replaceAll('-', ' ')}</StatusBadge>
            </div>
            <div className="trip-detail__route-points">
              <div className="trip-detail__route-point">
                <span className="trip-detail__route-marker" aria-hidden="true" />
                <div><small>Pickup</small><strong>{selected.pickup}</strong><span>{formatDateTime(selected.actualPickup ?? selected.plannedPickup)}</span></div>
              </div>
              <div className="trip-detail__route-line" aria-hidden="true" />
              <div className="trip-detail__route-point trip-detail__route-point--destination">
                <span className="trip-detail__route-marker" aria-hidden="true" />
                <div><small>Delivery</small><strong>{selected.delivery}</strong><span>{formatDateTime(selected.ladenDelivery)}</span></div>
              </div>
            </div>
            <div className="trip-detail__quick-facts">
              <div><span>Driver</span><strong>{driver?.name ?? 'Unassigned'}</strong><small>{driver?.phone ?? 'No contact available'}</small></div>
              <div><span>Truck / trailer</span><strong>{truck?.registrationNumber ?? 'Unassigned'} / {trailer?.registrationNumber ?? 'Unassigned'}</strong><small>{truck ? `${truck.capacityTons} ton capacity` : 'Vehicle not assigned'}{trailer ? ` · ${trailer.type}` : ''}</small></div>
              <div><span>Proof of delivery</span><strong><StatusBadge tone={tone(selected.podStatus ?? 'pending')}>{(selected.podStatus ?? 'pending').replaceAll('-', ' ')}</StatusBadge></strong><small>{selected.subcontractor ? 'Subcontractor trip' : 'Company fleet'}</small></div>
            </div>
          </Card>

          <div className="trip-detail__columns">
            <div className="trip-detail__main">
              <Card className="trip-detail__card trip-detail__progress-card">
                <div className="trip-detail__card-heading">
                  <div><p className="eyebrow">Execution</p><h2>Trip progress</h2></div>
                  <span className="trip-detail__stage-count">Step {Math.max(1, currentStage + 1)} of {order.length}</span>
                </div>
                <ol aria-label="Trip status progress" className="trip-detail__stepper">
                  {order.map((status, index) => {
                    const complete = index < currentStage
                    const current = index === currentStage
                    return (
                      <li
                        aria-current={current ? 'step' : undefined}
                        className={`trip-detail__step${complete ? ' trip-detail__step--complete' : ''}${current ? ' trip-detail__step--current' : ''}`}
                        key={status}
                      >
                        <span className="trip-detail__step-marker" aria-hidden="true">{complete ? '✓' : index + 1}</span>
                        <span>{status.replaceAll('-', ' ')}</span>
                      </li>
                    )
                  })}
                </ol>
                <div className="trip-detail__progress-footer">
                  <p>{selected.status === 'completed' ? 'Trip completed. Actual costs and POD can now be reviewed.' : selected.status === 'cancelled' ? 'This trip was cancelled.' : `Next status: ${nextStage?.replaceAll('-', ' ') ?? 'Complete'}.`}</p>
                  <div className="button-row"><Button disabled={!nextStage || !canTransitionTrip(selected.status, nextStage)} onClick={() => void updateStatus()}>{selected.status === 'completed' ? 'Trip completed' : selected.status === 'cancelled' ? 'Trip cancelled' : 'Advance trip status'}</Button>{canTransitionTrip(selected.status, 'cancelled') && <Button variant="danger" onClick={() => void cancelTrip()}>Cancel trip</Button>}</div>
                </div>
                {selected.milestones.length > 0 && (
                  <div className="trip-detail__activity">
                    <h3>Trip activity</h3>
                    <ul>{[...selected.milestones].reverse().map((milestone, index) => <li key={`${milestone}-${index}`}><span aria-hidden="true" /><strong>{milestone}</strong></li>)}</ul>
                  </div>
                )}
              </Card>

              <Card className="trip-detail__card">
                <div className="trip-detail__card-heading">
                  <div><p className="eyebrow">Schedule & equipment</p><h2>Trip details</h2></div>
                </div>
                <dl className="trip-detail__info-grid">
                  <div><dt>Job number</dt><dd>{job?.jobNumber ?? 'Not linked'}</dd></div>
                  <div><dt>Customer</dt><dd>{customer?.name ?? 'Not assigned'}</dd></div>
                  <div><dt>Trip type</dt><dd>{selected.tripType?.replaceAll('-', ' ') ?? (selected.subcontractor ? 'Subcontracted haulage' : 'Haulage')}</dd></div>
                  <div><dt>Shipment</dt><dd>{linkedShipment ? `${linkedShipment.reference} · ${linkedShipment.origin} → ${linkedShipment.destination}` : 'Not linked'}</dd></div>
                  <div><dt>Container</dt><dd>{linkedContainer ? `${linkedContainer.containerNumber} · ${linkedContainer.size}` : 'Not linked'}</dd></div>
                  <div><dt>Planned pickup</dt><dd>{formatDateTime(selected.plannedPickup)}</dd></div>
                  <div><dt>Planned delivery</dt><dd>{formatDateTime(selected.plannedDelivery)}</dd></div>
                  <div><dt>Port appointment / slot</dt><dd>{formatDateTime(selected.portAppointment)}{selected.portSlot ? ` · ${selected.portSlot}` : ''}</dd></div>
                  <div><dt>Driver instructions</dt><dd>{selected.instructions ?? 'No special instructions'}</dd></div>
                  <div><dt>Empty container pickup</dt><dd>{formatDateTime(selected.emptyPickup)}</dd></div>
                  <div><dt>Laden delivery</dt><dd>{formatDateTime(selected.ladenDelivery)}</dd></div>
                  <div><dt>Empty container return</dt><dd>{formatDateTime(selected.returnEmpty)}</dd></div>
                  <div><dt>Trailer type</dt><dd>{trailer?.type ?? 'Not assigned'}</dd></div>
                  <div><dt>Assignment</dt><dd>{selected.subcontractor ? selected.subcontractorName ?? 'Subcontractor' : 'Company fleet'}</dd></div>
                </dl>
              </Card>
            </div>

            <aside className="trip-detail__aside">
              <Card className="trip-detail__card trip-detail__cost-card">
                <div className="trip-detail__card-heading">
                  <div><p className="eyebrow">Trip costing</p><h2>Cost breakdown</h2></div>
                  <span className="trip-detail__currency">MYR</span>
                </div>
                <div className="trip-detail__cost-lines">
                  <div className="trip-detail__cost-line trip-detail__cost-line--revenue"><span>Customer billing</span><strong>{formatAmount(selected.billingAmount)}</strong></div>
                  <div className="trip-detail__cost-line"><span>Trucking</span><strong>− {formatAmount(selected.truckingCost)}</strong></div>
                  <div className="trip-detail__cost-line"><span>Toll</span><strong>− {formatAmount(selected.tollCost)}</strong></div>
                  <div className="trip-detail__cost-line"><span>Other trip costs</span><strong>− {formatAmount(selected.otherCost)}</strong></div>
                </div>
                <div className="trip-detail__expense-note"><span>Estimated (not posted)</span><strong>{formatAmount((selected.estimatedTruckingCost ?? 0) + (selected.estimatedTollCost ?? 0) + (selected.estimatedOtherCost ?? 0))}</strong><small>{selected.subcontractor ? `Separate subcontractor haulage ${formatAmount(selected.subcontractorHaulageCost ?? selected.estimatedTruckingCost ?? 0)}` : `Trucking ${formatAmount(selected.estimatedTruckingCost ?? 0)}`} · toll {formatAmount(selected.estimatedTollCost ?? 0)} · other {formatAmount(selected.estimatedOtherCost ?? 0)}</small></div>
                <div className={`trip-detail__profit${tripProfit < 0 ? ' trip-detail__profit--negative' : ''}`}>
                  <span>Trip gross profit</span><strong>{formatAmount(tripProfit)}</strong>
                  <small>RM {formatAmount(selected.billingAmount)} billing less RM {formatAmount(tripCost)} operating costs and approved expenses</small>
                </div>
                <div className="trip-detail__job-profit">
                  <span>Linked job gross profit</span><strong>{formatAmount(financials.grossProfit)}</strong>
                </div>
                {tripExpenses > 0 && (
                  <div className="trip-detail__expense-note">
                    <span>Expenses awaiting review</span><strong>{formatAmount(tripExpenses)}</strong>
                    <small>Submitted trip expenses are shown separately and are not included in trip gross profit.</small>
                  </div>
                )}
                {approvedExpenses > 0 && (
                  <div className="trip-detail__expense-note">
                    <span>Approved / paid driver expenses</span><strong>{formatAmount(approvedExpenses)}</strong>
                  </div>
                )}
              </Card>

              <Card className="trip-detail__card">
                <div className="trip-detail__card-heading"><div><p className="eyebrow">Shared record history</p><h2>Trip activity</h2></div></div>
                <ul className="trip-detail__expense-list">{state.activity.filter((event) => event.entityId === selected.id).slice(-8).reverse().map((event) => <li key={event.id}><span className="trip-detail__expense-icon" aria-hidden="true">•</span><span className="trip-detail__expense-copy"><strong>{event.action}</strong><small>{event.actor} · {formatDateTime(event.occurredAt)}</small></span></li>)}</ul>
                {state.activity.every((event) => event.entityId !== selected.id) && <p className="trip-detail__empty">No trip activity has been recorded yet.</p>}
              </Card>

              <Card className="trip-detail__card trip-detail__expenses-card">
                <div className="trip-detail__card-heading">
                  <div><p className="eyebrow">Driver submissions</p><h2>Trip expenses</h2></div>
                  <span className="trip-detail__stage-count">{expenses.length}</span>
                </div>
                {expenses.length > 0 ? (
                  <ul className="trip-detail__expense-list">
                    {expenses.map((expense) => (
                      <li key={expense.id}>
                        <span className="trip-detail__expense-icon" aria-hidden="true">RM</span>
                        <span className="trip-detail__expense-copy"><strong>{expense.description}</strong><small>{expense.status.replaceAll('-', ' ')}</small></span>
                        <strong className="trip-detail__expense-amount">{formatAmount(expense.amount)}</strong>
                        {expense.status === 'submitted' && <Button variant="ghost" onClick={() => approveExpense(expense)}>Approve</Button>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="trip-detail__empty">No expenses have been submitted for this trip.</p>}
              </Card>
            </aside>
          </div>
        </div>
      </Shell>
    )
  }
  if (screen === 'trucks') return <TruckMaster onNavigate={setScreen} />
  if (screen === 'trailers') return <TrailerMaster onNavigate={setScreen} />
  if (screen === 'drivers') return <DriverMaster onNavigate={setScreen} />
  if (screen === 'plan') return <TripPlanningForm initialJobId={planningJobId} onCancel={() => setScreen('list')} onSaved={(trip) => { setSelected(trip); setScreen('list') }} />
  const trips = state.trips.filter((trip) => !initialJobId || trip.jobId === initialJobId)
  return <Shell title="Haulage & Trips" description="Plan linked job trips, maintain fleet masters and publish assignments to the Driver App." action={<Button onClick={() => { setPlanningJobId(initialJobId); setScreen('plan') }}>＋ Plan trip</Button>}>
    <div className="module-tabs" aria-label="Haulage modules"><Button variant={screen === 'list' ? 'primary' : 'secondary'} onClick={() => setScreen('list')}>Trips</Button><Button variant="secondary" onClick={() => setScreen('trucks')}>Truck Master · {state.trucks.length}</Button><Button variant="secondary" onClick={() => setScreen('trailers')}>Trailer Master · {state.trailers.length}</Button><Button variant="secondary" onClick={() => setScreen('drivers')}>Driver Master · {state.drivers.length}</Button></div>
    <Card className="trip-list-card"><DataTable headers={['Trip', 'Job', 'Shipment / container', 'Trip type', 'Schedule', 'Driver / subcontractor', 'Truck / trailer', 'Status', 'Rate', 'Action']} rows={trips.map((trip) => {
      const assignedDriver = state.drivers.find((driver) => driver.id === trip.driverId)
      return [trip.tripNumber, state.jobs.find((job) => job.id === trip.jobId)?.jobNumber ?? 'Job missing', `${state.shipments.find((shipment) => shipment.id === trip.shipmentId)?.reference ?? '—'} / ${state.containers.find((container) => container.id === trip.containerId)?.containerNumber ?? '—'}`, trip.tripType?.replaceAll('-', ' ') ?? 'Haulage', `${trip.plannedPickup ? new Date(trip.plannedPickup).toLocaleString('en-MY') : 'Not scheduled'} → ${trip.plannedDelivery ? new Date(trip.plannedDelivery).toLocaleString('en-MY') : 'Not scheduled'}`, trip.subcontractor ? trip.subcontractorName ?? 'Subcontractor' : assignedDriver?.name ?? 'Unassigned', `${state.trucks.find((truck) => truck.id === trip.truckId)?.registrationNumber ?? '—'} / ${state.trailers.find((trailer) => trailer.id === trip.trailerId)?.registrationNumber ?? '—'}`, <StatusBadge tone={tone(trip.status)}>{trip.status.replaceAll('-', ' ')}</StatusBadge>, `RM ${trip.billingAmount.toLocaleString('en-MY')}`, <Button variant="ghost" onClick={() => setSelected(trip)}>Details</Button>]
    })} /></Card>
    <div className="content-grid content-grid--wide"><Card><p className="eyebrow">Fleet availability</p><h2>Resource summary</h2><div className="detail-grid"><span>Drivers<strong>{state.drivers.filter((driver) => driver.status === 'available').length} available / {state.drivers.length} total</strong></span><span>Trucks<strong>{state.trucks.filter((truck) => truck.status === 'available').length} available / {state.trucks.length} total</strong></span><span>Trailers<strong>{state.trailers.filter((trailer) => trailer.status === 'available').length} available / {state.trailers.length} total</strong></span><span>Active trips<strong>{state.trips.filter((trip) => ['planned', 'assigned', 'in-progress'].includes(trip.status)).length}</strong></span></div></Card><Card><p className="eyebrow">Estimated vs actual</p><h2>Planning costs</h2><p className="card-copy">Estimates are separate from posted costs. Update actual amounts through the operational expense and supplier-cost workflows after trip completion.</p><div className="detail-grid"><span>Total estimated costs<strong>RM {trips.reduce((sum, trip) => sum + (trip.estimatedTruckingCost ?? 0) + (trip.estimatedTollCost ?? 0) + (trip.estimatedOtherCost ?? 0), 0).toLocaleString('en-MY')}</strong></span><span>Total actual trip costs<strong>RM {trips.reduce((sum, trip) => sum + trip.truckingCost + trip.tollCost + trip.otherCost, 0).toLocaleString('en-MY')}</strong></span></div></Card></div>
  </Shell>
}

export function OperationsModules({ kind, initialJobId, initialTripId }: { kind: 'forwarding' | 'customs' | 'containers' | 'haulage'; initialJobId?: string; initialTripId?: string }) {
  return kind === 'forwarding' ? <Forwarding initialJobId={initialJobId} /> : kind === 'customs' ? <Customs /> : kind === 'containers' ? <Containers /> : <Haulage initialJobId={initialJobId} initialTripId={initialTripId} />
}
