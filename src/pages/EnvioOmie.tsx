import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import {
  autorizarOp,
  conferirOp,
  desautorizarOp,
  enviarOp,
  obterFilaOp,
  type ItemFilaOp,
  type RespostaFilaOp,
} from '@/services/pcp-omie-op'
import { Skeleton } from '@/components/ui/skeleton'
import Aviso from '@/components/Aviso'

const ROTULO_ESTADO: Record<string, string> = {
  preparada: 'Aguarda autorização do dono',
  autorizada: 'Autorizada: pronta para enviar',
  enviando: 'Enviando',
  confirmada: 'Enviada e confirmada',
  resultado_incerto: 'Resultado incerto: só consulta, nada é reenviado',
  falhou_sem_efeito: 'O Omie recusou: nada foi gravado',
  bloqueada: 'Bloqueada',
}

const ROTULO_CONFERENCIA: Record<string, string> = {
  gravado_e_conferido: 'Gravado e conferido',
  conferido_sem_estoque: 'Ordem conferida; estoque ainda não comparado',
  divergente: 'Divergente: nenhuma nova gravação',
  inconclusivo: 'Inconclusivo: nenhuma nova gravação',
}

const EnvioOmie = () => {
  const [dados, setDados] = useState<RespostaFilaOp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(() => {
    obterFilaOp()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar a fila agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agir = async (item: ItemFilaOp, nome: string, fn: () => Promise<any>) => {
    setOcupado(item.transacao_id)
    setAviso(null)
    try {
      await fn()
      setAviso(nome + ': feito.')
    } catch (e: any) {
      setAviso(nome + ': ' + mensagemDeErro(e))
    } finally {
      setOcupado(null)
      carregar()
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Envio da produção ao Omie</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        O dono autoriza uma ordem de cada vez, vendo exatamente o que será gravado.
      </p>
      <ComoFunciona>
        <p>
          Sem autorização, nada é gravado no Omie. Depois do envio, o sistema só lê o Omie para
          conferir.
        </p>
      </ComoFunciona>

      {erro && (
        <Aviso nivel="bloqueio" topo>
          {erro}
        </Aviso>
      )}
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}

      {dados && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Envio ao Omie:</span>
          {dados.chave.ligada ? (
            <Badge className="bg-warning/10 text-warning border-warning/30">
              ligado para uma ordem autorizada
            </Badge>
          ) : (
            <Badge variant="outline">desligado</Badge>
          )}
        </div>
      )}

      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}

      {dados && dados.itens.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">
            Nenhuma ordem pronta para autorizar. As ordens aparecem aqui depois que o PCP conferir e
            aprovar a produção com dados reais.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {dados?.itens.map((i) => (
          <Card key={i.transacao_id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>Ordem {i.ordem || i.op_id}</span>
                <Badge variant="outline">{ROTULO_ESTADO[i.estado] ?? rotuloEstado(i.estado)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-muted-foreground">Produto</dt>
                  <dd>{i.produto}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Quantidade</dt>
                  <dd>
                    {i.quantidade} {i.unidade}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Data de conclusão</dt>
                  <dd>{i.data}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Local de estoque</dt>
                  <dd>{i.local}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                {textoSeguro(i.efeito_no_estoque, '')}
              </p>
              {i.autorizada_por && (
                <p className="text-xs">
                  Autorizada por {i.autorizada_por}
                  {i.autorizada_em
                    ? ' em ' + new Date(i.autorizada_em).toLocaleString('pt-BR')
                    : ''}
                  .
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {i.estado === 'preparada' && dados.pode_autorizar && (
                  <Button
                    size="sm"
                    disabled={
                      ocupado === i.transacao_id ||
                      (dados.chave.ligada && dados.chave.escopo !== i.transacao_id)
                    }
                    onClick={() => agir(i, 'Autorizar', () => autorizarOp(i.transacao_id, i.hash))}
                  >
                    Autorizar esta ordem
                  </Button>
                )}
                {i.estado === 'autorizada' && dados.pode_autorizar && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado === i.transacao_id}
                    onClick={() =>
                      agir(i, 'Desfazer autorização', () => desautorizarOp(i.transacao_id))
                    }
                  >
                    Desfazer autorização
                  </Button>
                )}
                {i.estado === 'autorizada' && dados.pode_enviar && (
                  <Button
                    size="sm"
                    disabled={ocupado === i.transacao_id}
                    onClick={() => agir(i, 'Enviar ao Omie', () => enviarOp(i.transacao_id))}
                  >
                    Enviar ao Omie
                  </Button>
                )}
                {(i.estado === 'confirmada' || i.estado === 'resultado_incerto') && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado === i.transacao_id}
                    onClick={() => agir(i, 'Conferir no Omie', () => conferirOp(i.transacao_id))}
                  >
                    Conferir no Omie
                  </Button>
                )}
              </div>
              {i.conferencia && (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    i.conferencia.resultado === 'divergente'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'bg-muted'
                  }`}
                  role="status"
                >
                  <p className="font-medium">
                    {ROTULO_CONFERENCIA[i.conferencia.resultado] ??
                      rotuloEstado(i.conferencia.resultado)}
                  </p>
                  <ul className="mt-1 list-disc list-inside">
                    {i.conferencia.detalhes.map((d, k) => (
                      <li key={k}>{textoSeguro(d, 'Há uma diferença para conferir.')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default EnvioOmie
