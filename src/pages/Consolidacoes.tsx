import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { linhasConsolidacao, type EstadoParaFila } from '@/lib/pcp/conferencia-servidor'
import { lerEstadoProducao } from '@/services/pcp-producao'
import ComoFunciona from '@/components/ComoFunciona'
import { rotuloEstado, semInformacao, textoSeguro } from '@/lib/pcp/textos'
import Aviso from '@/components/Aviso'

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
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Cada ordem programada com as conferências, a aprovação do PCP e a ordem de conclusão. Só
        leitura.
      </p>
      <ComoFunciona>
        <p>
          A tela junta as conferências de expedição e de câmara, a aprovação do PCP e o estado da
          ordem de conclusão preparada.
        </p>
        <p>A aprovação é feita em Conferências e o envio ao Omie, em Envio da produção ao Omie.</p>
      </ComoFunciona>

      {erroCarga && (
        <Aviso nivel="bloqueio" topo>
          Não foi possível carregar.{' '}
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </Aviso>
      )}

      {!erroCarga && estado && linhas.length === 0 && (
        <Aviso nivel="atencao">Ainda não há programação publicada.</Aviso>
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
                      ? 'border-success/30 text-success'
                      : l.ordem
                        ? 'border-warning/30 text-warning'
                        : 'border-slate-300 text-slate-700'
                  }
                >
                  {textoSeguro(l.situacao, 'Em acompanhamento')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                Expedição:{' '}
                <strong>{l.expedicao === null ? semInformacao() : `${l.expedicao} UN`}</strong> ·
                Câmara: <strong>{l.camara === null ? semInformacao() : `${l.camara} UN`}</strong>
              </p>
              {l.aprovacao && (
                <p>
                  Aprovação ({rotuloEstado(l.aprovacao.estado)}):{' '}
                  <strong>{l.aprovacao.quantidade_final} UN</strong> por {l.aprovacao.aprovador} —{' '}
                  {l.aprovacao.motivo}
                </p>
              )}
              {l.ordem && (
                <p>
                  Ordem de conclusão: <strong>{rotuloEstado(l.ordem.estado)}</strong> (
                  {l.ordem.quantidade} UN)
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
