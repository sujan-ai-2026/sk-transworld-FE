# UI Kit Agent Instructions

## Visual language

- Use the pale blue-gray canvas (`#E9EDF6`) and white rounded surfaces.
- Use `#3783FF` for primary actions, focus rings, progress, and active states.
- Use `#EFB54A` for warnings and attention states.
- Keep cards readable and information-dense without crowding.
- Prefer subtle borders and Low-contrast shadows over heavy glass effects.

## Layout

- Use CSS Grid or Flexbox with `min-width: 0`.
- Keep responsive breakpoints at approximately 960px, 720px, and 560px where appropriate.
- Stack dense sections on mobile and avoid horizontal page overflow.
- Use internal scrolling for modal content, never fixed-height content that clips.

## Accessibility

- Keep all actions as semantic buttons or links.
- Preserve visible `:focus-visible` states.
- Provide labels for inputs and accessible names for icon-only buttons.
- Respect `prefers-reduced-motion`.
- Modal overlays should support Escape, backdrop dismissal, focus management, and body scroll locking.

## Reuse rules

- Import `theme/global.css` once at the application entry point.
- Keep component-specific CSS beside its component.
- Do not add a new dependency for icons or simple decorative shapes.
- Keep live data, business rules, and API integration outside this visual kit.
- Do not copy application-specific workspace components without their data models and handlers.

# CLMS — Master Product, Design and Development Instructions

## 1. Your Role

Act as a Senior Product Engineer, Senior Business Analyst, Product Owner, UX/UI Designer and React Architect working together.

Build a polished, interactive, client-presentation-ready Combined Logistics Management System (CLMS) based on the consolidated requirements from the client.

The deliverable is a complete React web application that demonstrates realistic end-to-end business workflows using mock data only.

The application must be functional enough for a client demonstration. It must not be merely a static Figma-style prototype or a collection of non-functional screens.

## 2. Existing Project — Mandatory First Step

An existing React project is already available in the working directory. It includes an existing theme/agent component that must be inspected before development.

Before changing any files:

1. Inspect the project structure and identify the framework, React version, build tool, package manager, routing, styling system, installed dependencies, shared components, icons, and theme configuration.
2. Read the existing agent instructions and theme/component files.
3. Identify the existing design tokens, typography, spacing, colours, buttons, forms, tables, cards, navigation and modal patterns.
4. Reuse the existing theme and components wherever appropriate.
5. Preserve existing working functionality and project conventions.
6. Do not replace the project, initialise a new application, or rewrite the theme from scratch unless the existing implementation genuinely prevents the required functionality.
7. Do not install redundant libraries when the existing dependencies can meet the requirement.
8. Do not overwrite unrelated files, environment settings or existing application configuration.
9. Confirm the actual commands required to run and build the existing project before making architectural changes.

If the repository contains an existing agent/theme component, treat it as the primary design reference. Extend it instead of introducing a competing theme system.

If an essential implementation decision cannot be established from the project, inspect the relevant files and use a minimal, reversible assumption.

## 3. Product Vision

Build an integrated logistics operations and financial management product with three connected user-facing applications:

1. Logistics Portal — internal operations, customer service, forwarding, customs, trucking, warehouse, billing, finance and management.
2. Customer Portal — customer-facing shipment tracking, documents, charges and other confirmed demo capabilities.
3. Driver Mobile App — responsive mobile-first trip execution, GPS/status simulation, proof of delivery and trip expenses.

The three applications must share one mock-data model and common business identifiers. They must not behave like three disconnected demos.

The central business identifier is the Job Number. It connects quotations, jobs, shipments, containers, customs records, trips, warehouse transactions, documents, charges, supplier costs and financial records.

Primary client objectives:

- Manage the complete logistics job lifecycle.
- Create quotations and manage customer/supplier rates.
- Create jobs/dockets with AI-assisted data-entry simulation.
- Track freight forwarding, customs clearance, trucking, warehouse and container movements.
- Digitise hard-copy documents.
- Capture supplier costs, reimbursement requests and expense bills.
- Automatically generate customer charges and invoice drafts.
- Support finance verification and approval.
- Demonstrate e-invoice submission and customer email delivery.
- Process supplier invoices and payment vouchers.
- Demonstrate bank reconciliation.
- Display job costing, gross profit, Profit and Loss and Balance Sheet mock reports.
- Provide role-based dashboards, follow-ups, alerts and missing-billing controls.

## 4. Source-of-Truth and Assumptions

The client's original CLMS requirements and subsequent handwritten workflow are the source of truth.

Preserve all explicitly stated requirements. Do not silently replace client terminology or invent regulatory requirements.

When a business rule is missing:

1. Implement a sensible, demo-friendly assumption.
2. Make the assumption consistent across every relevant module.
3. Add it to a central assumptions register.
4. Label the relevant UI behaviour as "Demo assumption" where useful.
5. Make configurable assumptions easy to change.
6. Do not present a simulated integration as a real integration.
7. Never block the entire demonstration because an open question is unresolved.

Important provisional assumptions:

- Use a unique Job Number such as SKI2610028.
- Permit a job to be created without an accepted quotation using a clearly labelled exception path.
- Allow one job to contain multiple shipments, containers, trips, documents, costs and charges.
- Allow a customer invoice to contain multiple charge lines.
- Keep quotation, job, charge, invoice, supplier invoice, voucher and payment records as separate entities.
- Generate invoice drafts from eligible, approved billable charges.
- Require finance approval before invoice finalisation.
- Simulate e-invoice submission and email delivery. Show realistic statuses without calling external services.
- Separate supplier invoice posting from actual supplier payment.
- Treat reimbursement as a separate expense/payment-request workflow.
- Use MYR/RM for the demo because the source examples use RM.
- Use a configurable demo date and fixed seed data so the demonstration is repeatable.
- Treat Profit and Loss and Balance Sheet as simulated reports based on a simplified, internally consistent mock ledger.
- Treat AI-assisted job entry as a simulation of document extraction and suggested field population.
- Treat GPS tracking, customs status, port tracking, bank feeds and e-invoice integration as simulated unless a real integration is explicitly requested later.

Do not use these assumptions to claim production accounting or regulatory compliance.

## 5. Technical Constraints

- Use the existing React application and build tool.
- Follow the installed framework and routing conventions.
- Use TypeScript if the project already uses it or can adopt it without disrupting the existing application.
- Use reusable, maintainable components.
- Use the existing icon library and design system.
- Avoid unnecessary dependencies.
- Use local mock data and deterministic business logic.
- Do not require a backend, database, live API, API key, cloud service or paid integration.
- Do not hardcode a separate copy of the same business record in each page.
- Keep domain models, mock data, calculations, UI components and page components separate.
- Keep all external integration behaviour behind mock adapters or service interfaces.
- Provide a working production build.
- Do not claim the app is ready to deploy until the build has passed.

## 6. Recommended Architecture

Adapt the structure to the existing repository instead of forcing an unrelated architecture.

Suggested organisation:

src/
  app/
    App
    router
    navigation
  components/
    layout/
    ui/
    data-display/
    forms/
    charts/
    workflow/
  features/
    dashboard/
    customers/
    quotations/
    jobs/
    forwarding/
    customs/
    haulage/
    warehouse/
    containers/
    documents/
    billing/
    expenses/
    accounting/
    reconciliation/
    reports/
    alerts/
    customer-portal/
    driver-app/
  data/
    seed/
    fixtures/
    assumptions
  domain/
    types
    constants
    calculations
    validators
    workflows
  services/
    mock/
  hooks/
  utils/
  styles/

Use the existing naming and folder conventions when they differ.

## 7. Design System and Visual Quality

Inspect and reuse the existing theme/agent component.

The application should feel like a professional enterprise logistics SaaS product.

Design requirements:

- Responsive desktop-first Logistics Portal.
- Mobile-first Driver App.
- Clear navigation and information hierarchy.
- Consistent page headers, breadcrumbs, filters, cards, forms, tables and status badges.
- Appropriate loading, empty, validation, success and error states.
- Consistent spacing, typography, borders, shadows, colour tokens and focus states.
- Search, filtering, sorting and pagination for data-heavy tables.
- Accessible form labels and keyboard navigation.
- Confirmation dialogs for destructive or financially significant actions.
- Toasts or inline feedback for successful actions and failures.
- No dead buttons, empty placeholder routes or fake controls that do nothing.
- No invented decorative data that conflicts with the underlying mock records.
- Use a consistent status vocabulary across all modules.
- Use charts only where they help explain the business.
- Prefer polished, realistic data tables and operational workflows over oversized decorative cards.

The application must look credible during screen sharing and client presentations.

## 8. Required Navigation

Create a role-aware Logistics Portal navigation with these sections:

- Dashboard
- Customers
- Suppliers
- Quotations & Rates
- Jobs & Dockets
- Freight Forwarding
- Customs Clearance
- Container Tracking
- Haulage & Trips
- Warehouse & Inventory
- Documents
- Billing & Customer Invoices
- Supplier Invoices & Expenses
- Payment Vouchers
- Bank Reconciliation
- Job Costing
- Financial Statements
- Reports
- Alerts & Follow-ups
- User/Role Administration
- Assumptions Register

Provide clear ways to enter the Customer Portal demo and Driver App demo without pretending they are the same interface.

A demo role switcher is acceptable. It must clearly state that it changes the simulated user role and is not production authentication.

## 9. Core Functional Modules

### A. Dashboard

Show operational and financial KPIs:

- Deliveries today
- Containers arriving
- Customs pending
- EDO pending
- Warehouse deliveries
- Trucks required
- Pending quotations/jobs
- Shipment follow-ups
- Invoices awaiting approval
- Billable charges not invoiced
- Outstanding customer payments
- Supplier payables
- Today's and month-to-date revenue
- Job profitability

Provide date filters, status filters, drill-downs and links to underlying records.

Use consistent formulas and shared mock data.

### B. Customer and Supplier Management

Support list, search, filters, record detail and create/edit forms.

Maintain customer contacts, billing details, payment terms, rate references and supplier service details using mock data.

### C. Quotations and Rates

Allow users to:

- Create and edit quotations.
- Add logistics service line items.
- Select customers.
- Apply mock rates.
- Calculate subtotals, taxes where configured, and totals.
- Simulate approval and sending.
- Mark quotations accepted/rejected.
- Create a job from an accepted quotation.
- Maintain supplier rate/tariff examples.
- View quotation history.

### D. Job Management

Allow users to:

- Create a job docket.
- Generate a unique Job Number.
- Link customers and quotations.
- Enter shipment and service details.
- Simulate AI extraction from a sample document.
- Review/edit suggested values before saving.
- Track job status and assigned departments.
- View related shipments, containers, trips, documents, costs, charges and invoices.
- View a job activity timeline.
- Edit permitted fields.
- Cancel or close jobs according to demo rules.

### E. Freight Forwarding

Support booking records, BL/HBL/MBL, vessel/voyage, ETA/ETD, FCL/LCL, import/export, transshipment, shipping line/co-loader, container links, free days, demurrage and detention.

### F. Customs Clearance

Represent the source's terminology:

K1, K2, K3, K4, K5, K8, ZB, DG declaration, DSO, IGM, customs status, duty/SST, customs payment, approval, SSR, inspection, EDO, gate pass and release.

Provide a demo workflow, document checklist, status history and exceptions.

Do not invent official legal meanings or external authority integrations.

### G. Haulage and Driver App

Support trucks, trailers, drivers, trips, pickup/delivery, port appointments, empty pickup, laden delivery, return empty, subcontractor trucking, GPS simulation, POD signature/photo simulation and trip expenses.

The Driver App must provide a mobile-first interface for assigned trips, trip detail, milestone updates, POD and expenses.

### H. Warehouse and Storage Billing

Support inbound receiving, unloading, counting, damage/shortage photos, GRN, palletisation, labelling, stock movements, SKU, cartons, pallets, CBM, weight, bin/rack, batch/lot and expiry date.

Support outbound delivery orders, picking, packing, loading, dispatch and POD.

Implement customer-specific storage tariff examples and configurable free-day rules.

### I. Container Tracking

Show container, Job Number, shipment, vessel/voyage, port, ETA, movement status, free-day information and event history.

Simulate tracking updates.

### J. Document Management

Provide a digital job folder with categories including:

- Quotation and job docket
- BL/HBL/MBL
- Packing list
- Customs documents
- EDO and gate pass
- Delivery order and POD
- Photographs
- Supplier invoices and receipts
- Customer invoices and e-invoice acknowledgements
- Payment vouchers and reconciliation documents
- Customer emails

Support mock upload, preview, category assignment, search and download where the browser can support it.

Do not claim files have been uploaded to an external document repository.

### K. Customer Billing and E-Invoicing

Implement the lifecycle:

Operational activity → Eligible charge → Invoice draft → Finance review → Approved/finalised → Simulated e-invoice submission → Simulated customer email delivery.

Provide:

- Charge catalogue.
- Customer rate selection.
- Charge generation.
- Missing-billing detection.
- Invoice draft creation.
- Invoice line review.
- Finance approval/rejection.
- Submission simulation.
- Submission status and reference.
- Email status simulation.
- Invoice history and correction scenarios.
- Outstanding balance and due-date visibility.

### L. Supplier Invoices, Expenses and Vouchers

Support supplier cost entry, supplier invoice capture, reimbursement requests, expense bills, voucher generation, manual expense vouchers and approval status.

Distinguish supplier invoice posting from actual payment.

Show duplicate warnings and status transitions.

### M. Bank Reconciliation

Provide mock bank statement lines, system transactions, suggested matches, unmatched items, manual matching and reconciliation summaries.

Prevent a transaction from being matched twice.

### N. Job Costing and Financial Statements

Implement deterministic calculations for:

- Customer revenue.
- Supplier costs.
- Trucking costs.
- Toll and other expenses.
- Gross profit.
- Job profitability.
- Revenue and costs by customer, service and department.
- Mock Profit and Loss.
- Mock Balance Sheet.

Include a clear demo disclaimer that the financial reports use simplified mock data and do not constitute production accounting.

### O. Dashboard, Reports and Alerts

Provide searchable/filterable operational listings, shipment follow-ups, free-day alerts, pending EDO, overdue customer payments, long-stay cargo, vehicle document expiry, missing documents and missing-billing exceptions.

### P. Customer Portal

Provide a separate customer-facing interface with login simulation, shipment list/detail, container tracking, ETA, authorised documents and charges.

Quotation and invoice views may be included as labelled demo assumptions.

### Q. Driver App

Provide a separate mobile-first interface for assigned trips, movement updates, GPS simulation, POD capture and trip expense submission.

### R. Assumptions and Demo Controls

Maintain a central assumptions register with:

- Assumption ID
- Description
- Reason
- Affected modules
- Configurable value where relevant
- Status: Demo assumption / Awaiting client confirmation
- Demo behaviour

Include a reset-demo-data action and a simulated date control if helpful.

## 10. Mock Data Policy

Use realistic, internally consistent sample records.

Include sample customers, suppliers, quotations, jobs, shipments, containers, customs records, trips, drivers, warehouse inventory, documents, charges, customer invoices, supplier invoices, vouchers, bank transactions and alerts.

Use the source examples where possible:

- Example Job Number: SKI2610028
- Example container: EMCU5699789
- Customer A storage: RM 3 per CBM per day with 3 free days
- Customer B storage: RM 8 per pallet per day
- Customer C storage: RM 5 per carton per month
- Haulage example: RM 1,200 billing, RM 700 trucking, RM 80 toll and RM 50 other cost, producing RM 370 profit

The sample data must be coherent across pages.

A job appearing in the dashboard, job detail, container tracking, invoice and job costing report must reference the same underlying record.

Avoid random values generated on every render.

## 11. State and Persistence

Use shared application state for all related records.

Prefer the existing state-management solution. If none exists, use a lightweight context/reducer or equivalent approach suitable for the project.

Local storage may be used for demo persistence if permitted by the existing architecture. Keep persistence behind a small adapter so the app can be reset reliably.

Required behaviour:

- Creating a quotation updates the quotation list.
- Creating a job updates the job list and dashboard.
- Generating charges updates the job's financial summary.
- Creating an invoice marks eligible charges as included in that invoice.
- Approving an invoice updates its status.
- Simulated e-invoice submission updates submission status.
- Submitting a trip expense updates the expense list.
- Creating/posting a voucher updates the relevant accounting views.
- Reconciling a transaction updates the reconciliation summary.
- Driver milestone updates appear in the Logistics Portal and Customer Portal.
- Alerts change when the underlying condition is resolved.

Prevent duplicate charges, duplicate invoices and duplicate reconciliation matches.

## 12. Workflow and Validation Rules

Implement explicit status transitions and validation rules.

At minimum:

- Job Number must be unique.
- Required fields must be validated.
- Quotation totals must be calculated from line items.
- Invoice totals must equal the sum of invoice lines and applicable configured taxes.
- Charges must reference valid jobs.
- A charge must not be invoiced twice.
- Rejected invoices return to a correction workflow.
- Supplier invoices must have unique mock references or produce a duplicate warning.
- Vouchers must follow the configured approval/posting workflow.
- Reconciled transactions cannot be matched again.
- Driver updates must reference an assigned trip.
- Customer access must be restricted to the selected demo customer.
- Destructive actions require confirmation.

## 13. Accessibility and Responsive Design

- Provide labelled form controls.
- Use semantic buttons and links.
- Ensure keyboard focus visibility.
- Use readable colour contrast.
- Do not rely only on colour to communicate statuses.
- Use responsive tables or alternative layouts for smaller screens.
- Ensure the Driver App is comfortable to use on a mobile viewport.
- Test the main workflows at desktop and mobile sizes.

## 14. Implementation and Quality Rules

- Do not build the entire application as one giant component.
- Do not duplicate business logic in multiple pages.
- Do not add routes that render empty pages.
- Do not use buttons that have no meaningful action.
- Do not suppress TypeScript or build errors to force a successful build.
- Do not introduce fake external API calls.
- Do not hardcode conflicting totals.
- Do not claim production compliance or live integration.
- Do not replace the existing theme.
- Use the project's existing linting, formatting and test conventions.

## 15. Delivery and Definition of Done

The project is complete only when:

1. All required routes work.
2. The three applications can be demonstrated.
3. Shared records stay consistent across modules.
4. Main create/edit/review/approve actions work using mock data.
5. Core calculations are deterministic and tested.
6. The dashboard reflects the mock data and its changes.
7. Search, filters and validation work.
8. Empty, error and success states are implemented.
9. The app can be reset to a known demo state.
10. The project builds successfully for production.
11. The existing theme is preserved.
12. No required route is blank or broken.
13. No obvious console errors remain in the tested flows.
14. Deployment instructions use the actual project scripts.
15. Known assumptions and simulated integrations are documented.

## 16. Agent Execution Strategy

Implement the project incrementally using the approved step-by-step prompts.

At the beginning of each phase:

- Inspect the current implementation.
- Identify reusable components.
- Confirm the scope of the phase.
- Avoid rewriting completed modules unnecessarily.

At the end of each phase:

- Run the relevant type checks, lint checks and tests.
- Run the application and verify the new workflows.
- Fix regressions before continuing.
- Report files created or changed.
- List completed functionality, assumptions and outstanding issues.

Do not attempt a large, uncontrolled rewrite after every prompt.

Preserve working code and progressively extend the same application.

The final objective is a polished, coherent, client-demo-ready CLMS web application with three connected user-facing experiences, deterministic mock data, working business workflows and a successful production build.