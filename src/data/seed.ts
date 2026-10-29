import type { AppState } from '../domain/types.ts'
import { buildJobMilestones } from '../domain/jobMilestones.ts'

export const DEMO_DATE = '2026-10-29'
export const seedState: AppState = {
  demoDate: DEMO_DATE,
  storageRules: [
    { id: 'storage-cbm', unit: 'cbm', rate: 3, freeDays: 3, period: 'day' },
    { id: 'storage-pallet', unit: 'pallet', rate: 8, freeDays: 0, period: 'day' },
    { id: 'storage-carton', unit: 'carton', rate: 5, freeDays: 0, period: 'month' },
  ],
  customers: [
    { id: 'cus-meridian', code: 'CUST-001', name: 'Meridian Foods', contactName: 'Aina Noor', email: 'accounts@meridian.example', paymentTermsDays: 30, storageRuleId: 'storage-cbm', status: 'active' },
    { id: 'cus-apex', code: 'CUST-002', name: 'Apex Retail', contactName: 'Jason Lim', email: 'finance@apex.example', paymentTermsDays: 45, storageRuleId: 'storage-pallet', status: 'active' },
    { id: 'cus-pacific', code: 'CUST-003', name: 'Pacific Home', contactName: 'Mei Tan', email: 'billing@pacific.example', paymentTermsDays: 30, storageRuleId: 'storage-carton', status: 'active' },
  ],
  suppliers: [
    { id: 'sup-transhaul', code: 'SUP-001', name: 'TransHaul Logistics', serviceType: 'haulage', contactName: 'Kumar Raj', email: 'ops@transhaul.example', status: 'active' },
    { id: 'sup-westport', code: 'SUP-002', name: 'Westport Services', serviceType: 'customs', contactName: 'Farah Ali', email: 'clearance@westport.example', status: 'active' },
    { id: 'sup-warepro', code: 'SUP-003', name: 'WarePro Storage', serviceType: 'warehouse', contactName: 'Siti Omar', email: 'billing@warepro.example', status: 'active' },
  ],
  quotations: [
    { id: 'quo-1001', reference: 'QT-261001', customerId: 'cus-meridian', issueDate: DEMO_DATE, validUntil: '2026-11-28', status: 'accepted', lines: [{ id: 'ql-1001', description: 'Import haulage', serviceType: 'haulage', quantity: 1, unit: 'trip', unitPrice: 1200, discount: 0, taxRate: 0 }] },
    { id: 'quo-1002', reference: 'QT-261002', customerId: 'cus-apex', issueDate: DEMO_DATE, validUntil: '2026-11-28', status: 'sent', lines: [{ id: 'ql-1002', description: 'Warehouse receiving', serviceType: 'warehouse', quantity: 12, unit: 'pallet', unitPrice: 8, discount: 0, taxRate: 0 }] },
  ],
  quotationRequests: [{ id: 'qreq-1001', requestNumber: 'QR-261001', customerId: 'cus-apex', requestedAt: DEMO_DATE, serviceType: 'warehouse', origin: 'Singapore', destination: 'Port Klang', cargoDescription: 'Retail pallet storage and handling', mode: 'LCL', status: 'submitted' }],
  jobs: [
    { id: 'job-1001', jobNumber: 'SKI2610028', customerId: 'cus-meridian', quotationId: 'quo-1001', serviceType: 'haulage', status: 'in-progress', owner: 'N. Farah', openedDate: '2026-10-24' },
    { id: 'job-1002', jobNumber: 'SKI2610031', customerId: 'cus-apex', quotationId: 'quo-1002', serviceType: 'warehouse', status: 'in-progress', owner: 'J. Kumar', openedDate: '2026-10-25' },
    { id: 'job-1003', jobNumber: 'SKI2610024', customerId: 'cus-pacific', serviceType: 'freight', status: 'open', owner: 'A. Lee', openedDate: '2026-10-22' },
  ],
  shipments: [
    { id: 'shp-1001', jobId: 'job-1001', reference: 'SHP-2610028', mode: 'FCL', direction: 'import', origin: 'Shanghai', destination: 'Shah Alam', eta: '2026-11-02', status: 'In-Transit' },
    { id: 'shp-1002', jobId: 'job-1002', reference: 'SHP-2610031', mode: 'LCL', direction: 'import', origin: 'Singapore', destination: 'Port Klang', eta: '2026-11-05', status: 'Booked', warehouseRequired: true },
    { id: 'shp-1003', jobId: 'job-1003', reference: 'SHP-2610024', mode: 'FCL', direction: 'import', origin: 'Singapore', destination: 'Port Klang', eta: '2026-11-05', status: 'In-Transit' },
  ],
  forwardingRecords: [
    { id: 'fwd-1001', jobId: 'job-1001', bookingReference: 'BK-ES102-001', shipmentId: 'shp-1001', customerId: 'cus-meridian', mode: 'FCL', direction: 'import', transshipment: false, carrier: 'Evergreen Marine', vessel: 'Ever Summit', voyage: 'ES102E', etd: '2026-10-10', eta: '2026-11-02', mbl: 'MBL-ES102-001', hbl: 'HBL-MER-0028', bl: 'BL-2610028', freeDays: 3, demurrageRate: 180, detentionRate: 150, milestones: ['Booking confirmed', 'Loaded on vessel', 'Discharged at Port Klang'] },
    { id: 'fwd-1002', jobId: 'job-1003', bookingReference: 'BK-MS221-004', shipmentId: 'shp-1003', customerId: 'cus-pacific', mode: 'FCL', direction: 'import', transshipment: true, carrier: 'Maya Shipping', vessel: 'Maya Star', voyage: 'MS221W', etd: '2026-10-18', eta: '2026-11-05', mbl: 'MBL-MS221-004', hbl: 'HBL-PAC-0024', freeDays: 5, demurrageRate: 160, detentionRate: 140, milestones: ['Booking confirmed', 'Transshipment Singapore', 'Awaiting discharge'] },
  ],
  shipmentMilestones: [
    { id: 'sm-1001', jobId: 'job-1001', shipmentId: 'shp-1001', title: 'Booking confirmed', occurredAt: '2026-10-10T09:00:00Z', source: 'forwarding', sourceRecordId: 'fwd-1001', customerVisible: true },
    { id: 'sm-1002', jobId: 'job-1001', shipmentId: 'shp-1001', title: 'Loaded on vessel', occurredAt: '2026-10-12T10:00:00Z', source: 'forwarding', sourceRecordId: 'fwd-1001', customerVisible: true },
    { id: 'sm-1003', jobId: 'job-1001', shipmentId: 'shp-1001', title: 'Discharged at Port Klang', occurredAt: '2026-10-28T15:00:00Z', source: 'forwarding', sourceRecordId: 'fwd-1001', customerVisible: true },
    { id: 'sm-1004', jobId: 'job-1001', shipmentId: 'shp-1001', title: 'Arrived at port', occurredAt: '2026-10-29T08:30:00Z', source: 'driver', sourceRecordId: 'trip-1001', customerVisible: true },
  ],
  jobMilestones: [],
  containers: [
    { id: 'con-1001', containerNumber: 'EMCU5699789', jobId: 'job-1001', shipmentId: 'shp-1001', size: '40ft HC', vessel: 'Ever Summit', voyage: 'ES102E', port: 'Port Klang', eta: '2026-11-02', freeDays: 3, freeTimeExpiryDate: '2026-10-30', movementStatus: 'at-port' },
    { id: 'con-1002', containerNumber: 'MSCU8831042', jobId: 'job-1003', shipmentId: 'shp-1003', size: '40ft', vessel: 'Maya Star', voyage: 'MS221W', port: 'Port Klang', eta: '2026-11-05', freeDays: 5, movementStatus: 'Booked' },
  ],
  containerEvents: [
    { id: 'cev-1001', containerId: 'con-1001', status: 'at-port', location: 'Port Klang Westport', occurredAt: '2026-10-29T08:30:00Z', note: 'Awaiting customs EDO' },
    { id: 'cev-1002', containerId: 'con-1001', status: 'discharged', location: 'Port Klang', occurredAt: '2026-10-28T15:00:00Z', note: 'Discharged from vessel' },
    { id: 'cev-1003', containerId: 'con-1002', status: 'loaded', location: 'Singapore', occurredAt: '2026-10-20T11:00:00Z', note: 'Loaded for export' },
  ],
  customsRecords: [
    { id: 'cusrec-1001', jobId: 'job-1001', declarationType: 'K1', status: 'inspection', dutyAndSst: 1850, edoStatus: 'pending', dutyStatus: 'unpaid', inspectionResult: 'pending', missingDocuments: ['EDO', 'Gate pass'], history: ['K1 submitted', 'SSR requested', 'Inspection scheduled'] },
    { id: 'cusrec-1002', jobId: 'job-1003', declarationType: 'K1', status: 'approved', dutyAndSst: 920, edoStatus: 'received', dutyStatus: 'paid', inspectionResult: 'passed', missingDocuments: [], history: ['K1 submitted', 'Duty paid', 'Customs approval', 'EDO received'] },
  ],
  drivers: [{ id: 'drv-ravi', name: 'Ravi Kumar', phone: '+60 12-555 1042', identityNumber: 'DEMO-ID-1042', email: 'ravi.driver@example.test', licenceNumber: 'D-LIC-1042', licenceExpiry: '2027-06-30', status: 'assigned' }, { id: 'drv-nadia', name: 'Nadia Farah', phone: '+60 13-555 8821', identityNumber: 'DEMO-ID-8821', email: 'nadia.driver@example.test', licenceNumber: 'D-LIC-8821', licenceExpiry: '2027-04-12', status: 'available' }],
  trucks: [{ id: 'trk-101', registrationNumber: 'VBC 1042', truckType: 'prime-mover', capacityTons: 25, ownership: 'owned', vehicleDocuments: ['Vehicle registration', 'Insurance certificate'], documentExpiry: '2027-03-31', roadTaxExpiry: '2026-10-30', insuranceExpiry: '2026-11-15', status: 'assigned' }, { id: 'trk-102', registrationNumber: 'VBY 2208', truckType: 'rigid', capacityTons: 15, ownership: 'leased', vehicleDocuments: ['Vehicle registration'], documentExpiry: '2027-08-31', status: 'available' }],
  trailers: [{ id: 'trl-101', registrationNumber: 'TLA 1042', type: 'skeletal', capacityTons: 30, documentStatus: 'valid', documentExpiry: '2027-03-31', status: 'assigned' }],
  trips: [{ id: 'trip-1001', tripNumber: 'TRP-1042', jobId: 'job-1001', shipmentId: 'shp-1001', containerId: 'con-1001', tripType: 'container-pickup', driverId: 'drv-ravi', truckId: 'trk-101', trailerId: 'trl-101', pickup: 'Westport Gate 3', delivery: 'Meridian Foods DC', status: 'in-progress', billingAmount: 1200, truckingCost: 700, tollCost: 80, otherCost: 50, milestones: ['Assigned', 'Arrived at port'], driverMilestones: [{ key: 'trip-started', label: 'Trip Started', occurredAt: '2026-10-29T09:30:00Z' }, { key: 'empty-pickup', label: 'Empty Pickup', occurredAt: '2026-10-29T10:15:00Z' }], portAppointment: '2026-10-29T09:30:00Z', portSlot: 'A-17', emptyPickup: '2026-10-28T16:00:00Z', ladenDelivery: '2026-10-29T12:00:00Z', returnEmpty: '2026-10-29T15:00:00Z', plannedPickup: '2026-10-29T09:30:00Z', plannedDelivery: '2026-10-29T15:00:00Z', estimatedTruckingCost: 700, estimatedTollCost: 80, estimatedOtherCost: 50, podStatus: 'pending', subcontractor: false }],
  tripExpenses: [{ id: 'texp-1001', tripId: 'trip-1001', jobId: 'job-1001', description: 'Parking receipt', category: 'parking', amount: 35, status: 'submitted', submittedAt: DEMO_DATE }],
  warehouseInbounds: [{ id: 'win-1001', jobId: 'job-1002', reference: 'IN-261002', status: 'received', receivedAt: DEMO_DATE, transactionId: 'wh-1001', inventoryId: 'inventory-1001' }],
  goodsReceivedNotes: [{ id: 'grn-1001', warehouseInboundId: 'win-1001', jobId: 'job-1002', grnNumber: 'GRN-261002', receivedAt: DEMO_DATE, status: 'confirmed' }],
  outboundOrders: [],
  warehouseTransactions: [{ id: 'wh-1001', jobId: 'job-1002', inventoryId: 'inventory-1001', type: 'receiving', quantity: 12, unit: 'pallet', reference: 'GRN-261002', occurredAt: DEMO_DATE }, { id: 'wh-1002', jobId: 'job-1002', inventoryId: 'inventory-1001', type: 'receiving', quantity: 4, unit: 'pallet', reference: 'GRN-260920', occurredAt: '2026-09-20' }],
  inventory: [{ id: 'inventory-1001', jobId: 'job-1002', customerId: 'cus-apex', sku: 'APX-CHAIR-01', description: 'Dining chair cartons', cartons: 120, pallets: 12, cbm: 18, weightKg: 2200, bin: 'B-04-12', status: 'stored' }],
  storageCharges: [],
  documents: [
    { id: 'doc-1001', jobId: 'job-1001', name: 'SKI2610028 Job Docket.pdf', category: 'job-docket', status: 'available', uploadedAt: '2026-10-24' },
    { id: 'doc-1002', jobId: 'job-1001', name: 'EMCU5699789 Packing List.pdf', category: 'customs', status: 'available', uploadedAt: '2026-10-25' },
    { id: 'doc-1003', jobId: 'job-1001', name: 'Delivery POD.jpg', category: 'pod', status: 'pending-review', uploadedAt: DEMO_DATE },
  ],
  charges: [
    { id: 'chg-1001', jobId: 'job-1001', customerId: 'cus-meridian', description: 'Haulage billing', serviceType: 'haulage', quantity: 1, unitPrice: 1200, taxRate: 0, invoiceId: 'inv-1001', approved: true },
    { id: 'chg-1002', jobId: 'job-1002', customerId: 'cus-apex', description: 'Customs clearance', serviceType: 'customs', quantity: 1, unitPrice: 450, taxRate: 0, approved: true },
    { id: 'chg-1003', jobId: 'job-1002', customerId: 'cus-apex', description: 'Warehouse storage', serviceType: 'warehouse', quantity: 12, unitPrice: 8, taxRate: 0, approved: true },
    { id: 'chg-1004', jobId: 'job-1003', customerId: 'cus-pacific', description: 'Forwarding service', serviceType: 'freight', quantity: 1, unitPrice: 900, taxRate: 0, approved: false },
    { id: 'chg-1005', jobId: 'job-1002', customerId: 'cus-apex', description: 'Warehouse handling', serviceType: 'warehouse', quantity: 1, unitPrice: 320, taxRate: 0, approved: true, invoiceId: 'inv-1002', status: 'invoiced', createdAt: DEMO_DATE },
    { id: 'chg-1006', jobId: 'job-1003', customerId: 'cus-pacific', description: 'Freight service', serviceType: 'freight', quantity: 1, unitPrice: 780, taxRate: 0, approved: true, invoiceId: 'inv-1003', status: 'invoiced', createdAt: '2026-10-01' },
  ],
  supplierCosts: [
    { id: 'cost-1001', jobId: 'job-1001', tripId: 'trip-1001', supplierId: 'sup-transhaul', description: 'Trucking cost', category: 'trucking', amount: 700, posted: true, supplierInvoiceId: 'sinv-1001' },
    { id: 'cost-1002', jobId: 'job-1001', tripId: 'trip-1001', supplierId: 'sup-transhaul', description: 'Port tolls', category: 'toll', amount: 80, posted: true, supplierInvoiceId: 'sinv-1001' },
    { id: 'cost-1003', jobId: 'job-1001', tripId: 'trip-1001', supplierId: 'sup-transhaul', description: 'Other trip cost', category: 'other', amount: 50, posted: true, supplierInvoiceId: 'sinv-1001' },
    { id: 'cost-1004', jobId: 'job-1002', supplierId: 'sup-warepro', description: 'Receiving labour', category: 'other', amount: 220, posted: false },
  ],
  reimbursements: [{ id: 'reim-1001', jobId: 'job-1001', tripExpenseId: 'texp-1001', requestedBy: 'Ravi Kumar', description: 'Parking receipt', amount: 35, status: 'submitted' }],
  customerInvoices: [{ id: 'inv-1001', invoiceNumber: 'INV-261001', customerId: 'cus-meridian', jobId: 'job-1001', issueDate: '2026-10-27', dueDate: '2026-11-26', status: 'approved', paymentStatus: 'partially-paid', lines: [{ id: 'il-1001', chargeId: 'chg-1001', description: 'Haulage billing', quantity: 1, unitPrice: 1200, taxRate: 0 }], eInvoiceStatus: 'accepted', emailStatus: 'sent' }, { id: 'inv-1002', invoiceNumber: 'INV-261002', customerId: 'cus-apex', jobId: 'job-1002', issueDate: DEMO_DATE, dueDate: '2026-11-28', status: 'pending-approval', paymentStatus: 'unpaid', lines: [{ id: 'il-1002', chargeId: 'chg-1005', description: 'Warehouse handling', quantity: 1, unitPrice: 320, taxRate: 0 }], eInvoiceStatus: 'not-submitted', emailStatus: 'not-sent' }, { id: 'inv-1003', invoiceNumber: 'INV-261003', customerId: 'cus-pacific', jobId: 'job-1003', issueDate: '2026-10-01', dueDate: '2026-10-15', status: 'finalised', paymentStatus: 'unpaid', lines: [{ id: 'il-1003', chargeId: 'chg-1006', description: 'Freight service', quantity: 1, unitPrice: 780, taxRate: 0 }], eInvoiceStatus: 'rejected', emailStatus: 'not-sent' }],
  supplierInvoices: [{ id: 'sinv-1001', supplierId: 'sup-transhaul', reference: 'TH-2026-1042', jobId: 'job-1001', invoiceDate: '2026-10-27', amount: 830, status: 'posted', paymentStatus: 'unpaid' }, { id: 'sinv-1002', supplierId: 'sup-warepro', reference: 'WP-2026-0932', jobId: 'job-1002', invoiceDate: DEMO_DATE, dueDate: '2026-11-15', amount: 220, status: 'captured', paymentStatus: 'unpaid' }],
  paymentVouchers: [{ id: 'vch-1001', voucherNumber: 'PV-261001', supplierInvoiceId: 'sinv-1001', amount: 830, status: 'pending-approval' }],
  paymentTransactions: [{ id: 'pay-1001', reference: 'RCPT-261001', invoiceId: 'inv-1001', amount: 500, transactionDate: DEMO_DATE, status: 'posted' }],
  bankTransactions: [{ id: 'bank-1001', reference: 'BANK-001', description: 'Meridian Foods receipt', amount: 500, transactionDate: DEMO_DATE, direction: 'credit', matched: true }, { id: 'bank-1002', reference: 'BANK-002', description: 'Westport Services payment', amount: 320, transactionDate: DEMO_DATE, direction: 'debit', matched: false }],
  reconciliationMatches: [{ id: 'match-1001', bankTransactionId: 'bank-1001', paymentTransactionId: 'pay-1001', matchedAt: DEMO_DATE }],
  alerts: [{ id: 'alert-1001', type: 'customs', title: 'EDO pending', description: 'EMCU5699789 is awaiting EDO release.', severity: 'High', resolved: false, jobId: 'job-1001' }, { id: 'alert-1002', type: 'missing-billing', title: 'Approved charge not invoiced', description: 'Forwarding service charge requires review.', severity: 'Medium', resolved: false, jobId: 'job-1003' }],
  activity: [{ id: 'act-1001', entityType: 'job', entityId: 'job-1001', action: 'Job opened', actor: 'Aina Noor', occurredAt: '2026-10-24T09:00:00Z' }],
  users: [{ id: 'usr-admin', name: 'Aina Noor', email: 'aina@sktransworld.example', role: 'admin' }, { id: 'usr-driver', name: 'Ravi Kumar', email: 'ravi@sktransworld.example', role: 'driver' }, { id: 'usr-customer', name: 'Aina Noor', email: 'accounts@meridian.example', role: 'customer', customerId: 'cus-meridian' }],
  assumptions: [
    { id: 'ASM-001', description: 'All demo monetary values use MYR.', reason: 'Source examples use RM.', affectedModules: ['billing', 'reports', 'costing'], value: 'MYR', status: 'demo-assumption', demoBehaviour: 'Currency labels display RM.' },
    { id: 'ASM-002', description: 'External integrations are simulated.', reason: 'No backend or paid services are required.', affectedModules: ['customs', 'tracking', 'einvoice', 'reconciliation'], status: 'awaiting-confirmation', demoBehaviour: 'Statuses update locally with deterministic mock responses.' },
    { id: 'ASM-003', description: 'Supplier invoice validation creates a pending approval voucher; payment is a separate action.', reason: 'The source workflow distinguishes invoices, vouchers and supplier payment.', affectedModules: ['supplier-invoices', 'vouchers', 'reconciliation'], status: 'demo-assumption', demoBehaviour: 'Only approved/postable vouchers can simulate payment; bank lines are created unmatched.' },
    { id: 'ASM-004', description: 'Reimbursements require reviewer approval and remain separate from supplier invoices.', reason: 'No reimbursement approval policy was specified.', affectedModules: ['reimbursements', 'job-costing'], status: 'awaiting-confirmation', demoBehaviour: 'Approved reimbursements contribute to costing; payment is simulated separately.' },
    { id: 'ASM-005', description: 'Job costing includes only approved or posted actual supplier costs.', reason: 'Unapproved/estimated costs should not affect the demo actual margin.', affectedModules: ['job-costing', 'financial-statements'], status: 'demo-assumption', demoBehaviour: 'Pending costs are excluded until approved or posted.' },
    { id: 'ASM-006', description: 'Job numbers use the SKI + date + sequence pattern.', reason: 'The client provided SKI2610028 as an example.', affectedModules: ['jobs'], value: 'SKIYYMM###', status: 'demo-assumption', demoBehaviour: 'The next job number is unique against the current shared jobs.' },
    { id: 'ASM-007', description: 'A job may be created without an accepted quotation through an exception path.', reason: 'Operations sometimes need to start before quote acceptance.', affectedModules: ['quotations', 'jobs'], status: 'awaiting-confirmation', demoBehaviour: 'The create-job flow labels and records the exception.' },
    { id: 'ASM-008', description: 'Storage uses calendar-day differences; full monthly blocks are rounded up.', reason: 'Partial-day and month proration rules were not specified.', affectedModules: ['warehouse', 'billing'], value: 'Calendar days; 30-day month', status: 'awaiting-confirmation', demoBehaviour: 'Daily tariffs subtract free days; monthly tariffs round partial blocks up.' },
    { id: 'ASM-009', description: 'Customer invoices require finance approval before finalisation.', reason: 'The client requested finance verification.', affectedModules: ['billing', 'finance'], status: 'demo-assumption', demoBehaviour: 'Approval and e-invoice submission are separate simulated transitions.' },
    { id: 'ASM-010', description: 'E-invoice submission and customer email are local simulations.', reason: 'No live service or credentials are provided.', affectedModules: ['billing', 'einvoice'], status: 'demo-assumption', demoBehaviour: 'Deterministic statuses/references are shown; no external request or email is sent.' },
    { id: 'ASM-011', description: 'Job-entry extraction uses deterministic sample documents.', reason: 'The demo must not call an AI service.', affectedModules: ['jobs'], status: 'demo-assumption', demoBehaviour: 'Only values present in the selected sample are suggested; missing vessel/date values require manual entry and review before saving.' },
    { id: 'ASM-012', description: 'Container tracking and driver GPS are simulated.', reason: 'No carrier feed or location service is connected.', affectedModules: ['containers', 'haulage', 'driver'], status: 'demo-assumption', demoBehaviour: 'User-triggered events update shared local records.' },
    { id: 'ASM-013', description: 'Customer portal access is scoped to the selected demo customer.', reason: 'Production authentication is not part of this mock-only app.', affectedModules: ['customer-portal'], status: 'demo-assumption', demoBehaviour: 'Only that customer’s jobs and customer-visible documents/charges are shown.' },
    { id: 'ASM-014', description: 'Warehouse balances are calculated per inventory record and stock movement.', reason: 'Job-level movement totals can incorrectly reduce unrelated SKUs.', affectedModules: ['warehouse'], status: 'demo-assumption', demoBehaviour: 'New movements link to one inventory record; legacy job-only movements are applied only when the job has one inventory record.' },
    { id: 'ASM-015', description: 'Submitted driver expenses are excluded from actual job cost until approved or paid.', reason: 'Unreviewed reimbursements should not change actual job profitability.', affectedModules: ['driver', 'expenses', 'job-costing'], status: 'demo-assumption', demoBehaviour: 'Trip expense totals are visible immediately, while job costing includes an approved expense once through its linked reimbursement/cost record.' },
    { id: 'ASM-016', description: 'Job milestone templates branch by direction, warehouse requirement and container mode.', reason: 'Import and export milestones differ, and not every shipment uses a warehouse or container.', affectedModules: ['jobs', 'forwarding', 'customs', 'warehouse', 'haulage'], status: 'demo-assumption', demoBehaviour: 'Only applicable milestones are created; the exported template definitions can be adjusted centrally.' },
    { id: 'ASM-017', description: 'Completed customs and forwarding activities use illustrative RM 450 event rates.', reason: 'Customer-specific agreed rates were not provided for automated charge generation.', affectedModules: ['customs', 'forwarding', 'billing', 'job-costing'], value: 'RM 450 per completed event', status: 'awaiting-confirmation', demoBehaviour: 'A released customs declaration or completed booking creates one eligible charge; update the centralized demo rates when confirmed.' },
    { id: 'ASM-018', description: 'Outbound handling uses RM 2 per dispatched unit; delivery uses the trip billing rate or RM 100 fallback.', reason: 'Customer-specific outbound tariffs were not provided.', affectedModules: ['warehouse', 'haulage', 'billing', 'job-costing'], value: 'RM 2 / unit; RM 100 / trip fallback', status: 'awaiting-confirmation', demoBehaviour: 'Only POD-verified dispatched quantities are charged; remaining inventory stays eligible for future storage billing.' },
    { id: 'ASM-019', description: 'Job-costing revenue is recognised from approved, finalised or paid customer invoices only.', reason: 'Eligible unbilled charges must not be presented as invoiced revenue.', affectedModules: ['billing', 'job-costing', 'financial-statements'], status: 'demo-assumption', demoBehaviour: 'Eligible unbilled charges are shown separately from invoiced revenue and do not increase gross profit until invoiced and approved.' },
  ],
}

seedState.jobMilestones = seedState.jobs.flatMap((job) => {
  const shipment = seedState.shipments.find((item) => item.jobId === job.id)
  return shipment ? buildJobMilestones(job.id, shipment, job.owner, DEMO_DATE) : []
})
