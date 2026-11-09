import type { ReactNode } from 'react'
import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'

export type NivelAviso = 'info' | 'atencao' | 'bloqueio'

// Aviso padrão (SPEC-4-005): três níveis com cor e ícone do tema. `topo` marca o aviso do alto da tela
// (no máximo um por tela); os outros ficam perto do campo ou do botão que afetam.
const ESTILO: Record<NivelAviso, { classe: string; Icone: LucideIcon; papel: 'status' | 'alert' }> =
  {
    info: { classe: 'border-info/30 bg-info/10 text-info', Icone: Info, papel: 'status' },
    atencao: {
      classe: 'border-warning/30 bg-warning/10 text-warning',
      Icone: TriangleAlert,
      papel: 'status',
    },
    bloqueio: {
      classe: 'border-destructive/30 bg-destructive/10 text-destructive',
      Icone: OctagonX,
      papel: 'alert',
    },
  }

export default function Aviso({
  nivel = 'info',
  topo = false,
  children,
}: {
  nivel?: NivelAviso
  topo?: boolean
  children: ReactNode
}) {
  const { classe, Icone, papel } = ESTILO[nivel]
  return (
    <Alert role={papel} className={`${topo ? 'mb-6' : 'mb-4'} flex items-start gap-2 ${classe}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="text-sm">{children}</div>
    </Alert>
  )
}
