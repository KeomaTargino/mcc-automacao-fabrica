import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ComoFunciona from '@/components/ComoFunciona'
import { textoSeguro } from '@/lib/pcp/textos'
import {
  produtosDemonstracao,
  eventosDemonstracao,
  producaoLiquida,
  HORIZONTE_DEMO,
  rotuloBloqueio,
} from '@/lib/pcp/qualidade'
import { ROTULO_ORIGEM } from '@/lib/pcp/faltantes'
import { obterFaltantes, type RespostaFaltantes } from '@/services/pcp-faltantes'

const COR_BLOQUEIO: Record<string, string> = {
  calculo_estoque: 'bg-amber-100 text-amber-900 border-amber-300',
  calculo_receita: 'bg-orange-100 text-orange-900 border-orange-300',
  calculo_sugestao: 'bg-red-100 text-red-900 border-red-300',
}

const ROTULO_BLOQUEIO_CURTO: Record<string, string> = {
  calculo_estoque: 'Estoque bloqueado',
  calculo_receita: 'Receita bloqueada',
  calculo_sugestao: 'Sugestões bloqueadas',
}

const MOTIVO_INCOMPLETO: Record<string, string> = {
  catalogo_sem_lote_ativo: 'O catálogo do Omie ainda não foi lido.',
  estoque_sem_lote_ativo: 'O estoque do Omie ainda não foi lido.',
  catalogo_nao_lido_por_inteiro:
    'O catálogo ainda não foi lido por inteiro. Até lá a lista fica vazia, para não acusar produto que só não foi lido.',
}

const FaltantesOmie = () => {
  const [dados, setDados] = useState<RespostaFaltantes | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    obterFaltantes()
      .then((r) => ativo && setDados(r))
      .catch(
        () =>
          ativo && setErro('Não foi possível carregar a lista agora. Tente de novo em instantes.'),
      )
    return () => {
      ativo = false
    }
  }, [])

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">O que falta cadastrar no Omie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {erro && (
          <div
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-900"
            role="alert"
          >
            {erro}
          </div>
        )}
        {!erro && !dados && <p className="text-muted-foreground">Carregando a lista…</p>}
        {dados && dados.situacao === 'catalogo_incompleto' && (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"
            role="status"
          >
            {MOTIVO_INCOMPLETO[dados.motivo ?? ''] ?? 'A lista ainda não pode ser montada.'}
          </div>
        )}
        {dados && dados.situacao === 'ok' && dados.itens.length === 0 && (
          <p>Nenhum produto do estoque está fora do cadastro do Omie.</p>
        )}
        {dados && dados.situacao === 'ok' && dados.itens.length > 0 && (
          <>
            <p className="text-muted-foreground">
              {dados.itens.length} produto(s) aparecem no sistema mas não estão no cadastro do Omie.
              Cadastre no Omie; na próxima leitura o produto sai desta lista.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Código</th>
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2">Onde aparece</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map((i) => (
                    <tr key={i.codigo} className="border-b align-top">
                      <td className="py-2 pr-3 font-mono">{i.codigo}</td>
                      <td className="py-2 pr-3">{i.descricao ?? '—'}</td>
                      <td className="py-2">
                        {i.onde
                          .map((o) => `${ROTULO_ORIGEM[o.origem]} (${o.referencia})`)
                          .join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {dados && dados.fontes_sem_leitura.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Ainda não entram nesta lista:{' '}
            {dados.fontes_sem_leitura.map((o) => ROTULO_ORIGEM[o]).join(' e ')}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const Qualidade = () => {
  const produtos = useMemo(() => produtosDemonstracao(), [])
  const mapa = useMemo(() => producaoLiquida(eventosDemonstracao(), HORIZONTE_DEMO), [])
  const cookie = mapa.find((x) => x.produto_id === 'COOKIE-1')

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Qualidade dos dados</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        O que cada cálculo pode usar hoje e o que está bloqueado por falta de dado oficial.
      </p>
      <ComoFunciona>
        <p>
          Nada é presumido: dado desconhecido aparece como “desconhecido”. Um cálculo fica bloqueado
          quando falta a unidade oficial, a ficha técnica ou histórico suficiente.
        </p>
      </ComoFunciona>

      <FaltantesOmie />

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Dados de demonstração.</strong> Os produtos abaixo são exemplos e não existem no
        cadastro. Com o cadastro completo, esta visão mostra os dados oficiais.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {produtos.map((p) => (
          <Card key={p.produto_id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>
                  {p.descricao} <span className="font-mono text-xs">({p.codigo})</span>
                </span>
                {p.bloqueios.length === 0 ? (
                  <Badge className="bg-green-100 text-green-900 border-green-300">
                    Pronto para calcular
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 text-amber-900">
                    {p.bloqueios.length} bloqueio(s)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Unidade oficial:</span>{' '}
                  {p.unidade_oficial ? (
                    <strong>{p.unidade_oficial}</strong>
                  ) : (
                    <span className="text-amber-700 font-medium">desconhecida</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Ficha técnica:</span>{' '}
                  {p.ficha ? (
                    <span>
                      {p.ficha.componentes.length} componente(s)
                      <span className="block text-xs text-muted-foreground">
                        {p.ficha.componentes
                          .map((c) => `${c.insumo} ${c.quantidade} ${c.unidade}`)
                          .join(', ')}
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium">sem informação</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Cobertura do histórico:</span>{' '}
                  {p.cobertura_dias !== null
                    ? `${p.cobertura_dias} de ${p.cobertura_esperada} dias`
                    : 'desconhecida'}
                </div>
              </div>

              {p.bloqueios.length > 0 && (
                <div className="space-y-1 pt-1">
                  {p.bloqueios.map((b) => (
                    <div
                      key={b}
                      className={`rounded-md border px-3 py-2 text-xs ${COR_BLOQUEIO[b]}`}
                      role="alert"
                    >
                      <strong>{ROTULO_BLOQUEIO_CURTO[b]}:</strong>{' '}
                      {textoSeguro(rotuloBloqueio(b), 'Falta um dado oficial.')}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {cookie && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Mapa de produção líquida (demonstração) — {cookie.produto_id}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Histórico de {HORIZONTE_DEMO.inicio} a {HORIZONTE_DEMO.fim} (90 dias):{' '}
              <strong>{cookie.liquido} UN líquidas</strong> = {cookie.concluidas} concluídas −{' '}
              {cookie.canceladas} canceladas + {cookie.devolucoes} devoluções vinculadas.
            </p>
            <p className="text-xs text-muted-foreground">
              Cada evento entra uma única vez (repetição não duplica); eventos fora do horizonte são
              excluídos ({cookie.eventos_fora_do_horizonte} nesta demonstração).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Qualidade
