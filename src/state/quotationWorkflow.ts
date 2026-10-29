import { validateJob } from '../domain/validators.ts'
import { buildJobMilestones } from '../domain/jobMilestones.ts'
import type { ActivityEvent, AppState, Job, Quotation, QuotationRequest, Shipment } from '../domain/types.ts'

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export type QuotationWorkflowAction =
  | { type: 'submit-quotation-request'; request: QuotationRequest; activity: ActivityEvent }
  | { type: 'save-request-quotation'; requestId: string; quotation: Quotation; send: boolean; activity: ActivityEvent }
  | { type: 'respond-to-request-quotation'; quotationId: string; decision: 'accepted' | 'rejected' | 'revision-requested'; note?: string; job?: Job; shipment?: Shipment; activity: ActivityEvent[] }

export function applyQuotationWorkflowAction(state: AppState, action: QuotationWorkflowAction): AppState {
  switch (action.type) {
    case 'submit-quotation-request': {
      const request = action.request
      if (state.quotationRequests.some((item) => item.id === request.id || item.requestNumber.toLowerCase() === request.requestNumber.toLowerCase())) return state
      if (!state.customers.some((customer) => customer.id === request.customerId) || !request.requestNumber.trim() || !request.origin?.trim() || !request.destination?.trim() || !request.cargoDescription.trim()) return state
      if (request.containerQuantity !== undefined && (!Number.isInteger(request.containerQuantity) || request.containerQuantity < 1)) return state
      if (!request.requestedPickupDate || !request.requestedDeliveryDate || !isValidDateOnly(request.requestedPickupDate) || !isValidDateOnly(request.requestedDeliveryDate)) return state
      if (request.requestedPickupDate < state.demoDate || request.requestedDeliveryDate < request.requestedPickupDate) return state
      return { ...state, quotationRequests: [...state.quotationRequests, request], activity: [...state.activity, action.activity] }
    }
    case 'save-request-quotation': {
      const request = state.quotationRequests.find((item) => item.id === action.requestId)
      const quotation = action.quotation
      if (!request || quotation.requestId !== request.id || quotation.customerId !== request.customerId) return state
      if (['accepted', 'rejected', 'converted'].includes(request.status)) return state
      const existingDraft = state.quotations.find((item) => item.id === quotation.id)
      if (existingDraft && (existingDraft.requestId !== request.id || existingDraft.status !== 'draft')) return state
      if (request.status === 'quoted' && !existingDraft) return state
      if (state.quotations.some((item) => item.id !== quotation.id && item.reference.toLowerCase() === quotation.reference.toLowerCase())) return state
      if (!quotation.reference.trim() || !isValidDateOnly(quotation.validUntil) || quotation.validUntil < state.demoDate || !quotation.lines.length) return state
      if (action.send && quotation.lines.some((line) => !line.description.trim() || !line.unit.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.discount) || line.discount < 0 || line.discount > line.quantity * line.unitPrice || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 1)) return state
      if (action.send && quotation.lines.reduce((total, line) => total + (line.quantity * line.unitPrice - line.discount) * (1 + line.taxRate), 0) <= 0) return state
      const versions = state.quotations.filter((item) => item.requestId === request.id && item.id !== quotation.id)
      const expectedVersion = existingDraft?.version ?? versions.length + 1
      if (quotation.version !== expectedVersion) return state
      const previous = quotation.replacesQuotationId
        ? state.quotations.find((item) => item.id === quotation.replacesQuotationId && item.requestId === request.id)
        : undefined
      if (quotation.replacesQuotationId && (!previous || !['revision-requested', 'revised'].includes(previous.status))) return state
      if (action.send && request.status === 'revision-requested' && !previous) return state
      const updatedQuote = { ...quotation, status: action.send ? 'sent' as const : 'draft' as const }
      return {
        ...state,
        quotations: state.quotations
          .map((item) => previous && item.id === previous.id ? { ...item, status: 'revised' as const } : item)
          .filter((item) => item.id !== quotation.id)
          .concat(updatedQuote),
        quotationRequests: state.quotationRequests.map((item) => item.id === request.id
          ? { ...item, status: action.send ? 'quoted' : request.status, quotationId: action.send ? quotation.id : request.quotationId }
          : item),
        activity: [...state.activity, action.activity],
      }
    }
    case 'respond-to-request-quotation': {
      const quotation = state.quotations.find((item) => item.id === action.quotationId)
      const request = quotation?.requestId && state.quotationRequests.find((item) => item.id === quotation.requestId)
      if (!quotation || !request || quotation.status !== 'sent' || !isValidDateOnly(quotation.validUntil) || quotation.validUntil < state.demoDate || request.status !== 'quoted' || request.quotationId !== quotation.id) return state
      if (action.decision === 'revision-requested' && !action.note?.trim()) return state
      if (state.jobs.some((job) => job.quotationId === quotation.id || job.quotationRequestId === request.id)) return state
      if (action.decision === 'accepted') {
        const job = action.job
        const shipment = action.shipment
        if (!job || !shipment || job.customerId !== request.customerId || job.quotationId !== quotation.id || job.quotationRequestId !== request.id || job.serviceType !== request.serviceType) return state
        if (shipment.origin !== request.origin || shipment.destination !== request.destination || shipment.direction !== (request.direction ?? 'import') || shipment.mode !== (request.mode ?? 'LCL') || shipment.cargoDescription !== request.cargoDescription || shipment.containerQuantity !== request.containerQuantity || shipment.warehouseRequired !== request.warehouseRequired) return state
        if (shipment.jobId !== job.id || state.shipments.some((item) => item.id === shipment.id) || state.jobs.some((item) => item.id === job.id) || validateJob(state, job).length) return state
        return {
          ...state,
          quotations: state.quotations.map((item) => item.id === quotation.id ? { ...item, status: 'accepted', responseNote: action.note } : item),
          quotationRequests: state.quotationRequests.map((item) => item.id === request.id ? { ...item, status: 'accepted', jobId: job.id } : item),
          jobs: [...state.jobs, job],
          shipments: [...state.shipments, shipment],
          jobMilestones: [...state.jobMilestones, ...buildJobMilestones(job.id, shipment, job.owner, state.demoDate, state.jobMilestones)],
          activity: [...state.activity, ...action.activity],
        }
      }
      return {
        ...state,
        quotations: state.quotations.map((item) => item.id === quotation.id ? { ...item, status: action.decision, responseNote: action.note } : item),
        quotationRequests: state.quotationRequests.map((item) => item.id === request.id ? { ...item, status: action.decision } : item),
        activity: [...state.activity, ...action.activity],
      }
    }
  }
}
