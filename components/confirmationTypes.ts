import { createContext } from 'react'

export type ConfirmationVariant = 'primary' | 'destructive' | 'warning'

export interface ConfirmationOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmationVariant
  warningIcon?: boolean
  details?: string
}

export interface ConfirmationRequest extends ConfirmationOptions {
  action: () => void | Promise<void>
  resolve: (confirmed: boolean) => void
}

export type ConfirmAction = (
  options: ConfirmationOptions,
  action: () => void | Promise<void>,
) => Promise<boolean>

export const ConfirmationContext = createContext<ConfirmAction | null>(null)
