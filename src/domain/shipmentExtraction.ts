export interface ShipmentExtraction {
  id: string
  name: string
  customerName: string
  shipmentReference: string
  direction: 'import' | 'export'
  mode: 'FCL' | 'LCL' | 'air'
  origin: string
  destination: string
  vessel?: string
  voyage?: string
  etd?: string
  eta?: string
  containerNumber?: string
  containerType?: '20ft' | '40ft' | '40ft HC'
  cargoDescription: string
  cartons?: number
  pallets?: number
  cbm?: number
  weightKg?: number
  blReference?: string
  hblReference?: string
  mblReference?: string
  pickupRequirements?: string
  deliveryRequirements?: string
  warehouseRequired: boolean
  supportingDocuments: string[]
}

export const shipmentExtractionSamples: ShipmentExtraction[] = [
  {
    id: 'import-manifest',
    name: 'Sample import manifest',
    customerName: 'Meridian Foods',
    shipmentReference: 'SHP-DEMO-IMPORT-01',
    direction: 'import',
    mode: 'FCL',
    origin: 'Shanghai, China',
    destination: 'Port Klang, Malaysia',
    vessel: 'Ever Summit',
    voyage: 'ES102E',
    etd: '2026-10-10',
    eta: '2026-11-02',
    containerNumber: 'DEMO5699789',
    containerType: '40ft HC',
    cargoDescription: 'Chilled packaged food',
    cartons: 480,
    pallets: 20,
    cbm: 28,
    weightKg: 8500,
    blReference: 'BL-DEMO-26001',
    hblReference: 'HBL-DEMO-26001',
    mblReference: 'MBL-DEMO-26001',
    pickupRequirements: 'Collect laden container after release.',
    deliveryRequirements: 'Deliver to customer warehouse; obtain signed POD.',
    warehouseRequired: true,
    supportingDocuments: ['Packing list', 'Bill of lading'],
  },
  {
    id: 'export-instructions',
    name: 'Sample export cargo instructions',
    customerName: 'Apex Retail',
    shipmentReference: 'SHP-DEMO-EXPORT-01',
    direction: 'export',
    mode: 'LCL',
    origin: 'Shah Alam, Malaysia',
    destination: 'Singapore',
    cargoDescription: 'Retail display units',
    cartons: 120,
    pallets: 8,
    cbm: 14.5,
    weightKg: 2100,
    hblReference: 'HBL-DEMO-EXPORT-01',
    pickupRequirements: 'Collect packed cargo from the customer facility.',
    deliveryRequirements: 'Deliver to Port Klang for export loading.',
    warehouseRequired: false,
    supportingDocuments: ['Packing list'],
  },
]

