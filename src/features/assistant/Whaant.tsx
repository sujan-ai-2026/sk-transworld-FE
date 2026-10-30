import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, PageHeader, StatusBadge } from '../../components/ui.tsx'
import { calculateInvoiceTotals, calculateJobFinancials } from '../../domain/calculations.ts'
import type { AppState, CustomerInvoice, Job } from '../../domain/types.ts'
import { useAppState } from '../../state/AppContext.tsx'

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  text: string
  cards?: ReactNode
  timestamp: string
}

function customerName(state: AppState, job: Job) {
  return state.customers.find((customer) => customer.id === job.customerId)?.name ?? 'Unknown customer'
}

function money(amount: number) {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function invoiceBalance(invoice: CustomerInvoice) {
  return calculateInvoiceTotals(invoice).total
}

function answerQuestion(state: AppState, question: string) {
  const query = question.trim().toLowerCase()
  const matchedJob = state.jobs.find((job) =>
    query.includes(job.jobNumber.toLowerCase())
    || state.customers.some((customer) => customer.id === job.customerId && query.includes(customer.name.toLowerCase())),
  )

  if (matchedJob) {
    const customer = customerName(state, matchedJob)
    const shipment = state.shipments.find((item) => item.jobId === matchedJob.id)
    const container = state.containers.find((item) => item.jobId === matchedJob.id)
    const customs = state.customsRecords.find((item) => item.jobId === matchedJob.id)
    const trips = state.trips.filter((item) => item.jobId === matchedJob.id)
    const invoices = state.customerInvoices.filter((item) => item.jobId === matchedJob.id)
    const supplierInvoices = state.supplierInvoices.filter((item) => item.jobId === matchedJob.id)
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id))
    const supplierInvoiceIds = new Set(supplierInvoices.map((invoice) => invoice.id))
    const payments = state.paymentTransactions.filter((payment) =>
      payment.status === 'posted' && (
        (payment.invoiceId && invoiceIds.has(payment.invoiceId))
        || (payment.supplierInvoiceId && supplierInvoiceIds.has(payment.supplierInvoiceId))
      ),
    )
    const financials = calculateJobFinancials(state, matchedJob.id)
    const asksPayment = /payment|paid|outstanding|balance|invoice|billing|receivable|payable/.test(query)
    const asksShipment = /shipment|container|track|tracking|eta|vessel|route|freight/.test(query)
    const asksTrip = /trip|driver|truck|delivery|haulage|pod/.test(query)
    const heading = asksPayment ? 'Billing and payment status' : asksShipment ? 'Shipment status' : asksTrip ? 'Trips and delivery' : 'Job overview'
    const cards = asksPayment
      ? <div className="whaant-data-list">
        {invoices.length ? invoices.map((invoice) => <div className="whaant-data-row" key={invoice.id}>
          <span><strong>{invoice.invoiceNumber}</strong><small>Due {invoice.dueDate} · {invoice.status.replaceAll('-', ' ')}</small></span>
          <StatusBadge tone={invoice.paymentStatus === 'paid' ? 'success' : invoice.paymentStatus === 'partially-paid' ? 'warning' : 'neutral'}>{invoice.paymentStatus}</StatusBadge>
          <strong>{money(invoiceBalance(invoice))}</strong>
        </div>) : <p className="whaant-empty">No customer invoices are linked to this job.</p>}
        {supplierInvoices.map((invoice) => <div className="whaant-data-row" key={invoice.id}>
          <span><strong>Supplier · {invoice.reference}</strong><small>Due {invoice.dueDate ?? 'Not set'} · {invoice.status.replaceAll('-', ' ')}</small></span>
          <StatusBadge tone={invoice.paymentStatus === 'paid' ? 'success' : 'warning'}>{invoice.paymentStatus}</StatusBadge>
          <strong>{money(invoice.amount)}</strong>
        </div>)}
        {payments.map((payment) => <div className="whaant-data-row" key={payment.id}>
          <span><strong>Payment · {payment.reference}</strong><small>Posted {payment.transactionDate}</small></span>
          <StatusBadge tone="success">posted</StatusBadge>
          <strong>{money(payment.amount)}</strong>
        </div>)}
      </div>
      : asksShipment
        ? <div className="whaant-fact-grid">
          <span>Shipment<strong>{shipment?.reference ?? 'Not linked'}</strong></span>
          <span>Route<strong>{shipment ? `${shipment.origin} → ${shipment.destination}` : 'Not entered'}</strong></span>
          <span>ETA / status<strong>{shipment ? `${shipment.eta} · ${shipment.status}` : 'No shipment data'}</strong></span>
          <span>Container<strong>{container ? `${container.containerNumber} · ${container.movementStatus}` : 'Not linked'}</strong></span>
          <span>Customs<strong>{customs?.status ?? 'Not started'} · EDO {customs?.edoStatus ?? 'not available'}</strong></span>
        </div>
        : asksTrip
          ? <div className="whaant-data-list">{trips.length ? trips.map((trip) => <div className="whaant-data-row" key={trip.id}>
            <span><strong>{trip.tripNumber}</strong><small>{trip.pickup} → {trip.delivery} · {state.drivers.find((driver) => driver.id === trip.driverId)?.name ?? 'Driver unassigned'}</small></span>
            <StatusBadge tone={trip.status === 'completed' ? 'success' : 'info'}>{trip.status.replaceAll('-', ' ')}</StatusBadge>
            <span>{trip.podStatus ? `POD ${trip.podStatus}` : 'POD not recorded'}</span>
          </div>) : <p className="whaant-empty">No trips are linked to this job.</p>}</div>
          : <div className="whaant-fact-grid">
            <span>Customer<strong>{customer}</strong></span>
            <span>Service / status<strong>{matchedJob.serviceType} · {matchedJob.status.replaceAll('-', ' ')}</strong></span>
            <span>Shipment<strong>{shipment?.reference ?? 'Not linked'}</strong></span>
            <span>Open invoices<strong>{invoices.filter((invoice) => invoice.paymentStatus !== 'paid').length}</strong></span>
            <span>Gross profit<strong>{money(financials.grossProfit)}</strong></span>
          </div>

    return {
      text: `${heading} for ${matchedJob.jobNumber} · ${customer}. ${asksPayment
        ? `Customer invoices total ${money(invoices.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0))}; outstanding status is shown per invoice below. Supplier invoices are listed separately.`
        : asksShipment
          ? 'Here are the latest shipment, container and customs details recorded in the demo data.'
          : asksTrip
            ? 'Here are the trips currently linked to this job.'
            : `This ${matchedJob.serviceType} job is ${matchedJob.status.replaceAll('-', ' ')}. The summary below is calculated from shared job records.`}`,
      cards,
    }
  }

  if (/payment|paid|outstanding|balance|receivable|invoice/.test(query)) {
    const unpaidCustomer = state.customerInvoices.filter((invoice) => invoice.paymentStatus !== 'paid')
    const unpaidSuppliers = state.supplierInvoices.filter((invoice) => invoice.paymentStatus !== 'paid')
    const customerOutstanding = unpaidCustomer.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0)
    const supplierOutstanding = unpaidSuppliers.reduce((sum, invoice) => sum + invoice.amount, 0)
    const postedPayments = state.paymentTransactions.filter((payment) => payment.status === 'posted')
    const postedTotal = postedPayments.reduce((sum, payment) => sum + payment.amount, 0)
    return {
      text: `Across all jobs, ${unpaidCustomer.length} customer invoices are not fully paid (${money(customerOutstanding)} total invoice value), and ${unpaidSuppliers.length} supplier invoices remain unpaid (${money(supplierOutstanding)}). ${postedPayments.length} posted payment transactions total ${money(postedTotal)}. The lists below show current demo records.`,
      cards: <div className="whaant-data-list">
        {unpaidCustomer.slice(0, 6).map((invoice) => <div className="whaant-data-row" key={invoice.id}>
          <span><strong>{invoice.invoiceNumber}</strong><small>{state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber ?? 'Job not found'} · due {invoice.dueDate}</small></span>
          <StatusBadge tone={invoice.paymentStatus === 'partially-paid' ? 'warning' : 'neutral'}>{invoice.paymentStatus}</StatusBadge>
          <strong>{money(invoiceBalance(invoice))}</strong>
        </div>)}
        {unpaidSuppliers.slice(0, 4).map((invoice) => <div className="whaant-data-row" key={invoice.id}>
          <span><strong>Supplier · {invoice.reference}</strong><small>{state.jobs.find((job) => job.id === invoice.jobId)?.jobNumber ?? 'Job not found'} · due {invoice.dueDate ?? 'not set'}</small></span>
          <StatusBadge tone="warning">{invoice.paymentStatus}</StatusBadge>
          <strong>{money(invoice.amount)}</strong>
        </div>)}
        {postedPayments.slice(-4).reverse().map((payment) => {
          const customerInvoice = payment.invoiceId ? state.customerInvoices.find((invoice) => invoice.id === payment.invoiceId) : undefined
          const supplierInvoice = payment.supplierInvoiceId ? state.supplierInvoices.find((invoice) => invoice.id === payment.supplierInvoiceId) : undefined
          const jobId = customerInvoice?.jobId ?? supplierInvoice?.jobId
          return <div className="whaant-data-row" key={payment.id}>
            <span><strong>Payment · {payment.reference}</strong><small>{state.jobs.find((job) => job.id === jobId)?.jobNumber ?? 'Unallocated'} · {payment.transactionDate}</small></span>
            <StatusBadge tone="success">posted</StatusBadge>
            <strong>{money(payment.amount)}</strong>
          </div>
        })}
      </div>,
    }
  }

  if (/shipment|container|track|tracking|eta|vessel/.test(query)) {
    const shipments = state.shipments.filter((shipment) => {
      const job = state.jobs.find((item) => item.id === shipment.jobId)
      const customer = job && state.customers.find((item) => item.id === job.customerId)
      return !query || query.includes('all') || query.includes('shipment') || query.includes('container') || (job && query.includes(job.jobNumber.toLowerCase())) || (customer && query.includes(customer.name.toLowerCase()))
    }).slice(0, 8)
    return {
      text: `I found ${state.shipments.length} shipment records. Here are the current shipment movements from the shared job data.`,
      cards: <div className="whaant-data-list">{shipments.map((shipment) => {
        const job = state.jobs.find((item) => item.id === shipment.jobId)
        const container = state.containers.find((item) => item.shipmentId === shipment.id)
        return <div className="whaant-data-row" key={shipment.id}>
          <span><strong>{job?.jobNumber ?? 'Unknown job'} · {shipment.reference}</strong><small>{shipment.origin} → {shipment.destination} · ETA {shipment.eta}</small></span>
          <StatusBadge tone={shipment.status === 'Delivered' ? 'success' : shipment.status === 'delayed' ? 'danger' : 'info'}>{shipment.status}</StatusBadge>
          <span>{container?.containerNumber ?? 'No container'}</span>
        </div>
      })}</div>,
    }
  }

  if (/job|jobs|overview|summary|all work|status/.test(query)) {
    const activeJobs = state.jobs.filter((job) => !['completed', 'cancelled'].includes(job.status))
    return {
      text: `There are ${state.jobs.length} jobs in the workspace; ${activeJobs.length} are active. Here are the latest records with their shipment and billing status.`,
      cards: <div className="whaant-data-list">{state.jobs.slice(0, 8).map((job) => {
        const shipment = state.shipments.find((item) => item.jobId === job.id)
        const invoices = state.customerInvoices.filter((invoice) => invoice.jobId === job.id)
        const openInvoices = invoices.filter((invoice) => invoice.paymentStatus !== 'paid').length
        return <div className="whaant-data-row" key={job.id}>
          <span><strong>{job.jobNumber} · {customerName(state, job)}</strong><small>{shipment ? `${shipment.reference} · ${shipment.origin} → ${shipment.destination}` : 'No shipment linked'} · {openInvoices} open invoices</small></span>
          <StatusBadge tone={job.status === 'completed' ? 'success' : job.status === 'on-hold' ? 'warning' : 'info'}>{job.status.replaceAll('-', ' ')}</StatusBadge>
          <strong>{money(calculateJobFinancials(state, job.id).grossProfit)}</strong>
        </div>
      })}</div>,
    }
  }

  return {
    text: 'I can help with shared demo records for jobs, shipment tracking, containers, customs, trips, customer invoices, supplier payments and job profitability. Try a question like “What is the status of SKI2610028?” or “Which invoices are still unpaid?”',
  }
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
}

export function Whaant({ navigate }: { navigate: (path: string) => void }) {
  const { state } = useAppState()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [nextId, setNextId] = useState(1)
  const latestMessageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const sendQuestion = (question: string) => {
    const trimmed = question.trim()
    if (!trimmed) return
    const now = new Date()
    const answer = answerQuestion(state, trimmed)
    setMessages((current) => [
      ...current,
      { id: nextId, role: 'user', text: trimmed, timestamp: timeLabel(now) },
      { id: nextId + 1, role: 'assistant', text: answer.text, cards: answer.cards, timestamp: timeLabel(now) },
    ])
    setNextId((current) => current + 2)
    setDraft('')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    sendQuestion(draft)
  }

  const suggestions = [
    { title: 'Job status', prompt: 'Give me an overview of all jobs', icon: '▤' },
    { title: 'Track a shipment', prompt: 'Show shipment tracking and ETAs', icon: '↗' },
    { title: 'Unpaid invoices', prompt: 'Which customer invoices are still unpaid?', icon: 'RM' },
    { title: 'Job profitability', prompt: 'What is the status of SKI2610028?', icon: '◎' },
  ]

  return <div className="whaant-page">
    <PageHeader eyebrow="AI operations assistant" title="Whaant" description="Ask questions across jobs, shipments, payments and day-to-day operations."  />
    <section className="whaant-chat" aria-label="Whaant chat">
      <header className="whaant-chat-header">
        <div className="whaant-avatar" aria-hidden="true"><span>W</span><i /></div>
        <div className="whaant-chat-identity"><strong>Whaant assistant</strong><small><span /> Available · connected to demo data</small></div>
        <div className="whaant-chat-header-actions"><StatusBadge tone="success">Private workspace</StatusBadge><Button variant="ghost" disabled={!messages.length} onClick={() => { setMessages([]); setNextId(1) }}>New chat</Button></div>
      </header>
      <div className="whaant-chat-scroll" aria-live="polite">
        {!messages.length ? <div className="whaant-welcome">
          <div className="whaant-welcome-icon" aria-hidden="true"><span>W</span><i>✦</i></div>
          <p className="eyebrow">Your logistics workspace assistant</p>
          <h2>Good day. What would you like to know?</h2>
          <p>Ask a question in plain language. Whaant can look up jobs, shipment milestones, customer invoices, supplier payments and job financials from the shared demo workspace.</p>
          <div className="whaant-suggestions">{suggestions.map((item) => <button key={item.title} onClick={() => sendQuestion(item.prompt)} type="button"><span aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.prompt}</small><b aria-hidden="true">↗</b></button>)}</div>
        </div> : <div className="whaant-message-list">{messages.map((message) => <article className={`whaant-message whaant-message--${message.role}`} key={message.id}>
          {message.role === 'assistant' && <div className="whaant-message-avatar" aria-hidden="true">W</div>}
          <div className="whaant-message-content">
            <div className="whaant-message-meta"><strong>{message.role === 'assistant' ? 'Whaant' : 'You'}</strong><time>{message.timestamp}</time></div>
            <div className="whaant-message-bubble"><p>{message.text}</p>{message.cards && <div className="whaant-message-cards">{message.cards}</div>}</div>
            {message.role === 'assistant' && <div className="whaant-message-links"><button onClick={() => navigate('/app/jobs')} type="button">Jobs</button><button onClick={() => navigate('/app/billing')} type="button">Billing</button><button onClick={() => navigate('/app/haulage')} type="button">Trips</button></div>}
          </div>
        </article>)}<div ref={latestMessageRef} /></div>}
      </div>
      <div className="whaant-composer-area">
        {!messages.length && <div className="whaant-composer-hint"><span aria-hidden="true">✦</span> Try asking about a Job Number, customer, shipment, invoice or payment.</div>}
        <form className="whaant-composer" onSubmit={submit}>
          <label className="whaant-sr-only" htmlFor="whaant-question">Ask Whaant a question</label>
          <textarea id="whaant-question" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendQuestion(draft)
            }
          }} placeholder="Ask about a job, shipment, payment..." rows={1} value={draft} />
          <div className="whaant-composer-actions"><span>Enter to send · Shift + Enter for a new line</span><Button disabled={!draft.trim()} type="submit">Send <span aria-hidden="true">↑</span></Button></div>
        </form>
        <p className="whaant-disclaimer">Whaant uses a deterministic demo assistant over local mock records. It does not call an external AI service.</p>
      </div>
    </section>
  </div>
}
