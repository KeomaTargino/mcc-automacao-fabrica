import { Button } from '@/components/ui/button'

export const TAMANHO_PAGINA = 50

// Paginação de 50 em 50 linhas (SPEC-4-005): só aparece quando há mais de uma página.
export const fatiar = <T,>(lista: T[], pagina: number): T[] =>
  lista.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA)

export default function Paginacao({
  total,
  pagina,
  onPagina,
}: {
  total: number
  pagina: number
  onPagina: (p: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA))
  if (paginas <= 1) return null
  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={pagina <= 1}
        onClick={() => onPagina(pagina - 1)}
      >
        Anterior
      </Button>
      <span className="text-muted-foreground">
        Página {pagina} de {paginas} · {total} linhas
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={pagina >= paginas}
        onClick={() => onPagina(pagina + 1)}
      >
        Próxima
      </Button>
    </div>
  )
}
