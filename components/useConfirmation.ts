import { useContext } from 'react'
import { ConfirmationContext } from './confirmationTypes.js'

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext)
  if (!confirm) throw new Error('useConfirmation must be used within ConfirmationProvider.')
  return confirm
}
