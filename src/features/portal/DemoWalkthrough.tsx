import { useState } from 'react'
import { Button, StatusBadge } from '../../components/ui.tsx'

const steps = [
  { title: 'Review the accepted quotation', path: '/app/quotations', record: 'QT-261001 · Meridian Foods', instruction: 'Open the accepted quote and follow its linked job. It is already converted; do not create a duplicate. To show a fresh handoff, accept an unlinked quotation first.' },
  { title: 'Create and open the job', path: '/app/jobs', record: 'SKI2610028 · Shipment SHP-2610028', instruction: 'Open the job to review its operational, document and financial links.' },
  { title: 'Review shipment execution', path: '/app/forwarding', record: 'BK-ES102-001 · EMCU5699789', instruction: 'Show vessel, ETA, shipment milestones and linked container tracking.' },
  { title: 'Complete driver trip and POD', path: '/driver', record: 'TRP-1042 · Ravi Kumar', instruction: 'Advance the assigned trip, capture a signature and submit the POD.' },
  { title: 'Capture supplier cost or invoice', path: '/app/expenses', record: 'Job SKI2610028 · TransHaul Logistics', instruction: 'Use Supplier costs or capture a supplier invoice tied to the job.' },
  { title: 'Create and pay a voucher', path: '/app/vouchers', record: 'Voucher workflow', instruction: 'Approve, post and simulate payment for a validated supplier invoice.' },
  { title: 'Generate the customer charge', path: '/app/billing', record: 'Completed trip TRP-1042', instruction: 'Generate eligible charges, then select the trip charge from Billing pending.' },
  { title: 'Review and approve invoice', path: '/app/billing', record: 'Invoice draft from the trip charge', instruction: 'Create a draft, submit it for finance review, then approve it.' },
  { title: 'Simulate e-invoice submission', path: '/app/billing', record: 'Approved customer invoice', instruction: 'Choose a successful or rejected demo response. No external service is called.' },
  { title: 'Simulate customer email', path: '/app/billing', record: 'Accepted e-invoice', instruction: 'Send the invoice to the customer in the demo; no real email is sent.' },
  { title: 'Reconcile the supplier payment', path: '/app/reconciliation', record: 'Payment-created bank line', instruction: 'Match the simulated supplier payment to its bank statement line.' },
  { title: 'Review job costing', path: '/app/job-costing', record: 'Job SKI2610028', instruction: 'Trace customer revenue and approved supplier costs back to the job.' },
]

export function DemoWalkthrough({ navigate }: { navigate: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [completed, setCompleted] = useState<number[]>([])
  const current = steps[step]

  const next = () => {
    setCompleted((done) => done.includes(step) ? done : [...done, step])
    if (step === steps.length - 1) setOpen(false)
    else setStep((index) => index + 1)
  }

  return <div className="walkthrough-wrap">
    {/* <Button className="walkthrough-trigger" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      Demo walkthrough <span className="walkthrough-count">{completed.length}/{steps.length}</span>
    </Button> */}
    {open && <section className="walkthrough-panel" aria-label="Client demonstration walkthrough">
      <div className="walkthrough-heading">
        <div><p className="eyebrow">Presenter guide · shared seed records</p><h2>{current.title}</h2></div>
        <button className="walkthrough-close" type="button" aria-label="Close walkthrough" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="walkthrough-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed.length}>
        <span style={{ width: `${(completed.length / steps.length) * 100}%` }} />
      </div>
      <div className="walkthrough-record"><StatusBadge tone="info">{step + 1} of {steps.length}</StatusBadge><strong>{current.record}</strong></div>
      <p className="walkthrough-instruction">{current.instruction}</p>
      <div className="walkthrough-actions">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((index) => Math.max(index - 1, 0))}>Previous</Button>
        <Button variant="secondary" onClick={() => navigate(current.path)}>Open step</Button>
        <Button onClick={next}>{step === steps.length - 1 ? 'Finish guide' : 'Next step'}</Button>
      </div>
      <details className="walkthrough-outline">
        <summary>Show all steps</summary>
        <ol>{steps.map((item, index) => <li key={item.title}>
          <button type="button" className={index === step ? 'walkthrough-step walkthrough-step--active' : 'walkthrough-step'} onClick={() => { setStep(index); navigate(item.path) }}>
            <span>{completed.includes(index) ? '✓' : index + 1}</span>{item.title}
          </button>
        </li>)}</ol>
      </details>
    </section>}
  </div>
}
