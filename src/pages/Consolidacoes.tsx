import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { linhasConsolidacao, type EstadoParaFila } from '@/lib/pcp/conferencia-servidor'
import { lerEstadoProducao } from '@/services/pcp-producao'

// Consolidações: só leitura (SPEC-4-001). Mostra a ordem, as conferências de expedição e de câmara, a
// aprovação e o estado da ordem preparada, lidos do servidor. Não há botão de envio: o envio ao Omie é a
// tela "Envio ao Omie". A tela relê a cada 30 segundos e quando volta a ter foco.
const Consolidacoes = () => {
  const [estado, setEstado] = useState<EstadoParaFila | null>(null)
  const [erroCarga, setErroCarga] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const e = await lerEstadoProducao()
      setEstado(e as unknown as EstadoParaFila | null)
      setErroCarga(e === null)
    } catch {
      setErroCarga(true)
    }
  }, [])

  useEffect(() => {
    carregar()
    const timer = window.setInterval(carregar, 30000)
    const aoFocar = () => carregar()
    window.addEventListener('focus', aoFocar)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', aoFocar)
    }
  }, [carregar])

  const linhas = useMemo(() => (estado ? linhasConsolidacao(estado) : []), [estado])

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Consolidações</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cada ordem programada com as conferências de expedição e de câmara, a aprovação do PCP e o
        estado da ordem de conclusão preparada. Só leitura: a aprovação é feita em Conferências e o
        envio ao Omie, em Envio ao Omie.
      </p>

      {erroCarga && (
        <div
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          Não foi possível carregar.{' '}
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!erroCarga && estado && linhas.length === 0 && (
        <div
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Ainda não há programação publicada.
        </div>
      )}

      <div className="space-y-3">
        {linhas.map((l) => (
          <Card key={l.op_id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>
                  {l.op_id} · {l.produto}
                </span>
                <Badge
                  variant="outline"
                  className={
                    l.ordem?.estado === 'confirmada'
                      ? 'border-green-300 text-green-900'
                      : l.ordem
                        ? 'border-amber-300 text-amber-900'
                        : 'border-slate-300 text-slate-700'
                  }
                >
                  {l.situacao}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                Expedição: <strong>{l.expedicao === null ? 'ausente' : `${l.expedicao} UN`}</strong>{' '}
                · Câmara: <strong>{l.camara === null ? 'ausente' : `${l.camara} UN`}</strong>
              </p>
              {l.aprovacao && (
                <p>
                  Aprovação ({l.aprovacao.estado}):{' '}
                  <strong>{l.aprovacao.quantidade_final} UN</strong> por {l.aprovacao.aprovador} —{' '}
                  {l.aprovacao.motivo}
                </p>
              )}
              {l.ordem && (
                <p>
                  Ordem de conclusão: <strong>{l.ordem.estado}</strong> ({l.ordem.quantidade} UN)
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Consolidacoes
