export type Currency = 'MYR'
export type RecordStatus = 'draft' | 'pending' | 'approved' | 'active' | 'completed' | 'cancelled'
export type InvoiceStatus = 'draft' | 'pending-approval' | 'approved' | 'finalised' | 'rejected' | 'paid'
export type PaymentStatus = 'unpaid' | 'partially-paid' | 'paid'
export type ServiceType = 'freight' | 'customs' | 'haulage' | 'warehouse' | 'other'

export interface Customer {
  id: string; code: string; name: string; contactName: string; email: string
  paymentTermsDays: number; storageRuleId?: string; status: 'active' | 'inactive'
}
export interface Supplier {
  id: string; code: string; name: string; serviceType: ServiceType; contactName: string; email: string; status: 'active' | 'inactive'
}
export interface QuotationLine {
  id: string; description: string; serviceType: ServiceType; quantity: number; unit: string; unitPrice: number; discount: number; taxRate: number
}
export interface Quotation {
  id: string; reference: string; customerId: string; issueDate: string; validUntil: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'revision-requested' | 'revised'
  lines: QuotationLine[]; requestId?: string; version?: number; replacesQuotationId?: string; responseNote?: string
}
export interface QuotationRequest {
  id: string; requestNumber: string; customerId: string; requestedAt: string; serviceType: ServiceType
  origin?: string; destination?: string; cargoDescription: string; mode?: 'FCL' | 'LCL' | 'air'
  direction?: 'import' | 'export'; containerQuantity?: number; requestedPickupDate?: string; requestedDeliveryDate?: string
  warehouseRequired?: boolean; instructions?: string
  status: 'new' | 'submitted' | 'quoted' | 'accepted' | 'rejected' | 'revision-requested' | 'converted'
  quotationId?: string; jobId?: string
}
export interface Job {
  id: string; jobNumber: string; customerId: string; quotationId?: string; quotationRequestId?: string; serviceType: ServiceType; status: 'open' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled'; owner: string; openedDate: string
}
export interface Shipment {
  id: string; jobId: string; reference: string; mode: 'FCL' | 'LCL' | 'air'; direction: 'import' | 'export'; origin: string; destination: string; eta: string; status: 'Booked' | 'In-Transit' | 'Delivered' | 'delayed'
  etd?: string; vessel?: string; voyage?: string; containerType?: '20ft' | '40ft' | '40ft HC'
  cargoDescription?: string; cartons?: number; pallets?: number; cbm?: number; weightKg?: number; containerQuantity?: number
  blReference?: string; hblReference?: string; mblReference?: string; pickupRequirements?: string; deliveryRequirements?: string
  warehouseRequired?: boolean
}
export interface ForwardingRecord {
  id: string; jobId: string; bookingReference: string; shipmentId: string; customerId: string; mode: 'FCL' | 'LCL'; direction: 'import' | 'export'; transshipment: boolean; carrier: string; vessel: string; voyage: string; etd: string; eta: string; mbl?: string; hbl?: string; bl?: string; freeDays: number; demurrageRate: number; detentionRate: number; milestones: string[]
}
export interface Container {
  id: string; containerNumber: string; jobId: string; shipmentId: string; size: '20ft' | '40ft' | '40ft HC'; vessel: string; voyage: string; port: string; eta: string; freeDays: number; freeTimeExpiryDate?: string; movementStatus: 'Booked' | 'at-port' | 'Delivered' | 'empty-returned'
}
export interface ContainerEvent { id: string; containerId: string; status: 'Booked' | 'gate-in' | 'loaded' | 'discharged' | 'at-port' | 'Delivered' | 'empty-returned'; location: string; occurredAt: string; note: string }
export interface CustomsRecord {
  id: string; jobId: string; declarationType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K8' | 'ZB'; status: 'draft' | 'submitted' | 'inspection' | 'approved' | 'released'; dutyAndSst: number; edoStatus: 'pending' | 'received' | 'released'; dutyStatus?: 'unpaid' | 'paid'; inspectionResult?: 'pending' | 'passed' | 'hold'; missingDocuments?: string[]; history?: string[]
}
export interface Driver {
  id: string; name: string; phone: string; licenceExpiry: string; status: 'available' | 'assigned' | 'off-duty'
  identityNumber?: string; email?: string; address?: string; licenceNumber?: string
}
export interface Truck {
  id: string; registrationNumber: string; capacityTons: number; documentExpiry: string; roadTaxExpiry?: string; insuranceExpiry?: string
  status: 'available' | 'assigned' | 'maintenance'; truckType?: 'prime-mover' | 'rigid' | 'lorry' | 'other'
  ownership?: 'owned' | 'leased' | 'subcontracted'; vehicleDocuments?: string[]
}
export interface Trailer {
  id: string; registrationNumber: string; type: 'flatbed' | 'skeletal' | 'box'; documentExpiry: string
  capacityTons?: number; status?: 'available' | 'assigned' | 'maintenance'; documentStatus?: 'valid' | 'expiring' | 'expired' | 'missing'
}
export interface Trip {
  id: string; tripNumber: string; jobId: string; driverId?: string; truckId?: string; trailerId?: string
  shipmentId?: string; containerId?: string; outboundOrderId?: string; outboundQuantity?: number
  tripType?: 'container-pickup' | 'warehouse-delivery' | 'empty-return' | 'port-delivery' | 'general-haulage'
  pickup: string; delivery: string; status: 'planned' | 'assigned' | 'in-progress' | 'completed' | 'cancelled'
  billingAmount: number; truckingCost: number; tollCost: number; otherCost: number; milestones: string[]
  portAppointment?: string; portSlot?: string; emptyPickup?: string; ladenDelivery?: string; returnEmpty?: string
  instructions?: string; subcontractorHaulageCost?: number
  plannedPickup?: string; plannedDelivery?: string; actualPickup?: string
  estimatedTruckingCost?: number; estimatedTollCost?: number; estimatedOtherCost?: number
  driverMilestones?: DriverMilestoneEvent[]
  podStatus?: 'pending' | 'received' | 'approved'; subcontractor?: boolean; subcontractorName?: string; assignmentKey?: string
  podReceiverName?: string; podSignatureCaptured?: boolean; podPhotoName?: string; podReceivedAt?: string; podRemarks?: string
}
export type DriverMilestoneKey = 'trip-started' | 'empty-pickup' | 'laden-delivery' | 'pod' | 'return-empty' | 'completed'
export interface DriverMilestoneEvent { key: DriverMilestoneKey; label: string; occurredAt: string }
export type TripExpenseCategory = 'toll' | 'fuel' | 'parking' | 'port charges' | 'waiting' | 'detention' | 'driver allowance' | 'other'
export interface TripExpense {
  id: string; tripId: string; jobId: string; description: string; amount: number
  status: 'submitted' | 'approved' | 'paid'; submittedAt?: string; supplierCostId?: string
  category?: TripExpenseCategory; receiptName?: string; receiptSizeBytes?: number; receiptMimeType?: string
}
export interface ShipmentMilestone {
  id: string; jobId: string; shipmentId: string; title: string; occurredAt: string
  source: 'forwarding' | 'container' | 'trip' | 'driver' | 'customs' | 'warehouse'
  sourceRecordId?: string; customerVisible: boolean
}
export interface JobMilestoneTemplate {
  key: string; title: string; direction: 'import' | 'export'; condition: 'always' | 'warehouse' | 'direct' | 'container' | 'packing'
}
export interface JobMilestone {
  id: string; jobId: string; key: string; title: string; direction: 'import' | 'export'
  status: 'pending' | 'in-progress' | 'completed'; owner: string; updatedAt: string; completedAt?: string
}
export interface WarehouseInbound {
  id: string; jobId: string; containerId?: string; reference: string; status: 'received' | 'cancelled'
  receivedAt: string; transactionId: string; inventoryId: string
  expectedQuantity?: number; countedQuantity?: number; discrepancyNote?: string
  items?: WarehouseInboundItem[]
}
export interface WarehouseInboundItem {
  inventoryId: string; transactionId: string; sku: string; unit: 'carton' | 'pallet' | 'CBM'
  expectedQuantity?: number; countedQuantity: number; palletisedQuantity?: number; discrepancyNote?: string
}
export interface GoodsReceivedNote {
  id: string; warehouseInboundId: string; jobId: string; grnNumber: string; receivedAt: string
  status: 'confirmed' | 'cancelled'
}
export interface OutboundOrder {
  id: string; jobId: string; inventoryId: string; deliveryOrderNumber: string; quantity: number
  unit: 'carton' | 'pallet' | 'CBM'; status: 'open' | 'picking' | 'picked' | 'packed' | 'loading' | 'loaded' | 'dispatched' | 'In-Transit' | 'partial' | 'Delivered' | 'verified' | 'cancelled'
  createdAt: string; deliveryDate?: string; batchLot?: string; shipmentId?: string; containerId?: string
  pickedQuantity?: number; packedQuantity?: number; loadedQuantity?: number; dispatchedQuantity?: number
  assignedTripId?: string
  pickingStatus?: 'pending' | 'in-progress' | 'completed' | 'discrepancy'
  packingStatus?: 'pending' | 'completed'; loadingStatus?: 'pending' | 'task-created' | 'completed'
  dispatchStatus?: 'pending' | 'partial' | 'dispatched'; podStatus?: 'pending' | 'received' | 'verified'
  discrepancyNote?: string; labelReference?: string; loadingTaskCreatedAt?: string
  dispatchedAt?: string; transactionId?: string; deliveryVerifiedAt?: string
}
export interface WarehouseTransaction {
  id: string; jobId: string; containerId?: string; inventoryId?: string
  type: 'receiving' | 'palletisation' | 'putaway' | 'picking' | 'packing' | 'loading' | 'dispatch' | 'adjustment'
  quantity: number; unit: 'carton' | 'pallet' | 'CBM'; direction?: 'in' | 'out'
  reference?: string; note?: string; occurredAt: string
}
export interface InventoryRecord { id: string; jobId: string; customerId?: string; containerId?: string; sku: string; description: string; cartons: number; pallets: number; cbm: number; weightKg: number; bin: string; batchLot?: string; expiryDate?: string; status: 'stored' | 'allocated' | 'dispatched' }
export interface StorageCharge {
  id: string; jobId: string; customerId: string; inventoryId: string; storageRuleId: string
  periodStart: string; periodEnd: string; quantity: number; amount: number; chargeId?: string
}
export type DocumentCategory = 'job-docket' | 'quotation' | 'booking' | 'packing-list' | 'grn' | 'bl' | 'customs' | 'edo-gate-pass' | 'delivery-order' | 'label' | 'pod' | 'photo' | 'damage-photo' | 'supplier-invoice' | 'invoice' | 'einvoice' | 'voucher' | 'reconciliation' | 'receipt' | 'email'
export interface DocumentMetadata { id: string; jobId: string; name: string; category: DocumentCategory; status: 'available' | 'pending-review'; uploadedAt: string; sizeBytes?: number; mimeType?: string; relatedRecordId?: string; accessRule?: 'internal' | 'customer-visible' | 'finance-only'; previewText?: string }
export type ChargeCategory = 'forwarding fee' | 'documentation' | 'EDI' | 'customs clearance' | 'storage' | 'handling' | 'loading/unloading' | 'pallet' | 'forklift' | 'trucking' | 'toll' | 'waiting' | 'detention' | 'additional stops' | 'freight' | 'BL charges' | 'THC' | 'other carrier charges' | 'other'
export interface Charge { id: string; reference?: string; jobId: string; customerId: string; description: string; serviceType: ServiceType; category?: ChargeCategory; sourceActivity?: string; quantity: number; unit?: string; unitPrice: number; taxRate: number; invoiceId?: string; approved: boolean; status?: 'eligible' | 'invoiced' | 'cancelled'; createdAt?: string }
export interface SupplierCost { id: string; jobId: string; supplierId: string; tripId?: string; description: string; category: 'trucking' | 'toll' | 'other' | 'freight' | 'customs' | 'warehouse'; amount: number; currency?: Currency; classification?: 'estimated' | 'actual'; incurredDate?: string; reference?: string; posted: boolean; approvalStatus?: 'pending' | 'approved' | 'rejected'; supplierInvoiceId?: string; supportingDocumentId?: string }
export interface ReimbursementRequest { id: string; jobId?: string; tripExpenseId?: string; requestedBy: string; description: string; expenseCategory?: 'toll' | 'fuel' | 'parking' | 'port charges' | 'waiting' | 'detention' | 'driver allowance' | 'other'; amount: number; requestedDate?: string; supportingDocumentId?: string; justification?: string; reviewer?: string; paymentStatus?: PaymentStatus; status: 'submitted' | 'approved' | 'paid' | 'rejected' }
export interface CustomerInvoiceLine { id: string; chargeId: string; description: string; quantity: number; unitPrice: number; taxRate: number }
export interface CustomerInvoice { id: string; invoiceNumber: string; customerId: string; jobId: string; issueDate: string; dueDate: string; status: InvoiceStatus; paymentStatus: PaymentStatus; lines: CustomerInvoiceLine[]; eInvoiceStatus: 'not-submitted' | 'submitted' | 'accepted' | 'rejected'; eInvoiceReference?: string; emailStatus: 'not-sent' | 'sent'; emailRecipient?: string; activity?: string[] }
export interface SupplierInvoice { id: string; supplierId: string; reference: string; jobId: string; tripId?: string; costCategory?: SupplierCost['category']; invoiceDate: string; dueDate?: string; amount: number; lineItems?: { id: string; description: string; quantity: number; unitPrice: number }[]; validationStatus?: 'pending' | 'validated' | 'duplicate-warning' | 'rejected'; status: 'captured' | 'validated' | 'pending-approval' | 'voucher-created' | 'posted' | 'approved' | 'paid'; paymentStatus: PaymentStatus; supportingDocumentId?: string }
export interface PaymentVoucher { id: string; voucherNumber: string; supplierInvoiceId?: string; reimbursementId?: string; jobId?: string; supplierId?: string; description?: string; amount: number; status: 'draft' | 'pending-approval' | 'approved' | 'posted' | 'paid' }
export interface PaymentTransaction { id: string; reference: string; invoiceId?: string; supplierInvoiceId?: string; reimbursementId?: string; voucherId?: string; amount: number; transactionDate: string; status: 'posted' | 'void' }
export interface BankStatementTransaction { id: string; reference: string; description: string; amount: number; transactionDate: string; direction: 'credit' | 'debit'; matched: boolean }
export interface ReconciliationMatch { id: string; bankTransactionId: string; paymentTransactionId: string; matchedAt: string }
export interface Alert { id: string; type: 'customs' | 'free-days' | 'missing-document' | 'missing-billing' | 'payment' | 'vehicle' | 'invoice-approval' | 'einvoice' | 'supplier-invoice' | 'reconciliation' | 'shipment' | 'warehouse'; title: string; description: string; severity: 'Low' | 'Medium' | 'High'; resolved: boolean; jobId?: string; sourceRecordId?: string; sourceRecordType?: string; dueDate?: string; recipientRole?: User['role']; actionPath?: string }
export interface ActivityEvent { id: string; entityType: string; entityId: string; action: string; actor: string; occurredAt: string }
export interface User { id: string; name: string; email: string; role: 'admin' | 'operations' | 'finance' | 'driver' | 'customer'; customerId?: string }
export interface DemoAssumption { id: string; description: string; reason: string; affectedModules: string[]; value?: string; status: 'demo-assumption' | 'awaiting-confirmation'; demoBehaviour: string }
export interface StorageRule { id: string; unit: 'cbm' | 'pallet' | 'carton'; rate: number; freeDays: number; period: 'day' | 'month' }

export interface AppState {
  demoDate: string
  storageRules: StorageRule[]
  customers: Customer[]; suppliers: Supplier[]; quotationRequests: QuotationRequest[]; quotations: Quotation[]; jobs: Job[]; shipments: Shipment[]; shipmentMilestones: ShipmentMilestone[]; jobMilestones: JobMilestone[]; forwardingRecords: ForwardingRecord[]; containers: Container[]; containerEvents: ContainerEvent[]; customsRecords: CustomsRecord[]
  drivers: Driver[]; trucks: Truck[]; trailers: Trailer[]; trips: Trip[]; tripExpenses: TripExpense[]; warehouseInbounds: WarehouseInbound[]; goodsReceivedNotes: GoodsReceivedNote[]; outboundOrders: OutboundOrder[]; warehouseTransactions: WarehouseTransaction[]; inventory: InventoryRecord[]; storageCharges: StorageCharge[]; documents: DocumentMetadata[]
  charges: Charge[]; supplierCosts: SupplierCost[]; reimbursements: ReimbursementRequest[]; customerInvoices: CustomerInvoice[]; supplierInvoices: SupplierInvoice[]
  paymentVouchers: PaymentVoucher[]; paymentTransactions: PaymentTransaction[]; bankTransactions: BankStatementTransaction[]; reconciliationMatches: ReconciliationMatch[]
  alerts: Alert[]; activity: ActivityEvent[]; users: User[]; assumptions: DemoAssumption[]
}
