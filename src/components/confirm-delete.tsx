import { Trans } from '@lingui/react/macro'
import { Trash2 } from 'lucide-react'
import { type ReactElement, type ReactNode, useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

// Every destructive action goes through this: says exactly what will be lost, cancel is the default focus
export function ConfirmDelete({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactElement
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus disabled={busy}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <Button onClick={confirm} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
