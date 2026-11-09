import {
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  FlaskConical,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { grupoDoEstado, rotuloEstado, type GrupoSelo } from '@/lib/pcp/textos'

// Selo de estado (SPEC-4-005): cor e ícone pelo grupo do estado, rótulo do textos.ts. Só tokens do tema.
const ESTILO: Record<GrupoSelo, { classe: string; Icone: LucideIcon }> = {
  verde: { classe: 'border-success/30 bg-success/10 text-success', Icone: CircleCheck },
  amarelo: { classe: 'border-warning/30 bg-warning/10 text-warning', Icone: Clock },
  vermelho: { classe: 'border-destructive/30 bg-destructive/10 text-destructive', Icone: CircleX },
  azul: { classe: 'border-info/30 bg-info/10 text-info', Icone: Send },
  demonstracao: { classe: 'border-border bg-muted text-muted-foreground', Icone: FlaskConical },
  neutro: { classe: 'border-border bg-muted text-muted-foreground', Icone: Circle },
}

export default function Selo({ estado, rotulo }: { estado: string; rotulo?: string }) {
  const { classe, Icone } = ESTILO[grupoDoEstado(estado)]
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${classe}`}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {rotulo ?? rotuloEstado(estado)}
    </Badge>
  )
}
