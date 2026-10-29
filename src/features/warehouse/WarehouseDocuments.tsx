import { useMemo, useState, type ChangeEvent } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateAvailableInventory, calculateReservedInventory, calculateStorageChargePreview } from '../../domain/calculations.ts'
import type { DocumentCategory, DocumentMetadata, InventoryRecord, WarehouseTransaction } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { createStorageCharge, generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { OutboundWorkflow } from './OutboundWorkflow.tsx'

const idFor = (prefix: string, count: number) => `${prefix}-${String(count + 1).padStart(4, '0')}`
const categories: DocumentCategory[] = ['job-docket', 'quotation', 'booking', 'packing-list', 'grn', 'bl', 'customs', 'edo-gate-pass', 'delivery-order', 'label', 'pod', 'photo', 'damage-photo', 'supplier-invoice', 'invoice', 'einvoice', 'voucher', 'reconciliation', 'receipt', 'email']
const categoryLabel = (category: DocumentCategory) => category.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function TariffConfiguration() {
  const { state, dispatch } = useAppState()
  return <Card><div className="section-heading"><div><p className="eyebrow">Storage billing</p><h2>Tariff configuration</h2></div><StatusBadge tone="info">Shared demo rules</StatusBadge></div><DataTable headers={['Rule', 'Unit', 'Rate', 'Free days', 'Period', 'Action']} rows={state.storageRules.map((rule) => [rule.id, rule.unit, <input aria-label={`${rule.id} rate`} min="0" onChange={(event) => dispatch({ type: 'update-storage-rule', rule: { ...rule, rate: Number(event.target.value) } })} type="number" value={rule.rate} />, <input aria-label={`${rule.id} free days`} min="0" onChange={(event) => dispatch({ type: 'update-storage-rule', rule: { ...rule, freeDays: Number(event.target.value) } })} type="number" value={rule.freeDays} />, rule.period, <StatusBadge tone="success">Configurable</StatusBadge>])} /></Card>
}

function WarehousePage({ initialJobId }: { initialJobId?: string }) {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [mode, setMode] = useState<'inbound' | 'outbound'>('inbound')
  const [jobId, setJobId] = useState(initialJobId ?? state.jobs[0]?.id ?? '')
  const [containerId, setContainerId] = useState(state.containers.find((container) => container.jobId === (initialJobId ?? state.jobs[0]?.id))?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState<'carton' | 'pallet' | 'CBM'>('carton')
  const [sku, setSku] = useState('DEMO-SKU-01')
  const [description, setDescription] = useState('Warehouse cargo')
  const [batchLot, setBatchLot] = useState('')
  const [expectedQuantity, setExpectedQuantity] = useState('')
  const [palletisedQuantity, setPalletisedQuantity] = useState('')
  const [discrepancyNote, setDiscrepancyNote] = useState('')
  const [putAwayBins, setPutAwayBins] = useState<Record<string, string>>({})
  const [reference, setReference] = useState('')
  const [photoEvidence, setPhotoEvidence] = useState(true)
  const [selectedInventory, setSelectedInventory] = useState<InventoryRecord | undefined>()
  const [startDate, setStartDate] = useState(state.demoDate)
  const [endDate, setEndDate] = useState('2026-11-05')
  const [tariffCustomer, setTariffCustomer] = useState(state.customers[0]?.id ?? '')
  const [storageInventoryId, setStorageInventoryId] = useState('')
  const selectedCustomer = state.customers.find((customer) => customer.id === tariffCustomer)
  const selectedRule = state.storageRules.find((rule) => rule.id === selectedCustomer?.storageRuleId) ?? state.storageRules[0]
  const storageInventory = state.inventory.find((item) => item.id === storageInventoryId && item.customerId === tariffCustomer)
  const previewQuantity = storageInventory && selectedRule
    ? (() => {
      const available = calculateAvailableInventory(storageInventory, state.warehouseTransactions, state.inventory)
      return selectedRule.unit === 'cbm' ? available.cbm : selectedRule.unit === 'pallet' ? available.pallets : available.cartons
    })()
    : 0
  const preview = selectedRule && storageInventory ? calculateStorageChargePreview(selectedRule, previewQuantity, startDate, endDate) : undefined
  const inventoryWithBalance = useMemo(() => state.inventory.map((item) => {
    return { item, balance: calculateAvailableInventory(item, state.warehouseTransactions, state.inventory) }
  }), [state.inventory, state.warehouseTransactions])
  const workflowSwitcher = <div className="filter-bar" aria-label="Warehouse workflow">
    <Button variant={mode === 'inbound' ? 'primary' : 'secondary'} onClick={() => setMode('inbound')}>Inbound</Button>
    <Button variant={mode === 'outbound' ? 'primary' : 'secondary'} onClick={() => setMode('outbound')}>Outbound</Button>
  </div>

  const createStorageBilling = () => {
    const result = createStorageCharge(state, { inventoryId: storageInventoryId, periodStart: startDate, periodEnd: endDate })
    if (result.errors.length || !result.storageCharge || !result.charge) {
      showToast(result.errors.join(' ') || 'Storage charge could not be created.')
      return
    }
    dispatch({ type: 'add-storage-charge-bundle', storageCharge: result.storageCharge, charge: result.charge })
    dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'charge', entityId: result.charge.id, action: `Storage charge generated · RM ${result.charge.unitPrice.toLocaleString('en-MY')}`, actor: 'Warehouse operations', occurredAt: state.demoDate } })
    showToast(`Storage charge ${result.charge.reference ?? result.charge.id} added to billing.`)
  }

  const submitMovement = () => {
    if (!jobId || !Number.isFinite(quantity) || quantity <= 0 || (unit !== 'CBM' && !Number.isInteger(quantity)) || !reference.trim()) { showToast('Job, a valid quantity and a reference are required. Carton and pallet counts must be whole numbers.'); return }
    if (mode === 'inbound' && (!sku.trim() || !description.trim())) { showToast('SKU and cargo description are required for an inbound receipt.'); return }
    if (mode === 'inbound' && expectedQuantity && (!Number.isFinite(Number(expectedQuantity)) || Number(expectedQuantity) < 0 || (unit !== 'CBM' && !Number.isInteger(Number(expectedQuantity))))) { showToast('Expected cargo count must be a valid non-negative quantity in the selected unit.'); return }
    if (mode === 'inbound' && expectedQuantity && Number(expectedQuantity) !== quantity && !discrepancyNote.trim()) { showToast('Record the short or damaged cargo discrepancy when the counted quantity differs from the expected quantity.'); return }
    if (mode === 'inbound' && (!Number.isFinite(Number(palletisedQuantity || 0)) || Number(palletisedQuantity || 0) < 0 || !Number.isInteger(Number(palletisedQuantity || 0)))) { showToast('Palletised quantity must be a non-negative whole number.'); return }
    if (mode === 'inbound' && Number(palletisedQuantity) > 0 && unit !== 'carton') { showToast('Enter palletisation only when receiving cartons.'); return }
    const target = inventoryWithBalance.find(({ item }) => item.id === selectedInventory?.id)
    if (containerId && !state.containers.some((container) => container.id === containerId && container.jobId === jobId)) { showToast('The selected container must belong to this job.'); return }
    if (mode === 'outbound' && (!target || target.item.jobId !== jobId)) { showToast('Select inventory linked to the selected job before dispatching.'); return }
    if (mode === 'outbound' && target) {
      const available = calculateAvailableInventory(target.item, state.warehouseTransactions, state.inventory)[unit === 'carton' ? 'cartons' : unit === 'pallet' ? 'pallets' : 'cbm']
      if (quantity > available) { showToast(`Dispatch exceeds available stock of ${available} ${unit}.`); return }
    }
    const movementType = mode === 'inbound' ? 'receiving' : 'dispatch'
    if (state.warehouseTransactions.some((transaction) => transaction.jobId === jobId && transaction.type === movementType && transaction.reference?.toLowerCase() === reference.trim().toLowerCase())) {
      showToast('That warehouse reference already has a matching stock movement.')
      return
    }

    const existing = mode === 'inbound' ? state.inventory.find((item) => item.jobId === jobId && item.sku.toLowerCase() === sku.trim().toLowerCase() && (item.batchLot ?? '') === batchLot.trim() && (item.containerId ?? '') === containerId) : undefined
    const inventory = mode === 'inbound'
      ? existing
        ? { ...existing, cartons: existing.cartons + (unit === 'carton' ? quantity : 0), pallets: existing.pallets + (unit === 'pallet' ? quantity : 0) + Number(palletisedQuantity || 0), cbm: existing.cbm + (unit === 'CBM' ? quantity : 0) }
        : { id: generateRecordId(state, 'inventory'), jobId, customerId: state.jobs.find((job) => job.id === jobId)?.customerId, containerId: containerId || undefined, sku: sku.trim(), description: description.trim(), cartons: unit === 'carton' ? quantity : 0, pallets: (unit === 'pallet' ? quantity : 0) + Number(palletisedQuantity || 0), cbm: unit === 'CBM' ? quantity : 0, weightKg: 0, bin: 'Receiving bay', batchLot: batchLot.trim() || undefined, status: 'stored' as const }
      : target?.item
    if (!inventory) { showToast('Inventory could not be resolved for this movement.'); return }

    const transaction: WarehouseTransaction = {
      id: generateRecordId(state, 'warehouseTransactions'),
      jobId,
      containerId: containerId || undefined,
      inventoryId: inventory.id,
      type: movementType,
      quantity,
      unit,
      reference: reference.trim(),
      note: mode === 'inbound'
        ? `Unloaded and counted ${quantity} ${unit}${expectedQuantity ? ` / ${expectedQuantity} expected` : ''}${discrepancyNote.trim() ? ` · Discrepancy: ${discrepancyNote.trim()}` : ''}`
        : 'Dispatch and POD pending',
      occurredAt: state.demoDate,
    }

    if (mode === 'inbound') {
      const inbound = { id: generateRecordId(state, 'warehouseInbounds'), jobId, containerId: containerId || undefined, reference: reference.trim(), status: 'received' as const, receivedAt: state.demoDate, transactionId: transaction.id, inventoryId: inventory.id, expectedQuantity: expectedQuantity ? Number(expectedQuantity) : undefined, countedQuantity: quantity, discrepancyNote: discrepancyNote.trim() || undefined }
      const note = { id: generateRecordId(state, 'goodsReceivedNotes'), warehouseInboundId: inbound.id, jobId, grnNumber: reference.trim(), receivedAt: state.demoDate, status: 'confirmed' as const }
      if (existing) dispatch({ type: 'update-inventory', inventory })
      else dispatch({ type: 'add-inventory', inventory })
      dispatch({ type: 'add-warehouse-transaction', transaction })
      if (Number(palletisedQuantity) > 0) dispatch({ type: 'add-warehouse-transaction', transaction: { id: generateStableId('wh', [...state.warehouseTransactions, transaction]), jobId, containerId: containerId || undefined, inventoryId: inventory.id, type: 'palletisation', quantity: Number(palletisedQuantity), unit: 'pallet', reference: reference.trim(), note: `Palletised ${quantity} cartons into ${palletisedQuantity} pallets`, occurredAt: state.demoDate } })
      dispatch({ type: 'add-warehouse-inbound', inbound })
      dispatch({ type: 'add-goods-received-note', note })
      const newDocuments: DocumentMetadata[] = []
      const addDocument = (document: Omit<DocumentMetadata, 'id'>) => newDocuments.push({ ...document, id: generateStableId('doc', [...state.documents, ...newDocuments]) })
      if (photoEvidence) addDocument({ jobId, name: `${reference.trim()}-receiving-photo.jpg`, category: 'photo', status: 'available', uploadedAt: state.demoDate, mimeType: 'image/jpeg', accessRule: 'internal', previewText: 'Simulated receiving damage/shortage evidence.' })
      addDocument({ jobId, name: `${reference.trim()}-GRN.pdf`, category: 'grn', status: 'available', uploadedAt: state.demoDate, relatedRecordId: note.id, accessRule: 'internal', previewText: `Goods received note for ${quantity} ${unit}.` })
      addDocument({ jobId, name: `${reference.trim()}-${sku.trim()}-labels.pdf`, category: 'label', status: 'available', uploadedAt: state.demoDate, relatedRecordId: inbound.id, accessRule: 'internal', previewText: `SKU ${sku.trim()}${batchLot.trim() ? ` · Batch ${batchLot.trim()}` : ''}` })
      newDocuments.forEach((document) => dispatch({ type: 'add-document', document }))
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'warehouse-inbound', entityId: inbound.id, action: `Received ${quantity} ${unit} · ${reference.trim()}`, actor: 'Warehouse operations', occurredAt: state.demoDate } })
    } else if (target) {
      const available = calculateAvailableInventory(target.item, state.warehouseTransactions, state.inventory)
      const remaining = available[unit === 'carton' ? 'cartons' : unit === 'pallet' ? 'pallets' : 'cbm'] - quantity
      const order = { id: generateRecordId(state, 'outboundOrders'), jobId, inventoryId: inventory.id, deliveryOrderNumber: reference.trim(), quantity, unit, status: 'dispatched' as const, createdAt: state.demoDate, dispatchedAt: state.demoDate, transactionId: transaction.id }
      dispatch({ type: 'add-warehouse-transaction', transaction })
      dispatch({ type: 'add-outbound-order', order })
      dispatch({ type: 'update-inventory', inventory: { ...target.item, status: remaining === 0 && unit === 'carton' ? 'dispatched' : 'allocated' } })
      dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'outbound-order', entityId: order.id, action: `Dispatched ${quantity} ${unit} · ${reference.trim()}`, actor: 'Warehouse operations', occurredAt: state.demoDate } })
    }
    showToast(`${mode === 'inbound' ? 'Inbound receipt' : 'Outbound dispatch'} recorded.`)
    setReference('')
    setExpectedQuantity('')
    setPalletisedQuantity('')
    setDiscrepancyNote('')
  }

  const putAway = (item: InventoryRecord) => {
    const bin = (putAwayBins[item.id] ?? '').trim()
    if (!bin) { showToast('Enter a put-away bin or rack location.'); return }
    if (bin === item.bin) { showToast('Inventory is already in that bin or rack.'); return }
    dispatch({ type: 'update-inventory', inventory: { ...item, bin } })
    dispatch({ type: 'add-warehouse-transaction', transaction: { id: generateRecordId(state, 'warehouseTransactions'), jobId: item.jobId, containerId: item.containerId, inventoryId: item.id, type: 'putaway', quantity: 0, unit: 'carton', reference: `PUT-${item.sku}-${state.demoDate}`, note: `Put away from ${item.bin} to ${bin}`, occurredAt: state.demoDate } })
    dispatch({ type: 'add-activity', activity: { id: generateRecordId(state, 'activity'), entityType: 'inventory', entityId: item.id, action: `${item.sku} put away to ${bin}`, actor: 'Warehouse operations', occurredAt: state.demoDate } })
    showToast(`${item.sku} put away to ${bin}.`)
    setPutAwayBins((current) => ({ ...current, [item.id]: '' }))
  }

  if (String(mode) === 'outbound') return <>
    <PageHeader
      eyebrow="Operations"
      title="Warehouse Outbound"
      description="Reserve eligible stock, pick, pack, load, dispatch and verify driver POD against shared jobs and trips."
      actions={workflowSwitcher}
    />
    <OutboundWorkflow initialJobId={initialJobId} />
    <Card>
      <div className="section-heading"><div><p className="eyebrow">Inventory control</p><h2>Physical stock and reservations</h2></div><StatusBadge tone="info">Dispatch-only stock movement</StatusBadge></div>
      <DataTable headers={['SKU', 'Job Number', 'Batch / lot', 'Physical available', 'Reserved', 'Free to reserve', 'Bin / rack']} rows={state.inventory.map((item) => {
        const balance = calculateAvailableInventory(item, state.warehouseTransactions, state.inventory)
        const units = ['carton', 'pallet', 'CBM'] as const
        const physical = units.map((unitName) => `${balance[unitName === 'carton' ? 'cartons' : unitName === 'pallet' ? 'pallets' : 'cbm']} ${unitName}`).join(' · ')
        const reservations = units.map((unitName) => `${calculateReservedInventory(item.id, state.outboundOrders, undefined, unitName)} ${unitName}`).join(' · ')
        const free = units.map((unitName) => {
          const available = balance[unitName === 'carton' ? 'cartons' : unitName === 'pallet' ? 'pallets' : 'cbm']
          return `${Math.max(0, available - calculateReservedInventory(item.id, state.outboundOrders, undefined, unitName))} ${unitName}`
        }).join(' · ')
        return [
          item.sku,
          state.jobs.find((job) => job.id === item.jobId)?.jobNumber ?? '—',
          item.batchLot ?? '—',
          physical,
          reservations,
          free,
          item.bin,
        ]
      })} />
    </Card>
  </>

  return <><PageHeader eyebrow="Operations" title="Warehouse & Storage" description="Receive, count, palletise, label and put away cargo while maintaining shared stock and storage billing." actions={workflowSwitcher} /><div className="content-grid content-grid--wide"><Card><div className="section-heading"><div><p className="eyebrow">Inbound / outbound</p><h2>{mode === 'inbound' ? 'Receiving and unloading' : 'Picking and dispatch'}</h2></div></div><div className="form-grid form-grid--three"><FormField label="Job Number"><select value={jobId} onChange={(event) => { setJobId(event.target.value); setContainerId(state.containers.find((container) => container.jobId === event.target.value)?.id ?? ''); setSelectedInventory(undefined) }}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Container"><select value={containerId} onChange={(event) => setContainerId(event.target.value)}><option value="">Not linked</option>{state.containers.filter((container) => container.jobId === jobId).map((container) => <option key={container.id} value={container.id}>{container.containerNumber}</option>)}</select></FormField><FormField label={mode === 'inbound' ? 'GRN / receiving reference' : 'Delivery order / POD reference'}><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === 'inbound' ? 'GRN-...' : 'DO-...'} /></FormField><FormField label="Counted quantity"><input min="1" step={unit === 'CBM' ? '0.01' : '1'} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></FormField><FormField label="Unit"><select value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}><option value="carton">Carton</option><option value="pallet">Pallet</option><option value="CBM">CBM</option></select></FormField>{mode === 'inbound' && <><FormField label="Expected quantity"><input min="0" step={unit === 'CBM' ? '0.01' : '1'} type="number" value={expectedQuantity} onChange={(event) => setExpectedQuantity(event.target.value)} /></FormField><FormField label="Discrepancy / damage note"><input value={discrepancyNote} onChange={(event) => setDiscrepancyNote(event.target.value)} placeholder="Required when expected and counted differ" /></FormField><FormField label="SKU"><input value={sku} onChange={(event) => setSku(event.target.value)} /></FormField><FormField label="Batch / lot"><input value={batchLot} onChange={(event) => setBatchLot(event.target.value)} /></FormField><FormField label="Cargo description"><input value={description} onChange={(event) => setDescription(event.target.value)} /></FormField><FormField label="Palletise into pallets"><input min="0" step="1" type="number" value={palletisedQuantity} onChange={(event) => setPalletisedQuantity(event.target.value)} /></FormField><FormField label="Evidence"><select value={photoEvidence ? 'photo' : 'none'} onChange={(event) => setPhotoEvidence(event.target.value === 'photo')}><option value="photo">Photo evidence simulation</option><option value="none">No photo attached</option></select></FormField></>}</div>{mode === 'outbound' && <FormField label="Inventory item"><select value={selectedInventory?.id ?? ''} onChange={(event) => setSelectedInventory(state.inventory.find((item) => item.id === event.target.value))}><option value="">Select inventory to dispatch</option>{inventoryWithBalance.filter(({ item }) => item.jobId === jobId).map(({ item, balance }) => { const available = calculateAvailableInventory(item, state.warehouseTransactions, state.inventory); const amount = unit === 'carton' ? balance.cartons : unit === 'pallet' ? available.pallets : available.cbm; return <option key={item.id} value={item.id}>{item.sku} · {amount} {unit} available</option> })}</select></FormField>}<div className="form-actions"><Button onClick={submitMovement}>{mode === 'inbound' ? 'Record receiving, GRN & labels' : 'Dispatch cargo'}</Button></div></Card><Card><div className="section-heading"><div><p className="eyebrow">Stock control</p><h2>Inventory balances</h2></div><StatusBadge tone="info">Negative stock blocked</StatusBadge></div><DataTable headers={['SKU', 'Job', 'Container', 'Batch / lot', 'Cartons available / received', 'Pallets available / received', 'CBM available / received', 'Put-away bin / rack', 'Put away']} rows={inventoryWithBalance.map(({ item, balance }) => [item.sku, state.jobs.find((job) => job.id === item.jobId)?.jobNumber, state.containers.find((container) => container.id === item.containerId)?.containerNumber ?? '—', item.batchLot ?? '—', `${balance.cartons} / ${item.cartons}`, `${balance.pallets} / ${item.pallets}`, `${balance.cbm} / ${item.cbm}`, <div><strong>{item.bin}</strong><input aria-label={`Put-away location for ${item.sku}`} value={putAwayBins[item.id] ?? ''} onChange={(event) => setPutAwayBins((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="New rack / bin" /></div>, <Button variant="ghost" onClick={() => putAway(item)}>Put away</Button>])} /></Card></div><div className="content-grid content-grid--wide"><TariffConfiguration /><Card><div className="section-heading"><div><p className="eyebrow">Storage billing</p><h2>Tariff calculation preview</h2></div><StatusBadge tone="warning">Demo assumption</StatusBadge></div><FormField label="Customer"><select value={tariffCustomer} onChange={(event) => { setTariffCustomer(event.target.value); setStorageInventoryId('') }}>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></FormField><FormField label="Inventory item"><select onChange={(event) => setStorageInventoryId(event.target.value)} value={storageInventoryId}><option value="">Select customer inventory</option>{state.inventory.filter((item) => item.customerId === tariffCustomer).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.description}</option>)}</select></FormField><div className="form-grid form-grid--three"><FormField label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></FormField><FormField label="End date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></FormField><span className="metric-card metric-card--inline"><small>Calculated amount</small><strong>RM {preview?.amount.toLocaleString('en-MY') ?? '0'}</strong></span></div>{preview && <div className="detail-grid"><span>Storage period<strong>{preview.calendarDays} calendar days</strong></span><span>Free period<strong>{preview.freeDays} days</strong></span><span>Chargeable duration<strong>{preview.chargeableDuration} {preview.period}s</strong></span><span>Chargeable quantity<strong>{preview.quantity} {preview.unit}</strong></span><span>Rate<strong>RM {preview.rate} / {preview.unit} / {preview.period}</strong></span><span>Job Number<strong>{state.jobs.find((job) => job.id === storageInventory?.jobId)?.jobNumber ?? 'Select inventory'}</strong></span></div>}<p className="form-hint">Demo policy: calendar days are counted from start date up to, but not including, end date. Daily rules apply free days; monthly rules bill each started 30-day period.</p>{storageInventory && <div className="form-actions"><Button disabled={!preview || preview.amount <= 0} onClick={createStorageBilling}>Generate storage charge</Button></div>}</Card><Card><p className="eyebrow">Warehouse activity</p><h2>Recent transactions</h2><DataTable headers={['Reference', 'Type', 'Quantity', 'Job', 'Date']} rows={state.warehouseTransactions.slice(-8).reverse().map((transaction) => [transaction.reference ?? '—', transaction.type, `${transaction.quantity} ${transaction.unit}`, state.jobs.find((job) => job.id === transaction.jobId)?.jobNumber, transaction.occurredAt])} /></Card><Card><p className="eyebrow">Receiving control</p><h2>Goods received notes</h2><DataTable headers={['GRN', 'Job', 'Container', 'Counted', 'Expected', 'Discrepancy', 'Status']} rows={state.goodsReceivedNotes.map((note) => { const inbound = state.warehouseInbounds.find((item) => item.id === note.warehouseInboundId); return [note.grnNumber, state.jobs.find((job) => job.id === note.jobId)?.jobNumber, state.containers.find((container) => container.id === inbound?.containerId)?.containerNumber ?? '—', inbound?.countedQuantity ?? '—', inbound?.expectedQuantity ?? '—', inbound?.discrepancyNote ?? 'None', note.status] })} /></Card></div></>
}

function DocumentsPage() {
  const { state, dispatch } = useAppState()
  const showToast = useToast()
  const [jobId, setJobId] = useState(state.jobs[0]?.id ?? '')
  const [category, setCategory] = useState<DocumentCategory>('packing-list')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<DocumentMetadata | undefined>()
  const documents = state.documents.filter((document) => document.jobId === jobId && `${document.name} ${categoryLabel(document.category)}`.toLowerCase().includes(query.toLowerCase()))
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const document: DocumentMetadata = { id: idFor('doc', state.documents.length), jobId, name: file.name, category, status: 'pending-review', uploadedAt: state.demoDate, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', accessRule: 'internal', previewText: 'Local browser/demo metadata only. No external upload was performed.' }
    dispatch({ type: 'add-document', document })
    dispatch({ type: 'add-activity', activity: { id: idFor('act', state.activity.length), entityType: 'document', entityId: document.id, action: `Added ${categoryLabel(category)}`, actor: 'Aina Noor', occurredAt: state.demoDate } })
    showToast('Document metadata added to the digital job folder.')
    event.target.value = ''
  }
  return <><PageHeader eyebrow="Operations" title="Document Management" description="Digital job folders with mock upload, categorisation, access rules and activity history." /><Card><div className="filter-bar"><FormField label="Job Number"><select value={jobId} onChange={(event) => setJobId(event.target.value)}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Category"><select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></FormField><label className="ui-button ui-button--primary">＋ Mock upload<input accept="*" onChange={upload} style={{ display: 'none' }} type="file" /></label><input aria-label="Search documents" onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." value={query} /></div><DataTable headers={['File', 'Category', 'Job', 'Source record', 'Status', 'Uploaded', 'Access', 'Actions']} rows={documents.map((document) => [document.name, categoryLabel(document.category), state.jobs.find((job) => job.id === document.jobId)?.jobNumber, document.relatedRecordId ?? '—', <StatusBadge tone={document.status === 'available' ? 'success' : 'warning'}>{document.status}</StatusBadge>, document.uploadedAt, document.accessRule ?? 'internal', <div className="table-actions"><Button variant="ghost" onClick={() => setPreview(document)}>Preview</Button><Button variant="ghost" onClick={() => showToast('Download is simulated in this browser-only demo.')}>Download</Button></div>])} /></Card>{preview && <Card className="detail-card"><div className="section-heading"><div><p className="eyebrow">Document preview</p><h2>{preview.name}</h2></div><Button variant="ghost" onClick={() => setPreview(undefined)}>Close</Button></div><div className="detail-grid"><span>Category<strong>{categoryLabel(preview.category)}</strong></span><span>Job Number<strong>{state.jobs.find((job) => job.id === preview.jobId)?.jobNumber}</strong></span><span>Source record<strong>{preview.relatedRecordId ?? 'Not linked'}</strong></span><span>Type<strong>{preview.mimeType ?? 'Mock metadata'}</strong></span><span>Size<strong>{preview.sizeBytes ? `${Math.ceil(preview.sizeBytes / 1024)} KB` : 'Seed document'}</strong></span><span>Access rule<strong>{preview.accessRule ?? 'internal'}</strong></span><span>Activity<strong>{state.activity.find((event) => event.entityId === preview.id)?.action ?? 'Seeded document'}</strong></span></div><p className="form-hint">{preview.previewText ?? 'Preview is represented by metadata for this demo.'}</p></Card>}</>
}

export function WarehouseDocuments({ kind, initialJobId }: { kind: 'warehouse' | 'documents'; initialJobId?: string }) {
  const queryJobId = new URLSearchParams(window.location.search).get('jobId') ?? undefined
  const selectedJobId = initialJobId ?? queryJobId
  return kind === 'warehouse' ? <WarehousePage initialJobId={selectedJobId} /> : <DocumentsPage />
}
