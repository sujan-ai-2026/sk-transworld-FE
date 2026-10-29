import {
  useEffect,
  useRef,
} from 'react'
import './ConfirmationModal.css'

import type { ConfirmationOptions } from './confirmationTypes.js'

export interface ConfirmationModalProps extends ConfirmationOptions {
  isOpen?: boolean
  loading?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationModal({
  isOpen = true,
  loading = false,
  error = '',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  warningIcon = false,
  details,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) cancelButtonRef.current?.focus()
  }, [isOpen])

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !loading) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )]
    if (!focusable.length) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="confirmation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel()
      }}
    >
      <section
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        aria-modal="true"
        className={`confirmation-dialog confirmation-dialog--${variant}`}
        onKeyDown={handleKeyDown}
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="confirmation-heading">
          {warningIcon && (
            <span className="confirmation-warning-icon" aria-hidden="true">!</span>
          )}
          <div>
            <h2 id="confirmation-title">{title}</h2>
            <p id="confirmation-message">{message}</p>
          </div>
        </div>
        {details && <p className="confirmation-details">{details}</p>}
        {error && <p className="confirmation-error" role="alert">{error}</p>}
        <div className="confirmation-actions">
          <button
            className="confirmation-cancel"
            disabled={loading}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`confirmation-submit confirmation-submit--${variant}`}
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading && <span className="confirmation-spinner" aria-hidden="true" />}
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
