import { ConfirmationProvider } from '../components/ConfirmationProvider.tsx'
import { ToastProvider } from './components/ToastProvider.tsx'
import { usePathname } from './app/router.ts'
import { DriverApp } from './features/driver/DriverApp.tsx'
import { DriverPreview } from './features/driver/DriverPreview.tsx'
import { CustomerPortal } from './features/customer/CustomerPortal.tsx'
import { LogisticsPortal } from './features/portal/LogisticsPortal.tsx'
import { AppProvider } from './state/AppContext.tsx'
import './App.css'

function App() {
  const { pathname, search, navigate } = usePathname()
  const searchParams = new URLSearchParams(search)
  const selectedJobId = searchParams.get('jobId') ?? undefined
  const selectedTripId = searchParams.get('tripId') ?? undefined
  const content = pathname === '/customer'
    ? <CustomerPortal navigate={navigate} />
    : pathname === '/driver'
      ? <DriverPreview><DriverApp navigate={navigate} /></DriverPreview>
      : <LogisticsPortal navigate={navigate} pathname={pathname.startsWith('/app/') ? pathname : '/app/dashboard'} selectedJobId={selectedJobId} selectedTripId={selectedTripId} />

  return <AppProvider><ConfirmationProvider><ToastProvider>{content}</ToastProvider></ConfirmationProvider></AppProvider>
}

export default App
