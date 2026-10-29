export type PortalKind = 'logistics' | 'customer' | 'driver'

export interface NavigationItem {
  label: string
  path: string
  group: string
  description: string
}

export const logisticsNavigation: NavigationItem[] = [
  { label: 'Dashboard', path: '/app/dashboard', group: 'Overview', description: 'Operations and financial snapshot' },
  { label: 'Customers', path: '/app/customers', group: 'Master data', description: 'Customer profiles and billing details' },
  { label: 'Suppliers', path: '/app/suppliers', group: 'Master data', description: 'Supplier services and rate references' },
  { label: 'Quotations & Rates', path: '/app/quotations', group: 'Commercial', description: 'Quotes, tariffs and approvals' },
  { label: 'Jobs & Dockets', path: '/app/jobs', group: 'Operations', description: 'Central job lifecycle and activity' },
  { label: 'Freight Forwarding', path: '/app/forwarding', group: 'Operations', description: 'Bookings, vessels and shipments' },
  { label: 'Customs Clearance', path: '/app/customs', group: 'Operations', description: 'Declarations, EDO and release' },
  { label: 'Container Tracking', path: '/app/containers', group: 'Operations', description: 'Container events and free days' },
  { label: 'Haulage & Trips', path: '/app/haulage', group: 'Operations', description: 'Trips, trucks and drivers' },
  { label: 'Warehouse & Inventory', path: '/app/warehouse', group: 'Operations', description: 'Storage, receiving and dispatch' },
  { label: 'Documents', path: '/app/documents', group: 'Operations', description: 'Digital job folders' },
  { label: 'Billing & Invoices', path: '/app/billing', group: 'Finance', description: 'Charges, invoices and e-invoicing' },
  { label: 'Expenses', path: '/app/expenses', group: 'Finance', description: 'Supplier invoices and reimbursements' },
  { label: 'Payment Vouchers', path: '/app/vouchers', group: 'Finance', description: 'Voucher approvals and posting' },
  { label: 'Bank Reconciliation', path: '/app/reconciliation', group: 'Finance', description: 'Statement matching' },
  { label: 'Job Costing', path: '/app/job-costing', group: 'Finance', description: 'Revenue, costs and gross profit' },
  { label: 'Financial Statements', path: '/app/financial-statements', group: 'Finance', description: 'Demo P&L and balance sheet' },
  { label: 'Reports', path: '/app/reports', group: 'Insights', description: 'Operational and management reports' },
  { label: 'Alerts & Follow-ups', path: '/app/alerts', group: 'Insights', description: 'Exceptions requiring attention' },
  { label: 'Assumptions Register', path: '/app/assumptions', group: 'Administration', description: 'Demo controls and assumptions' },
]

export const portalLinks = [
  { label: 'Customer Portal', path: '/customer' },
  { label: 'Driver App', path: '/driver' },
]

export function getNavigationItem(pathname: string) {
  return logisticsNavigation.find((item) => item.path === pathname) ?? logisticsNavigation[0]
}
