import { useMemo, useState, type ChangeEvent } from 'react'
import { Button, Card, DataTable, FormField, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { useToast } from '../../components/ToastProvider.tsx'
import { calculateAvailableInventory, calculateReservedInventory, calculateStorageChargePreview } from '../../domain/calculations.ts'
import type { DocumentCategory, DocumentMetadata, InventoryRecord, WarehouseInboundItem, WarehouseTransaction } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'
import { createStorageCharge, generateRecordId, generateStableId } from '../../services/mockDataService.ts'
import { OutboundWorkflow } from './OutboundWorkflow.tsx'
import './WarehouseDocuments.css'

const idFor = (prefix: string, count: number) => `${prefix}-${String(count + 1).padStart(4, '0')}`
const categories: DocumentCategory[] = ['job-docket', 'quotation', 'booking', 'packing-list', 'grn', 'bl', 'customs', 'edo-gate-pass', 'delivery-order', 'label', 'pod', 'photo', 'damage-photo', 'supplier-invoice', 'invoice', 'einvoice', 'voucher', 'reconciliation', 'receipt', 'email']
const categoryLabel = (category: DocumentCategory) => category.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
type WarehouseReceiptLine = {
  id: number
  sku: string
  description: string
  quantity: string
  unit: 'carton' | 'pallet' | 'CBM'
  expectedQuantity: string
  palletisedQuantity: string
  batchLot: string
  discrepancyNote: string
}

const createReceiptLine = (id: number): WarehouseReceiptLine => ({
  id,
  sku: '',
  description: '',
  quantity: '1',
  unit: 'carton',
  expectedQuantity: '',
  palletisedQuantity: '',
  batchLot: '',
  discrepancyNote: '',
})

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
  const [receiptLines, setReceiptLines] = useState<WarehouseReceiptLine[]>([createReceiptLine(1)])
  const [nextReceiptLineId, setNextReceiptLineId] = useState(2)
  const [putAwayBins, setPutAwayBins] = useState<Record<string, string>>({})
  const [reference, setReference] = useState('')
  const [photoEvidence, setPhotoEvidence] = useState(true)
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

  const submitInbound = () => {
    const receiptReference = reference.trim()
    if (!jobId || !receiptReference) {
      showToast('Select a job and enter the goods-received reference.')
      return
    }
    if (containerId && !state.containers.some((container) => container.id === containerId && container.jobId === jobId)) {
      showToast('The selected container must belong to this job.')
      return
    }
    if (!receiptLines.length) {
      showToast('Add at least one SKU line to the receipt.')
      return
    }

    const seenSkus = new Set<string>()
    for (const [index, line] of receiptLines.entries()) {
      const lineNumber = index + 1
      const countedQuantity = Number(line.quantity)
      const expected = line.expectedQuantity.trim() ? Number(line.expectedQuantity) : undefined
      const pallets = Number(line.palletisedQuantity || 0)
      const skuKey = `${line.sku.trim().toLowerCase()}|${line.batchLot.trim().toLowerCase()}`
      if (!line.sku.trim() || !line.description.trim()) {
        showToast(`Enter an SKU and cargo description on line ${lineNumber}.`)
        return
      }
      if (seenSkus.has(skuKey)) {
        showToast(`SKU and batch/lot must be unique within this receipt. Check line ${lineNumber}.`)
        return
      }
      seenSkus.add(skuKey)
      if (!Number.isFinite(countedQuantity) || countedQuantity <= 0 || (line.unit !== 'CBM' && !Number.isInteger(countedQuantity))) {
        showToast(`Enter a valid counted quantity on line ${lineNumber}; carton and pallet quantities must be whole numbers.`)
        return
      }
      if (expected !== undefined && (!Number.isFinite(expected) || expected < 0 || (line.unit !== 'CBM' && !Number.isInteger(expected)))) {
        showToast(`Enter a valid expected quantity on line ${lineNumber}.`)
        return
      }
      if (expected !== undefined && expected !== countedQuantity && !line.discrepancyNote.trim()) {
        showToast(`Record the short or damaged cargo discrepancy on line ${lineNumber}.`)
        return
      }
      if (!Number.isInteger(pallets) || pallets < 0 || (pallets > 0 && line.unit !== 'carton')) {
        showToast(`Palletise cartons only, using a whole pallet count on line ${lineNumber}.`)
        return
      }
    }

    if (state.warehouseTransactions.some((transaction) =>
      transaction.jobId === jobId
      && transaction.type === 'receiving'
      && transaction.reference?.toLowerCase() === receiptReference.toLowerCase(),
    )) {
      showToast('That receiving reference has already been recorded for this job.')
      return
    }

    const customerId = state.jobs.find((job) => job.id === jobId)?.customerId
    const stagedTransactions: WarehouseTransaction[] = []
    const stagedInventoryIds: { id: string }[] = []
    const inboundItems: WarehouseInboundItem[] = []
    const labelDocuments: DocumentMetadata[] = []
    let firstInventory: InventoryRecord | undefined

    receiptLines.forEach((line) => {
      const skuCode = line.sku.trim()
      const batch = line.batchLot.trim()
      const countedQuantity = Number(line.quantity)
      const expected = line.expectedQuantity.trim() ? Number(line.expectedQuantity) : undefined
      const pallets = Number(line.palletisedQuantity || 0)
      const existing = state.inventory.find((item) =>
        item.jobId === jobId
        && item.sku.toLowerCase() === skuCode.toLowerCase()
        && (item.batchLot ?? '') === batch
        && (item.containerId ?? '') === containerId,
      )
      const inventory: InventoryRecord = existing
        ? {
          ...existing,
          cartons: existing.cartons + (line.unit === 'carton' ? countedQuantity : 0),
          pallets: existing.pallets + (line.unit === 'pallet' ? countedQuantity : 0) + pallets,
          cbm: existing.cbm + (line.unit === 'CBM' ? countedQuantity : 0),
        }
        : {
          id: generateStableId('inventory', [...state.inventory, ...stagedInventoryIds]),
          jobId,
          customerId,
          containerId: containerId || undefined,
          sku: skuCode,
          description: line.description.trim(),
          cartons: line.unit === 'carton' ? countedQuantity : 0,
          pallets: (line.unit === 'pallet' ? countedQuantity : 0) + pallets,
          cbm: line.unit === 'CBM' ? countedQuantity : 0,
          weightKg: 0,
          bin: 'Receiving bay',
          batchLot: batch || undefined,
          status: 'stored',
        }
      firstInventory ??= inventory
      if (!existing) stagedInventoryIds.push({ id: inventory.id })

      const receiving: WarehouseTransaction = {
        id: generateStableId('wh', [...state.warehouseTransactions, ...stagedTransactions]),
        jobId,
        containerId: containerId || undefined,
        inventoryId: inventory.id,
        type: 'receiving',
        quantity: countedQuantity,
        unit: line.unit,
        reference: receiptReference,
        note: `Received ${countedQuantity} ${line.unit}${expected !== undefined ? ` / ${expected} expected` : ''}${line.discrepancyNote.trim() ? ` · Discrepancy: ${line.discrepancyNote.trim()}` : ''}`,
        occurredAt: state.demoDate,
      }
      stagedTransactions.push(receiving)
      inboundItems.push({
        inventoryId: inventory.id,
        transactionId: receiving.id,
        sku: skuCode,
        unit: line.unit,
        expectedQuantity: expected,
        countedQuantity,
        palletisedQuantity: pallets || undefined,
        discrepancyNote: line.discrepancyNote.trim() || undefined,
      })

      if (pallets > 0) {
        stagedTransactions.push({
          id: generateStableId('wh', [...state.warehouseTransactions, ...stagedTransactions]),
          jobId,
          containerId: containerId || undefined,
          inventoryId: inventory.id,
          type: 'palletisation',
          quantity: pallets,
          unit: 'pallet',
          reference: receiptReference,
          note: `Palletised ${countedQuantity} cartons into ${pallets} pallets · ${skuCode}`,
          occurredAt: state.demoDate,
        })
      }

      if (existing) dispatch({ type: 'update-inventory', inventory })
      else dispatch({ type: 'add-inventory', inventory })
      dispatch({ type: 'add-warehouse-transaction', transaction: receiving })
      const palletisation = stagedTransactions.at(-1)
      if (pallets > 0 && palletisation?.type === 'palletisation') {
        dispatch({ type: 'add-warehouse-transaction', transaction: palletisation })
      }
      labelDocuments.push({
        id: generateStableId('doc', [
          ...state.documents,
          { id: generateStableId('doc', state.documents) },
          ...labelDocuments,
        ]),
        jobId,
        name: `${receiptReference}-${skuCode}-labels.pdf`,
        category: 'label',
        status: 'available',
        uploadedAt: state.demoDate,
        relatedRecordId: inventory.id,
        accessRule: 'internal',
        previewText: `SKU ${skuCode}${batch ? ` · Batch ${batch}` : ''} · ${countedQuantity} ${line.unit} · ${pallets} pallets`,
      })
    })

    if (!firstInventory) {
      showToast('No valid inventory lines were available to receive.')
      return
    }
    const firstItem = inboundItems[0]
    const inbound = {
      id: generateRecordId(state, 'warehouseInbounds'),
      jobId,
      containerId: containerId || undefined,
      reference: receiptReference,
      status: 'received' as const,
      receivedAt: state.demoDate,
      transactionId: firstItem.transactionId,
      inventoryId: firstItem.inventoryId,
      expectedQuantity: firstItem.expectedQuantity,
      countedQuantity: firstItem.countedQuantity,
      discrepancyNote: firstItem.discrepancyNote,
      items: inboundItems,
    }
    const note = {
      id: generateRecordId(state, 'goodsReceivedNotes'),
      warehouseInboundId: inbound.id,
      jobId,
      grnNumber: receiptReference,
      receivedAt: state.demoDate,
      status: 'confirmed' as const,
    }
    dispatch({ type: 'add-warehouse-inbound', inbound })
    dispatch({ type: 'add-goods-received-note', note })
    if (photoEvidence) dispatch({
      type: 'add-document',
      document: {
        id: generateStableId('doc', [
          ...state.documents,
          { id: generateStableId('doc', state.documents) },
          ...labelDocuments,
        ]),
        jobId,
        name: `${receiptReference}-receiving-photo.jpg`,
        category: 'photo',
        status: 'available',
        uploadedAt: state.demoDate,
        mimeType: 'image/jpeg',
        accessRule: 'internal',
        previewText: `Simulated receiving evidence for ${inboundItems.length} SKU lines.`,
      },
    })
    labelDocuments.forEach((document) => dispatch({ type: 'add-document', document }))
    dispatch({
      type: 'add-activity',
      activity: {
        id: generateRecordId(state, 'activity'),
        entityType: 'warehouse-inbound',
        entityId: inbound.id,
        action: `Received ${inboundItems.length} SKU line${inboundItems.length === 1 ? '' : 's'} · ${receiptReference}`,
        actor: 'Warehouse operations',
        occurredAt: state.demoDate,
      },
    })
    showToast(`Received ${inboundItems.length} SKU line${inboundItems.length === 1 ? '' : 's'} under ${receiptReference}.`)
    setReference('')
    setReceiptLines([createReceiptLine(1)])
    setNextReceiptLineId(2)
  }

  function updateReceiptLine<K extends keyof WarehouseReceiptLine>(
    lineId: number,
    field: K,
    value: WarehouseReceiptLine[K],
  ) {
    setReceiptLines((lines) => lines.map((line) => line.id === lineId ? { ...line, [field]: value } : line))
  }

  const addReceiptLine = () => {
    setReceiptLines((lines) => [...lines, createReceiptLine(nextReceiptLineId)])
    setNextReceiptLineId((id) => id + 1)
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

  return (
    <div className="warehouse-page">
      <PageHeader
        eyebrow="Operations"
        title="Warehouse & Storage"
        description="Receive, count, palletise, label and put away cargo while maintaining shared stock and storage billing."
        actions={workflowSwitcher}
      />
      <div className="warehouse-primary-grid">
        <Card className="warehouse-card warehouse-receiving-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inbound receipt</p>
              <h2>Receiving and unloading</h2>
              <p className="warehouse-card-copy">Create one goods-received note with multiple SKU and batch lines.</p>
            </div>
            <StatusBadge tone="info">{receiptLines.length} SKU {receiptLines.length === 1 ? 'line' : 'lines'}</StatusBadge>
          </div>
          <div className="warehouse-shared-fields">
            <FormField label="Job Number">
              <select value={jobId} onChange={(event) => {
                const nextJobId = event.target.value
                setJobId(nextJobId)
                setContainerId(state.containers.find((container) => container.jobId === nextJobId)?.id ?? '')
              }}>
                {state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}
              </select>
            </FormField>
            <FormField label="Container">
              <select value={containerId} onChange={(event) => setContainerId(event.target.value)}>
                <option value="">Not linked</option>
                {state.containers.filter((container) => container.jobId === jobId).map((container) => (
                  <option key={container.id} value={container.id}>{container.containerNumber}</option>
                ))}
              </select>
            </FormField>
            <FormField label="GRN / receiving reference">
              <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. GRN-261029-01" />
            </FormField>
          </div>
          <div className="warehouse-line-heading">
            <div>
              <h3>Received items</h3>
              <p>Track quantities, batches and palletisation separately for each SKU.</p>
            </div>
            <Button variant="secondary" onClick={addReceiptLine}>＋ Add SKU</Button>
          </div>
          <div className="warehouse-receipt-lines">
            {receiptLines.map((line, index) => (
              <section className="warehouse-receipt-line" key={line.id} aria-labelledby={`warehouse-line-${line.id}`}>
                <div className="warehouse-receipt-line__heading">
                  <h4 id={`warehouse-line-${line.id}`}>SKU line {index + 1}</h4>
                  {receiptLines.length > 1 && (
                    <Button variant="ghost" onClick={() => setReceiptLines((lines) => lines.filter((item) => item.id !== line.id))}>Remove</Button>
                  )}
                </div>
                <div className="warehouse-line-fields">
                  <FormField label="SKU">
                    <input value={line.sku} onChange={(event) => updateReceiptLine(line.id, 'sku', event.target.value)} placeholder="Enter SKU" />
                  </FormField>
                  <FormField label="Cargo description">
                    <input value={line.description} onChange={(event) => updateReceiptLine(line.id, 'description', event.target.value)} placeholder="Describe the cargo" />
                  </FormField>
                  <FormField label="Batch / lot">
                    <input value={line.batchLot} onChange={(event) => updateReceiptLine(line.id, 'batchLot', event.target.value)} placeholder="Optional batch" />
                  </FormField>
                  <FormField label="Counted quantity">
                    <input min="0.01" step={line.unit === 'CBM' ? '0.01' : '1'} type="number" value={line.quantity} onChange={(event) => updateReceiptLine(line.id, 'quantity', event.target.value)} />
                  </FormField>
                  <FormField label="Unit">
                    <select value={line.unit} onChange={(event) => {
                      const nextUnit = event.target.value as WarehouseReceiptLine['unit']
                      updateReceiptLine(line.id, 'unit', nextUnit)
                      if (nextUnit !== 'carton') updateReceiptLine(line.id, 'palletisedQuantity', '')
                    }}>
                      <option value="carton">Cartons</option>
                      <option value="pallet">Pallets</option>
                      <option value="CBM">CBM</option>
                    </select>
                  </FormField>
                  <FormField label="Expected quantity">
                    <input min="0" step={line.unit === 'CBM' ? '0.01' : '1'} type="number" value={line.expectedQuantity} onChange={(event) => updateReceiptLine(line.id, 'expectedQuantity', event.target.value)} placeholder="Optional" />
                  </FormField>
                  <FormField label="Palletise cartons into">
                    <input disabled={line.unit !== 'carton'} min="0" step="1" type="number" value={line.palletisedQuantity} onChange={(event) => updateReceiptLine(line.id, 'palletisedQuantity', event.target.value)} placeholder={line.unit === 'carton' ? 'Pallet count' : 'Carton unit required'} />
                  </FormField>
                  <FormField label="Discrepancy / damage note">
                    <input value={line.discrepancyNote} onChange={(event) => updateReceiptLine(line.id, 'discrepancyNote', event.target.value)} placeholder="Required if expected differs" />
                  </FormField>
                </div>
              </section>
            ))}
          </div>
          <div className="warehouse-receiving-footer">
            <FormField label="Receiving evidence">
              <select value={photoEvidence ? 'photo' : 'none'} onChange={(event) => setPhotoEvidence(event.target.value === 'photo')}>
                <option value="photo">Add photo evidence (demo)</option>
                <option value="none">No photo evidence</option>
              </select>
            </FormField>
            <Button onClick={submitInbound}>Record receipt, GRN & SKU labels</Button>
          </div>
        </Card>
        <Card className="warehouse-card warehouse-stock-card">
          <div className="section-heading">
            <div><p className="eyebrow">Stock control</p><h2>Inventory balances</h2></div>
            <StatusBadge tone="info">Negative stock blocked</StatusBadge>
          </div>
          {inventoryWithBalance.length ? (
            <DataTable
              headers={['SKU', 'Job', 'Container', 'Batch / lot', 'Cartons', 'Pallets', 'CBM', 'Put-away location']}
              rows={inventoryWithBalance.map(({ item, balance }) => [
                <div className="warehouse-stock-sku"><strong>{item.sku}</strong><small>{item.description}</small></div>,
                state.jobs.find((job) => job.id === item.jobId)?.jobNumber ?? '—',
                state.containers.find((container) => container.id === item.containerId)?.containerNumber ?? '—',
                item.batchLot ?? '—',
                `${balance.cartons} available · ${item.cartons} received`,
                `${balance.pallets} available · ${item.pallets} received`,
                `${balance.cbm} available · ${item.cbm} received`,
                <div className="warehouse-bin-field">
                  <strong>{item.bin}</strong>
                  <input aria-label={`Put-away location for ${item.sku}`} value={putAwayBins[item.id] ?? ''} onChange={(event) => setPutAwayBins((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="New rack / bin" />
                  <Button variant="ghost" onClick={() => putAway(item)}>Put away</Button>
                </div>,
              ])}
            />
          ) : (
            <div className="warehouse-empty-stock"><strong>No inventory received yet</strong><span>Record a receipt to create stock balances for this job.</span></div>
          )}
        </Card>
      </div>
      <div className="warehouse-secondary-grid">
        <TariffConfiguration />
        <Card className="warehouse-card warehouse-storage-preview">
          <div className="section-heading">
            <div><p className="eyebrow">Storage billing</p><h2>Tariff calculation preview</h2></div>
            <StatusBadge tone="warning">Demo assumption</StatusBadge>
          </div>
          <FormField label="Customer">
            <select value={tariffCustomer} onChange={(event) => { setTariffCustomer(event.target.value); setStorageInventoryId('') }}>
              {state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </FormField>
          <FormField label="Inventory item">
            <select onChange={(event) => setStorageInventoryId(event.target.value)} value={storageInventoryId}>
              <option value="">Select customer inventory</option>
              {state.inventory.filter((item) => item.customerId === tariffCustomer).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.description}</option>)}
            </select>
          </FormField>
          <div className="warehouse-date-fields">
            <FormField label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></FormField>
            <FormField label="End date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></FormField>
            <span className="metric-card metric-card--inline"><small>Calculated amount</small><strong>RM {preview?.amount.toLocaleString('en-MY') ?? '0'}</strong></span>
          </div>
          {preview && (
            <div className="warehouse-charge-summary">
              <span>Chargeable quantity<strong>{preview.quantity} {preview.unit}</strong></span>
              <span>Storage period<strong>{preview.calendarDays} calendar days</strong></span>
              <span>Free period<strong>{preview.freeDays} days</strong></span>
              <span>Chargeable duration<strong>{preview.chargeableDuration} {preview.period}s</strong></span>
              <span>Rate<strong>RM {preview.rate} / {preview.unit} / {preview.period}</strong></span>
              <span>Job Number<strong>{state.jobs.find((job) => job.id === storageInventory?.jobId)?.jobNumber ?? 'Select inventory'}</strong></span>
            </div>
          )}
          {/* <p className="form-hint">Calendar days run from the start date up to, but not including, the end date. Daily tariffs apply free days; monthly tariffs bill each started 30-day period.</p> */}
          {storageInventory && <div className="form-actions"><Button disabled={!preview || preview.amount <= 0} onClick={createStorageBilling}>Generate storage charge</Button></div>}
        </Card>
      </div>
      <div className="warehouse-secondary-grid">
        <Card className="warehouse-card">
          <div className="section-heading"><div><p className="eyebrow">Warehouse activity</p><h2>Recent transactions</h2></div></div>
          <DataTable headers={['Reference', 'Movement', 'SKU', 'Quantity', 'Job', 'Date']} rows={state.warehouseTransactions.slice(-10).reverse().map((transaction) => [
            transaction.reference ?? '—',
            transaction.type,
            state.inventory.find((item) => item.id === transaction.inventoryId)?.sku ?? '—',
            `${transaction.quantity} ${transaction.unit}`,
            state.jobs.find((job) => job.id === transaction.jobId)?.jobNumber ?? '—',
            transaction.occurredAt,
          ])} />
        </Card>
        <Card className="warehouse-card">
          <div className="section-heading"><div><p className="eyebrow">Receiving control</p><h2>Goods received notes</h2></div></div>
          <DataTable headers={['GRN', 'Job', 'SKU lines', 'Counted items', 'Date', 'Status']} rows={state.goodsReceivedNotes.slice(-8).reverse().map((note) => {
            const inbound = state.warehouseInbounds.find((item) => item.id === note.warehouseInboundId)
            const inboundLines = inbound?.items ?? (inbound ? [{ inventoryId: inbound.inventoryId, transactionId: inbound.transactionId, sku: state.inventory.find((item) => item.id === inbound.inventoryId)?.sku ?? '—', unit: state.warehouseTransactions.find((item) => item.id === inbound.transactionId)?.unit ?? 'carton', countedQuantity: inbound.countedQuantity ?? 0 }] : [])
            return [note.grnNumber, state.jobs.find((job) => job.id === note.jobId)?.jobNumber ?? '—', inboundLines.map((line) => line.sku).join(', ') || '—', inboundLines.map((line) => `${line.countedQuantity} ${line.unit}`).join(' · ') || '—', note.receivedAt, <StatusBadge tone="success">{note.status}</StatusBadge>]
          })} />
        </Card>
      </div>
    </div>
  )
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
  return <><PageHeader eyebrow="Operations" title="Document Management" description="Digital job folders with mock upload, categorisation, access rules and activity history." /><Card><div className="filter-bar"><FormField label="Job Number"><select value={jobId} onChange={(event) => setJobId(event.target.value)}>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}</select></FormField><FormField label="Category"><select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></FormField><label className="ui-button ui-button--primary">＋ Mock upload<input accept="*" onChange={upload} style={{ display: 'none' }} type="file" /></label><input aria-label="Search documents" onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." value={query} /></div><DataTable headers={['File', 'Category', 'Job', 'Source record', 'Status', 'Uploaded', 'Access', 'Actions']} rows={documents.map((document) => [document.name, categoryLabel(document.category), state.jobs.find((job) => job.id === document.jobId)?.jobNumber, document.relatedRecordId ?? '—', <StatusBadge tone={document.status === 'available' ? 'success' : 'warning'}>{document.status}</StatusBadge>, document.uploadedAt, document.accessRule ?? 'internal', <div className="table-actions"><Button variant="ghost" onClick={() => setPreview(document)}>Preview</Button><Button variant="ghost" onClick={() => showToast('Download is simulated in this browser-only demo.')}>Download</Button></div>])} /></Card>{preview && <Card className="detail-card"><div className="section-heading"><div><p className="eyebrow">Document preview</p><h2>{preview.name}</h2></div><Button variant="ghost" onClick={() => setPreview(undefined)}>Close</Button></div><div className="detail-grid"><span>Category<strong>{categoryLabel(preview.category)}</strong></span><span>Job Number<strong>{state.jobs.find((job) => job.id === preview.jobId)?.jobNumber}</strong></span><span>Source record<strong>{preview.relatedRecordId ?? 'Not linked'}</strong></span><span>Type<strong>{preview.mimeType ?? 'Mock metadata'}</strong></span><span>Size<strong>{preview.sizeBytes ? `${Math.ceil(preview.sizeBytes / 1024)} KB` : 'Seed document'}</strong></span><span>Access rule<strong>{preview.accessRule ?? 'internal'}</strong></span><span>Activity<strong>{state.activity.find((event) => event.entityId === preview.id)?.action ?? 'Seeded document'}</strong></span></div><p className="form-hint">{preview.previewText ?? ''}</p></Card>}</>
}

export function WarehouseDocuments({ kind, initialJobId }: { kind: 'warehouse' | 'documents'; initialJobId?: string }) {
  const queryJobId = new URLSearchParams(window.location.search).get('jobId') ?? undefined
  const selectedJobId = initialJobId ?? queryJobId
  return kind === 'warehouse' ? <WarehousePage initialJobId={selectedJobId} /> : <DocumentsPage />
}
