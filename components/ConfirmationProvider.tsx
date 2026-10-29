import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ConfirmationContext, type ConfirmAction, type ConfirmationRequest } from './confirmationTypes.js'
import { ConfirmationModal } from './ConfirmationModal.js'

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeRequestRef = useRef<ConfirmationRequest | null>(null)
  const actionRunningRef = useRef(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const finish = useCallback((confirmed: boolean) => {
    const active = activeRequestRef.current
    activeRequestRef.current = null
    actionRunningRef.current = false
    setRequest(null)
    setLoading(false)
    setError('')
    active?.resolve(confirmed)
    requestAnimationFrame(() => previousFocusRef.current?.focus())
  }, [])

  const confirm = useCallback<ConfirmAction>((options, action) => {
    if (activeRequestRef.current) return Promise.resolve(false)

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    return new Promise<boolean>((resolve) => {
      const next: ConfirmationRequest = { ...options, action, resolve }
      activeRequestRef.current = next
      setError('')
      setRequest(next)
    })
  }, [])

  async function handleConfirm() {
    if (!request || actionRunningRef.current) return
    actionRunningRef.current = true
    setLoading(true)
    setError('')
    try {
      await request.action()
      finish(true)
    } catch (actionError) {
      actionRunningRef.current = false
      setLoading(false)
      setError(actionError instanceof Error ? actionError.message : 'The action could not be completed. Please try again.')
    }
  }

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmationModal
          {...request}
          error={error}
          loading={loading}
          onCancel={() => finish(false)}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </ConfirmationContext.Provider>
  )
}
