import type { JobMilestone, JobMilestoneTemplate, Shipment } from './types.ts'

export const jobMilestoneTemplates: Record<'import' | 'export', JobMilestoneTemplate[]> = {
  import: [
    { key: 'arrival-monitoring', title: 'Arrival monitoring', direction: 'import', condition: 'always' },
    { key: 'import-clearance', title: 'Import clearance', direction: 'import', condition: 'always' },
    { key: 'release-edo', title: 'Release / EDO', direction: 'import', condition: 'always' },
    { key: 'laden-pickup', title: 'Laden pickup', direction: 'import', condition: 'always' },
    { key: 'warehouse-inbound', title: 'Warehouse inbound', direction: 'import', condition: 'warehouse' },
    { key: 'direct-delivery', title: 'Direct delivery', direction: 'import', condition: 'direct' },
    { key: 'empty-return', title: 'Empty return', direction: 'import', condition: 'container' },
  ],
  export: [
    { key: 'cargo-pickup', title: 'Cargo pickup', direction: 'export', condition: 'always' },
    { key: 'warehouse-preparation', title: 'Warehouse cargo preparation', direction: 'export', condition: 'warehouse' },
    { key: 'direct-cargo-preparation', title: 'Direct cargo preparation', direction: 'export', condition: 'direct' },
    { key: 'packing-palletisation', title: 'Packing / palletisation', direction: 'export', condition: 'packing' },
    { key: 'export-clearance', title: 'Export clearance', direction: 'export', condition: 'always' },
    { key: 'empty-pickup', title: 'Empty pickup', direction: 'export', condition: 'container' },
    { key: 'laden-delivery-port', title: 'Laden delivery to port', direction: 'export', condition: 'always' },
    { key: 'departure-monitoring', title: 'Departure monitoring', direction: 'export', condition: 'always' },
  ],
}

export function buildJobMilestones(
  jobId: string,
  shipment: Pick<Shipment, 'direction' | 'warehouseRequired' | 'containerQuantity' | 'mode' | 'pallets'>,
  owner: string,
  date: string,
  existing: JobMilestone[] = [],
): JobMilestone[] {
  const hasContainer = shipment.mode === 'FCL' || (shipment.containerQuantity ?? 0) > 0
  return jobMilestoneTemplates[shipment.direction]
    .filter((template) => template.condition === 'always'
      || (template.condition === 'warehouse' && shipment.warehouseRequired === true)
      || (template.condition === 'direct' && shipment.warehouseRequired !== true)
      || (template.condition === 'container' && hasContainer)
      || (template.condition === 'packing' && (shipment.warehouseRequired === true || (shipment.pallets ?? 0) > 0)))
    .filter((template) => !existing.some((milestone) => milestone.jobId === jobId && milestone.key === template.key))
    .map((template) => ({
      id: `job-milestone-${jobId}-${template.key}`,
      jobId,
      key: template.key,
      title: template.title,
      direction: template.direction,
      status: 'pending',
      owner,
      updatedAt: `${date}T09:00:00Z`,
    }))
}
