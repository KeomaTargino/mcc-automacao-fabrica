import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Confirmação antes de uma ação que não se desfaz com um clique (SPEC-4-005): mostra o resumo do que vai
// acontecer. Quem pode e o que é conferido continuam sendo decididos pelo servidor.
export default function Confirmar({
  titulo,
  resumo,
  rotuloBotao = 'Confirmar',
  onConfirmar,
  children,
}: {
  titulo: string
  resumo: ReactNode
  rotuloBotao?: string
  onConfirmar: () => void
  children: ReactNode
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{resumo}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>{rotuloBotao}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
