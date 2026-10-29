import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { cloneSeedState, loadState, resetState, saveState } from '../services/mockStore.ts'
import { calculateAvailableInventory, canMatchReconciliation } from '../domain/calculations.ts'
import { validateInvoice, validateJob } from '../domain/validators.ts'
import { createTripPlan, validateTripPlan } from '../domain/tripPlanning.ts'
import { applyOutboundCommand, applyOutboundTripUpdate, type OutboundCommand } from '../domain/outboundWorkflow.ts'
import { addInvoiceDocument, addLinkedDocument, addReconciliationDocument, addSupplierInvoiceDocument, addTripExpenseDocument, addVoucherDocument, applyFinanceCommand, type FinanceCommand } from '../domain/financeWorkflow.ts'
import type { ActivityEvent, AppState, BankStatementTransaction, Charge, Container, ContainerEvent, Customer, CustomsRecord, CustomerInvoice, DocumentMetadata, ForwardingRecord, GoodsReceivedNote, InventoryRecord, Job, JobMilestone, OutboundOrder, PaymentTransaction, PaymentVoucher, Quotation, QuotationRequest, ReconciliationMatch, ReimbursementRequest, Shipment, ShipmentMilestone, StorageCharge, StorageRule, Supplier, SupplierCost, SupplierInvoice, Trip, TripExpense, WarehouseInbound, WarehouseTransaction } from '../domain/types.ts'
import { applyQuotationWorkflowAction, type QuotationWorkflowAction } from './quotationWorkflow.ts'

export type AppAction =
  | { type: 'reset' }
  | { type: 'set-demo-date'; date: string }
  | { type: 'add-job'; job: Job }
  | { type: 'update-job-status'; jobId: string; status: Job['status'] }
  | { type: 'add-customer'; customer: Customer }
  | { type: 'update-customer'; customer: Customer }
  | { type: 'add-supplier'; supplier: Supplier }
  | { type: 'update-supplier'; supplier: Supplier }
  | { type: 'add-quotation'; quotation: Quotation }
  | { type: 'update-quotation'; quotation: Quotation }
  | { type: 'add-quotation-request'; request: QuotationRequest }
  | { type: 'update-quotation-request'; request: QuotationRequest }
  | { type: 'add-job-from-quotation'; job: Job }
  | { type: 'add-job-bundle'; job: Job; shipment?: Shipment; container?: Container; documents: DocumentMetadata[]; milestones?: JobMilestone[]; activity: ActivityEvent }
  | { type: 'update-job-milestone'; milestone: JobMilestone }
  | { type: 'add-activity'; activity: ActivityEvent }
  | { type: 'add-shipment-milestone'; milestone: ShipmentMilestone }
  | { type: 'add-forwarding'; record: ForwardingRecord }
  | { type: 'update-forwarding'; record: ForwardingRecord }
  | { type: 'add-customs-record'; record: CustomsRecord }
  | { type: 'update-customs'; record: CustomsRecord }
  | { type: 'add-container-event'; event: ContainerEvent }
  | { type: 'add-container'; container: Container }
  | { type: 'update-container'; container: Container }
  | { type: 'update-shipment'; shipment: Shipment }
  | { type: 'add-trip'; trip: Trip }
  | { type: 'plan-trip'; trip: Trip; activity: ActivityEvent }
  | { type: 'update-trip'; trip: Trip }
  | { type: 'add-driver'; driver: AppState['drivers'][number] }
  | { type: 'update-driver'; driver: AppState['drivers'][number] }
  | { type: 'add-truck'; truck: AppState['trucks'][number] }
  | { type: 'update-truck'; truck: AppState['trucks'][number] }
  | { type: 'add-trailer'; trailer: AppState['trailers'][number] }
  | { type: 'update-trailer'; trailer: AppState['trailers'][number] }
  | { type: 'add-trip-expense'; expense: TripExpense }
  | { type: 'update-trip-expense'; expense: TripExpense }
  | { type: 'add-warehouse-inbound'; inbound: WarehouseInbound }
  | { type: 'add-goods-received-note'; note: GoodsReceivedNote }
  | { type: 'add-outbound-order'; order: OutboundOrder }
  | { type: 'update-outbound-order'; order: OutboundOrder }
  | { type: 'outbound-command'; command: OutboundCommand }
  | { type: 'add-warehouse-transaction'; transaction: WarehouseTransaction }
  | { type: 'add-inventory'; inventory: InventoryRecord }
  | { type: 'update-inventory'; inventory: InventoryRecord }
  | { type: 'add-document'; document: DocumentMetadata }
  | { type: 'update-document'; document: DocumentMetadata }
  | { type: 'update-storage-rule'; rule: StorageRule }
  | { type: 'add-storage-charge'; charge: StorageCharge }
  | { type: 'add-storage-charge-bundle'; storageCharge: StorageCharge; charge: Charge }
  | { type: 'update-storage-charge'; charge: StorageCharge }
  | { type: 'add-charge'; charge: Charge }
  | { type: 'update-charge'; charge: Charge }
  | { type: 'add-invoice'; invoice: CustomerInvoice }
  | { type: 'update-invoice'; invoice: CustomerInvoice }
  | { type: 'add-supplier-cost'; cost: SupplierCost }
  | { type: 'update-supplier-cost'; cost: SupplierCost }
  | { type: 'add-supplier-invoice'; invoice: SupplierInvoice }
  | { type: 'update-supplier-invoice'; invoice: SupplierInvoice }
  | { type: 'add-voucher'; voucher: PaymentVoucher }
  | { type: 'update-voucher'; voucher: PaymentVoucher }
  | { type: 'add-reimbursement'; request: ReimbursementRequest }
  | { type: 'update-reimbursement'; request: ReimbursementRequest }
  | { type: 'add-payment'; payment: PaymentTransaction }
  | { type: 'add-bank-transaction'; transaction: BankStatementTransaction }
  | { type: 'add-reconciliation'; match: ReconciliationMatch }
  | { type: 'remove-reconciliation'; matchId: string }
  | { type: 'finance-command'; command: FinanceCommand }
  | QuotationWorkflowAction

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'reset': return cloneSeedState()
    case 'set-demo-date': return { ...state, demoDate: action.date }
    case 'add-job': {
      if (state.jobs.some((job) => job.id === action.job.id) || validateJob(state, action.job).length) return state
      return { ...state, jobs: [...state.jobs, action.job] }
    }
    case 'update-job-status': return { ...state, jobs: state.jobs.map((job) => job.id === action.jobId ? { ...job, status: action.status } : job) }
    case 'add-customer': {
      if (state.customers.some((customer) => customer.id === action.customer.id || customer.name.toLowerCase() === action.customer.name.toLowerCase())) return state
      return { ...state, customers: [...state.customers, action.customer] }
    }
    case 'update-customer': return { ...state, customers: state.customers.map((customer) => customer.id === action.customer.id ? action.customer : customer) }
    case 'add-supplier': {
      if (state.suppliers.some((supplier) => supplier.id === action.supplier.id || supplier.name.toLowerCase() === action.supplier.name.toLowerCase())) return state
      return { ...state, suppliers: [...state.suppliers, action.supplier] }
    }
    case 'update-supplier': return { ...state, suppliers: state.suppliers.map((supplier) => supplier.id === action.supplier.id ? action.supplier : supplier) }
    case 'add-quotation': {
      if (action.quotation.requestId) return state
      if (state.quotations.some((quotation) => quotation.id === action.quotation.id || quotation.reference.toLowerCase() === action.quotation.reference.toLowerCase())) return state
      if (!state.customers.some((customer) => customer.id === action.quotation.customerId)) return state
      return { ...state, quotations: [...state.quotations, action.quotation] }
    }
    case 'update-quotation': {
      if (state.quotations.some((quotation) => quotation.id === action.quotation.id && quotation.requestId)) return state
      return { ...state, quotations: state.quotations.map((quotation) => quotation.id === action.quotation.id ? action.quotation : quotation) }
    }
    case 'add-quotation-request': {
      if (state.quotationRequests.some((request) => request.id === action.request.id || request.requestNumber === action.request.requestNumber)) return state
      return { ...state, quotationRequests: [...state.quotationRequests, action.request] }
    }
    case 'update-quotation-request': return { ...state, quotationRequests: state.quotationRequests.map((request) => request.id === action.request.id ? action.request : request) }
    case 'submit-quotation-request':
    case 'save-request-quotation':
    case 'respond-to-request-quotation':
      return applyQuotationWorkflowAction(state, action)
    case 'add-job-from-quotation': {
      if (state.jobs.some((job) => job.id === action.job.id) || validateJob(state, action.job).length) return state
      return { ...state, jobs: [...state.jobs, action.job] }
    }
    case 'add-job-bundle': {
      if (state.jobs.some((job) => job.id === action.job.id) || validateJob(state, action.job).length) return state
      if (action.shipment && (action.shipment.jobId !== action.job.id || state.shipments.some((shipment) => shipment.id === action.shipment?.id || shipment.reference.toLowerCase() === action.shipment?.reference.toLowerCase()))) return state
      if (action.container && (!action.shipment || action.container.jobId !== action.job.id || action.container.shipmentId !== action.shipment.id || state.containers.some((container) => container.id === action.container?.id))) return state
      if (action.container && state.containers.some((container) => container.containerNumber.toLowerCase() === action.container?.containerNumber.toLowerCase())) return state
      if (action.documents.some((document, index) => document.jobId !== action.job.id || state.documents.some((existing) => existing.id === document.id) || action.documents.slice(0, index).some((previous) => previous.id === document.id))) return state
      if (action.milestones?.some((milestone) => milestone.jobId !== action.job.id || state.jobMilestones.some((existing) => existing.id === milestone.id || (existing.jobId === milestone.jobId && existing.key === milestone.key)))) return state
      return {
        ...state,
        jobs: [...state.jobs, action.job],
        shipments: action.shipment ? [...state.shipments, action.shipment] : state.shipments,
        containers: action.container ? [...state.containers, action.container] : state.containers,
        documents: [...state.documents, ...action.documents],
        jobMilestones: [...state.jobMilestones, ...(action.milestones ?? [])],
        activity: [...state.activity, action.activity],
      }
    }
    case 'update-job-milestone': {
      if (!state.jobs.some((job) => job.id === action.milestone.jobId) || !state.jobMilestones.some((milestone) => milestone.id === action.milestone.id && milestone.jobId === action.milestone.jobId)) return state
      return { ...state, jobMilestones: state.jobMilestones.map((milestone) => milestone.id === action.milestone.id && milestone.jobId === action.milestone.jobId ? action.milestone : milestone) }
    }
    case 'add-activity': return { ...state, activity: [...state.activity, action.activity] }
    case 'add-shipment-milestone': {
      if (state.shipmentMilestones.some((milestone) => milestone.id === action.milestone.id || (
        action.milestone.sourceRecordId && milestone.sourceRecordId === action.milestone.sourceRecordId && milestone.title === action.milestone.title
      ))) return state
      if (!state.shipments.some((shipment) => shipment.id === action.milestone.shipmentId && shipment.jobId === action.milestone.jobId)) return state
      return { ...state, shipmentMilestones: [...state.shipmentMilestones, action.milestone] }
    }
    case 'add-forwarding': {
      const { record } = action
      const shipment = state.shipments.find((item) => item.id === record.shipmentId && item.jobId === record.jobId)
      const job = state.jobs.find((item) => item.id === record.jobId && item.customerId === record.customerId)
      if (!shipment || !job || shipment.direction !== record.direction || !record.bookingReference.trim()
        || state.forwardingRecords.some((item) => item.id === record.id || item.shipmentId === record.shipmentId || item.bookingReference.toLowerCase() === record.bookingReference.toLowerCase())) return state
      const nextState = {
        ...state,
        forwardingRecords: [...state.forwardingRecords, record],
        shipments: state.shipments.map((item) => item.id === shipment.id ? { ...item, vessel: record.vessel || undefined, voyage: record.voyage || undefined, etd: record.etd || undefined, eta: record.eta, blReference: record.bl || undefined, hblReference: record.hbl || undefined, mblReference: record.mbl || undefined } : item),
        containers: state.containers.map((item) => item.shipmentId === shipment.id ? { ...item, vessel: record.vessel, voyage: record.voyage, eta: record.eta } : item),
      }
      return addLinkedDocument(nextState, { jobId: record.jobId, name: `${record.bookingReference} booking`, category: 'booking', status: 'available', uploadedAt: state.demoDate, relatedRecordId: record.id, accessRule: 'internal', previewText: 'Booking record metadata linked to the forwarding shipment.' })
    }
    case 'update-forwarding': {
      const shipment = state.shipments.find((item) => item.id === action.record.shipmentId && item.jobId === action.record.jobId)
      const job = state.jobs.find((item) => item.id === action.record.jobId && item.customerId === action.record.customerId)
      if (!shipment || !job || shipment.direction !== action.record.direction || !state.forwardingRecords.some((item) => item.id === action.record.id)
        || state.forwardingRecords.some((item) => item.shipmentId === action.record.shipmentId && item.id !== action.record.id)) return state
      return {
        ...state,
        forwardingRecords: state.forwardingRecords.map((record) => record.id === action.record.id ? action.record : record),
        shipments: state.shipments.map((item) => item.id === shipment.id ? { ...item, vessel: action.record.vessel || undefined, voyage: action.record.voyage || undefined, etd: action.record.etd || undefined, eta: action.record.eta, blReference: action.record.bl || undefined, hblReference: action.record.hbl || undefined, mblReference: action.record.mbl || undefined } : item),
        containers: state.containers.map((item) => item.shipmentId === shipment.id ? { ...item, vessel: action.record.vessel, voyage: action.record.voyage, eta: action.record.eta } : item),
      }
    }
    case 'add-customs-record': {
      const { record } = action
      if (!state.jobs.some((job) => job.id === record.jobId) || !state.shipments.some((shipment) => shipment.jobId === record.jobId)
        || state.customsRecords.some((item) => item.id === record.id || (item.jobId === record.jobId && item.declarationType === record.declarationType))) return state
      return { ...state, customsRecords: [...state.customsRecords, record] }
    }
    case 'update-customs': {
      if (!state.customsRecords.some((record) => record.id === action.record.id && record.jobId === action.record.jobId)) return state
      return { ...state, customsRecords: state.customsRecords.map((record) => record.id === action.record.id ? action.record : record) }
    }
    case 'add-container-event': return { ...state, containerEvents: [...state.containerEvents, action.event] }
    case 'add-container': {
      const { container } = action
      const shipment = state.shipments.find((item) => item.id === container.shipmentId && item.jobId === container.jobId)
      if (!shipment || shipment.mode !== 'FCL' || !container.containerNumber.trim()
        || state.containers.some((item) => item.id === container.id || item.containerNumber.toLowerCase() === container.containerNumber.toLowerCase())) return state
      return { ...state, containers: [...state.containers, container] }
    }
    case 'update-container': return { ...state, containers: state.containers.map((container) => container.id === action.container.id ? action.container : container) }
    case 'update-shipment': {
      if (!state.shipments.some((shipment) => shipment.id === action.shipment.id && shipment.jobId === action.shipment.jobId)
        || state.shipments.some((shipment) => shipment.id !== action.shipment.id && shipment.reference.toLowerCase() === action.shipment.reference.toLowerCase())) return state
      return { ...state, shipments: state.shipments.map((shipment) => shipment.id === action.shipment.id ? action.shipment : shipment) }
    }
    case 'add-trip': {
      if (state.trips.some((trip) => trip.id === action.trip.id || trip.tripNumber.toLowerCase() === action.trip.tripNumber.toLowerCase()
        || (action.trip.assignmentKey && trip.assignmentKey === action.trip.assignmentKey))) return state
      if (validateTripPlan(state, action.trip).length) return state
      return { ...state, trips: [...state.trips, action.trip] }
    }
    case 'plan-trip': {
      return createTripPlan(state, action.trip, action.activity).state
    }
    case 'update-trip': {
      return applyOutboundTripUpdate(state, action.trip).state
    }
    case 'add-driver': {
      if (state.drivers.some((driver) => driver.id === action.driver.id || driver.name.toLowerCase() === action.driver.name.toLowerCase())) return state
      return { ...state, drivers: [...state.drivers, action.driver] }
    }
    case 'update-driver': return { ...state, drivers: state.drivers.map((driver) => driver.id === action.driver.id ? action.driver : driver) }
    case 'add-truck': {
      if (state.trucks.some((truck) => truck.id === action.truck.id || truck.registrationNumber.toLowerCase() === action.truck.registrationNumber.toLowerCase())) return state
      return { ...state, trucks: [...state.trucks, action.truck] }
    }
    case 'update-truck': return { ...state, trucks: state.trucks.map((truck) => truck.id === action.truck.id ? action.truck : truck) }
    case 'add-trailer': {
      if (state.trailers.some((trailer) => trailer.id === action.trailer.id || trailer.registrationNumber.toLowerCase() === action.trailer.registrationNumber.toLowerCase())) return state
      return { ...state, trailers: [...state.trailers, action.trailer] }
    }
    case 'update-trailer': return { ...state, trailers: state.trailers.map((trailer) => trailer.id === action.trailer.id ? action.trailer : trailer) }
    case 'add-trip-expense': {
      if (state.tripExpenses.some((expense) => expense.id === action.expense.id)) return state
      if (!state.trips.some((trip) => trip.id === action.expense.tripId && trip.jobId === action.expense.jobId)) return state
      if (!Number.isFinite(action.expense.amount) || action.expense.amount <= 0) return state
      return addTripExpenseDocument({ ...state, tripExpenses: [...state.tripExpenses, action.expense] }, action.expense)
    }
    case 'update-trip-expense': return { ...state, tripExpenses: state.tripExpenses.map((expense) => expense.id === action.expense.id ? action.expense : expense) }
    case 'add-warehouse-inbound': {
      if (state.warehouseInbounds.some((inbound) => inbound.id === action.inbound.id || (inbound.jobId === action.inbound.jobId && inbound.reference === action.inbound.reference))) return state
      if (!state.jobs.some((job) => job.id === action.inbound.jobId) || !state.warehouseTransactions.some((transaction) => transaction.id === action.inbound.transactionId && transaction.jobId === action.inbound.jobId) || !state.inventory.some((item) => item.id === action.inbound.inventoryId && item.jobId === action.inbound.jobId)) return state
      if (action.inbound.items?.some((line) =>
        !state.inventory.some((item) => item.id === line.inventoryId && item.jobId === action.inbound.jobId)
        || !state.warehouseTransactions.some((transaction) => transaction.id === line.transactionId && transaction.jobId === action.inbound.jobId && transaction.inventoryId === line.inventoryId && transaction.type === 'receiving' && transaction.reference === action.inbound.reference),
      )) return state
      return { ...state, warehouseInbounds: [...state.warehouseInbounds, action.inbound] }
    }
    case 'add-goods-received-note': {
      if (state.goodsReceivedNotes.some((note) => note.id === action.note.id || note.grnNumber.toLowerCase() === action.note.grnNumber.toLowerCase())) return state
      if (!state.warehouseInbounds.some((inbound) => inbound.id === action.note.warehouseInboundId && inbound.jobId === action.note.jobId)) return state
      const nextState = { ...state, goodsReceivedNotes: [...state.goodsReceivedNotes, action.note] }
      return addLinkedDocument(nextState, { jobId: action.note.jobId, name: `${action.note.grnNumber} goods received note`, category: 'grn', status: 'available', uploadedAt: action.note.receivedAt.slice(0, 10), relatedRecordId: action.note.id, accessRule: 'internal', previewText: 'Goods received note metadata linked to the warehouse receipt.' })
    }
    case 'add-outbound-order': {
      if (state.outboundOrders.some((order) => order.id === action.order.id || (order.jobId === action.order.jobId && order.deliveryOrderNumber.toLowerCase() === action.order.deliveryOrderNumber.toLowerCase()))) return state
      const inventory = state.inventory.find((item) => item.id === action.order.inventoryId && item.jobId === action.order.jobId)
      const transaction = action.order.transactionId && state.warehouseTransactions.find((item) => item.id === action.order.transactionId && item.jobId === action.order.jobId && item.inventoryId === action.order.inventoryId)
      if (!inventory || !transaction || action.order.quantity <= 0) return state
      return { ...state, outboundOrders: [...state.outboundOrders, action.order] }
    }
    case 'update-outbound-order': return { ...state, outboundOrders: state.outboundOrders.map((order) => order.id === action.order.id ? action.order : order) }
    case 'outbound-command': return applyOutboundCommand(state, action.command).state
    case 'add-warehouse-transaction': {
      if (state.warehouseTransactions.some((transaction) => transaction.id === action.transaction.id)) return state
      if (!state.jobs.some((job) => job.id === action.transaction.jobId) || action.transaction.quantity <= 0) return state
      if (action.transaction.inventoryId && !state.inventory.some((item) => item.id === action.transaction.inventoryId && item.jobId === action.transaction.jobId)) return state
      if (action.transaction.reference && state.warehouseTransactions.some((transaction) => transaction.jobId === action.transaction.jobId && transaction.type === action.transaction.type && transaction.reference?.toLowerCase() === action.transaction.reference?.toLowerCase() && transaction.inventoryId === action.transaction.inventoryId)) return state
      if (['picking', 'dispatch'].includes(action.transaction.type)) {
        const inventory = state.inventory.find((item) => item.id === action.transaction.inventoryId)
        if (!inventory) return state
        const available = calculateAvailableInventory(inventory, state.warehouseTransactions, state.inventory)
        const amount = action.transaction.unit === 'carton' ? available.cartons : action.transaction.unit === 'pallet' ? available.pallets : available.cbm
        if (action.transaction.quantity > amount) return state
      }
      return { ...state, warehouseTransactions: [...state.warehouseTransactions, action.transaction] }
    }
    case 'add-inventory': return { ...state, inventory: [...state.inventory, action.inventory] }
    case 'update-inventory': return { ...state, inventory: state.inventory.map((item) => item.id === action.inventory.id ? action.inventory : item) }
    case 'add-document': {
      if (state.documents.some((document) => document.id === action.document.id)) return state
      if (action.document.category === 'pod' && action.document.relatedRecordId) {
        const trip = state.trips.find((item) => item.id === action.document.relatedRecordId && item.jobId === action.document.jobId)
        if (!trip || state.documents.some((document) => document.category === 'pod' && document.relatedRecordId === trip.id)) return state
      }
      if (!state.jobs.some((job) => job.id === action.document.jobId)) return state
      return { ...state, documents: [...state.documents, action.document] }
    }
    case 'update-document': return { ...state, documents: state.documents.map((item) => item.id === action.document.id ? action.document : item) }
    case 'update-storage-rule': return { ...state, storageRules: state.storageRules.map((rule) => rule.id === action.rule.id ? action.rule : rule) }
    case 'add-storage-charge': {
      if (state.storageCharges.some((charge) => charge.id === action.charge.id || (charge.inventoryId === action.charge.inventoryId && charge.storageRuleId === action.charge.storageRuleId && charge.periodStart === action.charge.periodStart && charge.periodEnd === action.charge.periodEnd))) return state
      if (!state.inventory.some((item) => item.id === action.charge.inventoryId && item.jobId === action.charge.jobId && item.customerId === action.charge.customerId)) return state
      return { ...state, storageCharges: [...state.storageCharges, action.charge] }
    }
    case 'add-storage-charge-bundle': {
      const { storageCharge, charge } = action
      if (state.storageCharges.some((item) => item.id === storageCharge.id || (item.inventoryId === storageCharge.inventoryId && item.storageRuleId === storageCharge.storageRuleId && item.periodStart === storageCharge.periodStart && item.periodEnd === storageCharge.periodEnd))) return state
      if (state.charges.some((item) => item.id === charge.id || item.sourceActivity === charge.sourceActivity)) return state
      const inventory = state.inventory.find((item) => item.id === storageCharge.inventoryId && item.jobId === storageCharge.jobId && item.customerId === storageCharge.customerId)
      const chargeJob = state.jobs.find((job) => job.id === charge.jobId && job.customerId === charge.customerId)
      if (!inventory || !chargeJob || storageCharge.chargeId !== charge.id || charge.jobId !== storageCharge.jobId || charge.category !== 'storage' || charge.unitPrice !== storageCharge.amount) return state
      return { ...state, storageCharges: [...state.storageCharges, storageCharge], charges: [...state.charges, charge] }
    }
    case 'update-storage-charge': return { ...state, storageCharges: state.storageCharges.map((charge) => charge.id === action.charge.id ? action.charge : charge) }
    case 'add-charge': {
      if (state.charges.some((charge) => charge.id === action.charge.id || (action.charge.sourceActivity && charge.sourceActivity === action.charge.sourceActivity))) return state
      if (!state.jobs.some((job) => job.id === action.charge.jobId && job.customerId === action.charge.customerId) || action.charge.quantity <= 0 || action.charge.unitPrice < 0) return state
      return { ...state, charges: [...state.charges, action.charge] }
    }
    case 'update-charge': return { ...state, charges: state.charges.map((charge) => charge.id === action.charge.id ? action.charge : charge) }
    case 'add-invoice': {
      const chargeIds = action.invoice.lines.map((line) => line.chargeId)
      const lineIds = action.invoice.lines.map((line) => line.id)
      const existingLineIds = new Set(state.customerInvoices.flatMap((invoice) => invoice.lines.map((line) => line.id)))
      if (state.customerInvoices.some((invoice) => invoice.id === action.invoice.id || invoice.invoiceNumber.toLowerCase() === action.invoice.invoiceNumber.toLowerCase())) return state
      if (new Set(chargeIds).size !== chargeIds.length || new Set(lineIds).size !== lineIds.length || lineIds.some((id) => existingLineIds.has(id))) return state
      if (validateInvoice(state, action.invoice).length) return state
      if (!state.jobs.some((job) => job.id === action.invoice.jobId && job.customerId === action.invoice.customerId)) return state
      if (chargeIds.some((id) => !state.charges.some((charge) => charge.id === id && charge.jobId === action.invoice.jobId && charge.customerId === action.invoice.customerId && !charge.invoiceId && charge.approved) || state.customerInvoices.some((invoice) => invoice.lines.some((line) => line.chargeId === id)))) return state
      const nextState = { ...state, customerInvoices: [...state.customerInvoices, action.invoice], charges: state.charges.map((charge) => chargeIds.includes(charge.id) ? { ...charge, invoiceId: action.invoice.id, status: 'invoiced' as const } : charge) }
      return addInvoiceDocument(nextState, action.invoice)
    }
    case 'update-invoice': {
      const current = state.customerInvoices.find((invoice) => invoice.id === action.invoice.id)
      if (!current || current.status !== action.invoice.status || current.eInvoiceStatus !== action.invoice.eInvoiceStatus || current.emailStatus !== action.invoice.emailStatus) return state
      return { ...state, customerInvoices: state.customerInvoices.map((invoice) => invoice.id === action.invoice.id ? action.invoice : invoice) }
    }
    case 'add-supplier-cost': {
      if (state.supplierCosts.some((cost) => cost.id === action.cost.id || (action.cost.supplierInvoiceId && cost.supplierInvoiceId === action.cost.supplierInvoiceId) || (action.cost.reference && cost.supplierId === action.cost.supplierId && cost.reference?.toLowerCase() === action.cost.reference.toLowerCase()))) return state
      if (!state.jobs.some((job) => job.id === action.cost.jobId) || !state.suppliers.some((supplier) => supplier.id === action.cost.supplierId) || !Number.isFinite(action.cost.amount) || action.cost.amount <= 0) return state
      if (action.cost.tripId && !state.trips.some((trip) => trip.id === action.cost.tripId && trip.jobId === action.cost.jobId)) return state
      return { ...state, supplierCosts: [...state.supplierCosts, action.cost] }
    }
    case 'update-supplier-cost': return { ...state, supplierCosts: state.supplierCosts.map((cost) => cost.id === action.cost.id ? action.cost : cost) }
    case 'add-supplier-invoice': {
      if (state.supplierInvoices.some((invoice) => invoice.id === action.invoice.id || (invoice.supplierId === action.invoice.supplierId && invoice.reference.trim().toLowerCase() === action.invoice.reference.trim().toLowerCase()))) return state
      if (!state.suppliers.some((supplier) => supplier.id === action.invoice.supplierId) || !state.jobs.some((job) => job.id === action.invoice.jobId) || !Number.isFinite(action.invoice.amount) || action.invoice.amount <= 0) return state
      return addSupplierInvoiceDocument({ ...state, supplierInvoices: [...state.supplierInvoices, action.invoice] }, action.invoice)
    }
    case 'update-supplier-invoice': {
      const current = state.supplierInvoices.find((invoice) => invoice.id === action.invoice.id)
      if (!current || current.status !== action.invoice.status || current.paymentStatus !== action.invoice.paymentStatus || current.validationStatus !== action.invoice.validationStatus) return state
      return { ...state, supplierInvoices: state.supplierInvoices.map((invoice) => invoice.id === action.invoice.id ? action.invoice : invoice) }
    }
    case 'add-voucher': {
      if (state.paymentVouchers.some((voucher) => voucher.id === action.voucher.id || voucher.voucherNumber.toLowerCase() === action.voucher.voucherNumber.toLowerCase() || (action.voucher.supplierInvoiceId && voucher.supplierInvoiceId === action.voucher.supplierInvoiceId) || (action.voucher.reimbursementId && voucher.reimbursementId === action.voucher.reimbursementId))) return state
      if (!Number.isFinite(action.voucher.amount) || action.voucher.amount <= 0) return state
      if (action.voucher.jobId && !state.jobs.some((job) => job.id === action.voucher.jobId)) return state
      if (action.voucher.supplierId && !state.suppliers.some((supplier) => supplier.id === action.voucher.supplierId)) return state
      if (action.voucher.supplierInvoiceId && !state.supplierInvoices.some((invoice) => invoice.id === action.voucher.supplierInvoiceId && invoice.amount === action.voucher.amount && invoice.status === 'captured')) return state
      if (action.voucher.reimbursementId && !state.reimbursements.some((request) => request.id === action.voucher.reimbursementId && request.amount === action.voucher.amount && request.status === 'approved')) return state
      return addVoucherDocument({ ...state, paymentVouchers: [...state.paymentVouchers, action.voucher] }, action.voucher)
    }
    case 'update-voucher': {
      const current = state.paymentVouchers.find((voucher) => voucher.id === action.voucher.id)
      if (!current || current.status !== action.voucher.status) return state
      return { ...state, paymentVouchers: state.paymentVouchers.map((voucher) => voucher.id === action.voucher.id ? action.voucher : voucher) }
    }
    case 'add-reimbursement': {
      if (state.reimbursements.some((request) => request.id === action.request.id) || !Number.isFinite(action.request.amount) || action.request.amount <= 0) return state
      if (action.request.jobId && !state.jobs.some((job) => job.id === action.request.jobId)) return state
      if (action.request.tripExpenseId && !state.tripExpenses.some((expense) => expense.id === action.request.tripExpenseId && expense.jobId === action.request.jobId)) return state
      return { ...state, reimbursements: [...state.reimbursements, action.request] }
    }
    case 'update-reimbursement': {
      const current = state.reimbursements.find((request) => request.id === action.request.id)
      if (!current || current.status !== action.request.status || current.paymentStatus !== action.request.paymentStatus) return state
      return { ...state, reimbursements: state.reimbursements.map((request) => request.id === action.request.id ? action.request : request) }
    }
    case 'add-payment': {
      if (state.paymentTransactions.some((payment) => payment.id === action.payment.id || payment.reference.toLowerCase() === action.payment.reference.toLowerCase() || (action.payment.voucherId && payment.voucherId === action.payment.voucherId) || (action.payment.supplierInvoiceId && payment.supplierInvoiceId === action.payment.supplierInvoiceId) || (action.payment.reimbursementId && payment.reimbursementId === action.payment.reimbursementId))) return state
      if (!Number.isFinite(action.payment.amount) || action.payment.amount <= 0) return state
      const voucher = action.payment.voucherId && state.paymentVouchers.find((item) => item.id === action.payment.voucherId)
      if (action.payment.voucherId && (!voucher || voucher.status !== 'posted' || voucher.amount !== action.payment.amount)) return state
      if (action.payment.supplierInvoiceId && (!state.supplierInvoices.some((invoice) => invoice.id === action.payment.supplierInvoiceId && invoice.status === 'posted' && invoice.amount === action.payment.amount) || !state.paymentVouchers.some((item) => item.supplierInvoiceId === action.payment.supplierInvoiceId && ['posted', 'paid'].includes(item.status)))) return state
      if (action.payment.reimbursementId && (!state.reimbursements.some((request) => request.id === action.payment.reimbursementId && request.status === 'approved' && request.amount === action.payment.amount) || !state.paymentVouchers.some((item) => item.reimbursementId === action.payment.reimbursementId && ['posted', 'paid'].includes(item.status)))) return state
      return { ...state, paymentTransactions: [...state.paymentTransactions, action.payment] }
    }
    case 'add-bank-transaction': {
      if (state.bankTransactions.some((item) => item.id === action.transaction.id || item.reference.toLowerCase() === action.transaction.reference.toLowerCase())) return state
      return { ...state, bankTransactions: [...state.bankTransactions, action.transaction] }
    }
    case 'add-reconciliation': {
      if (state.reconciliationMatches.some((match) => match.id === action.match.id)) return state
      if (!canMatchReconciliation(state, action.match.bankTransactionId, action.match.paymentTransactionId)) return state
      const nextState = { ...state, reconciliationMatches: [...state.reconciliationMatches, action.match], bankTransactions: state.bankTransactions.map((transaction) => transaction.id === action.match.bankTransactionId ? { ...transaction, matched: true } : transaction) }
      return addReconciliationDocument(nextState, action.match)
    }
    case 'remove-reconciliation': {
      const match = state.reconciliationMatches.find((item) => item.id === action.matchId)
      return { ...state, reconciliationMatches: state.reconciliationMatches.filter((item) => item.id !== action.matchId), bankTransactions: match ? state.bankTransactions.map((transaction) => transaction.id === match.bankTransactionId ? { ...transaction, matched: false } : transaction) : state.bankTransactions }
    }
    case 'finance-command': return applyFinanceCommand(state, action.command).state
    default: return state
  }
}

interface AppContextValue { state: AppState; dispatch: Dispatch<AppAction>; resetDemo: () => void }
const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  const resetDemo = useCallback(() => dispatch({ type: 'reset' }), [])
  const value = useMemo(() => ({ state, dispatch, resetDemo }), [state, resetDemo])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
export function useAppState() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useAppState must be used within AppProvider.')
  return value
}
export function clearDemoPersistence() { return resetState() }
