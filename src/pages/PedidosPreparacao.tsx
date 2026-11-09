import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  contarVolumes,
  decidirDuplicata,
  definirFrete,
  liberarPedido,
  obterPedidosPreparacao,
  type PedidoPreparacao,
  type RespostaPedidosPreparacao,
} from '@/services/pcp-faturamento'
import { Skeleton } from '@/components/ui/skeleton'
import Escolha from '@/components/Escolha'

const moeda = (n: number | null) =>
  n === null ? 'pendente' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ORIGEM: Record<string, string> = {
  omie: 'Omie direto',
  lunet_pelo_omie: 'Lunet pelo Omie',
  nuvemshop: 'Nuvemshop',
  manual: 'Manual',
  a_confirmar: 'Origem a confirmar',
}

const MODALIDADES: [string, string][] = [
  ['CIF', 'CIF (frete por conta do remetente)'],
  ['FOB', 'FOB (frete por conta do destinatário)'],
  ['TERCEIROS', 'Por conta de terceiros'],
  ['PROPRIO_REMETENTE', 'Transporte próprio do remetente'],
  ['PROPRIO_DESTINATARIO', 'Transporte próprio do destinatário'],
  ['SEM_FRETE', 'Sem frete'],
]

const msgErro = (e: any) =>
  e?.status === 403 || e?.status === 409
    ? mensagemDeErro(e)
    : textoSeguro(e?.response?.motivos?.join(' '), 'Não foi possível concluir agora.')

// Linha do que lançar no Omie, em palavras: sem estrutura de dados na tela.
const linhaLegivel = (x: any): string =>
  typeof x === 'object' && x !== null
    ? Object.entries(x)
        .map(
          ([k, v]) => `${String(k).replace(/_/g, ' ')}: ${typeof v === 'object' ? '…' : String(v)}`,
        )
        .join(' · ')
    : String(x)

const Linha = ({
  p,
  pode,
  recarregar,
  aviso,
}: {
  p: PedidoPreparacao
  pode: NonNullable<RespostaPedidosPreparacao['pode']>
  recarregar: () => void
  aviso: (m: string) => void
}) => {
  const [modalidade, setModalidade] = useState(p.frete?.modalidade ?? '')
  const [volumes, setVolumes] = useState(p.volumes ? String(p.volumes.quantidade) : '')
  const [motivoDup, setMotivoDup] = useState('')
  const rodar = (f: () => Promise<any>) =>
    f()
      .then(() => recarregar())
      .catch((e) => {
        aviso(msgErro(e))
        recarregar()
      })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <span className="font-mono">Pedido {p.pedido_id}</span>
          <Badge variant="outline">{ORIGEM[p.origem] ?? p.origem}</Badge>
          {p.manual && <Badge variant="outline">manual</Badge>}
          {p.situacao_canal === 'intencao' && <Badge variant="outline">intenção (não pago)</Badge>}
          {p.estado === 'liberado' && <Badge>liberado para faturar</Badge>}
          {p.estado === 'apto' && <Badge>apto</Badge>}
          {p.estado === 'bloqueado' && (
            <Badge className="bg-warning/10 text-warning border-warning/30">bloqueado</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div>
          {p.unidade ? `${p.unidade} — ${p.nome_fantasia_operacional}` : 'Unidade não cadastrada'}
          {p.manual && p.motivo_manual ? ` · motivo do pedido manual: ${p.motivo_manual}` : ''}
        </div>
        {p.motivos_fila.map((m) => (
          <div key={m} className="text-xs text-warning">
            {textoSeguro(m, 'Este pedido precisa de revisão.')}
          </div>
        ))}
        {p.itens.map((i) => (
          <div key={i.item} className="flex flex-wrap gap-2">
            <span className="font-mono">{i.item}</span>
            <span>
              {i.quantidade} × pedido {moeda(i.preco_pedido)} / tabela {moeda(i.preco_tabela)}
            </span>
            {i.diferente_da_tabela && (
              <Badge variant="outline" className="border-destructive/30 text-destructive">
                preço diferente da tabela
              </Badge>
            )}
          </div>
        ))}
        <div>
          Subtotal recalculado: <strong>{moeda(p.subtotal_recalculado)}</strong> · subtotal do
          pedido: <strong>{moeda(p.subtotal_pedido)}</strong>
          {p.diferenca !== null && p.diferenca !== 0 && (
            <span className="text-destructive"> · diferença de {moeda(p.diferenca)}</span>
          )}
          {p.subtotal_pendente.length > 0 && (
            <span className="text-warning">
              {' '}
              · sem preço na tabela: {p.subtotal_pendente.join(', ')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" htmlFor={`fr-${p.pedido_id}`}>
            Frete
          </label>
          <Escolha
            id={`fr-${p.pedido_id}`}
            className="w-64"
            value={modalidade}
            disabled={!pode.preparar}
            onChange={setModalidade}
            placeholder="escolha a modalidade"
            opcoes={MODALIDADES.map(([v, r]) => ({ valor: v, rotulo: r }))}
          />
          {pode.preparar && (
            <Button
              size="sm"
              variant="outline"
              disabled={!modalidade}
              onClick={() =>
                rodar(() =>
                  definirFrete({
                    pedido_id: p.pedido_id,
                    modalidade,
                    versao_esperada: p.versao_prep,
                  }),
                )
              }
            >
              Salvar frete
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" htmlFor={`vol-${p.pedido_id}`}>
            Volumes contados
          </label>
          <input
            id={`vol-${p.pedido_id}`}
            className="border rounded px-2 py-1 text-sm w-24 bg-background"
            inputMode="numeric"
            value={volumes}
            disabled={!pode.conferir_volumes}
            onChange={(e) => setVolumes(e.target.value.replace(/\D/g, ''))}
          />
          {pode.conferir_volumes && (
            <Button
              size="sm"
              variant="outline"
              disabled={!volumes}
              onClick={() =>
                rodar(() =>
                  contarVolumes({
                    pedido_id: p.pedido_id,
                    quantidade: Number(volumes),
                    versao_esperada: p.versao_prep,
                  }),
                )
              }
            >
              Registrar volumes
            </Button>
          )}
          {p.volumes && (
            <span className="text-xs text-muted-foreground">
              conferido por {p.volumes.por} em {new Date(p.volumes.em).toLocaleString('pt-BR')}
            </span>
          )}
        </div>
        {p.duplicata.situacao === 'possivel' && !p.decisao_duplicata && pode.preparar && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Motivo da decisão"
              className="border rounded px-2 py-1 text-sm w-64 bg-background"
              placeholder="motivo da decisão"
              value={motivoDup}
              onChange={(e) => setMotivoDup(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                rodar(() =>
                  decidirDuplicata({
                    pedido_id: p.pedido_id,
                    decisao: 'nao_e_duplicata',
                    motivo: motivoDup,
                  }),
                )
              }
            >
              Não é duplicata
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                rodar(() =>
                  decidirDuplicata({
                    pedido_id: p.pedido_id,
                    decisao: 'e_duplicata',
                    motivo: motivoDup,
                  }),
                )
              }
            >
              É duplicata
            </Button>
          </div>
        )}
        {p.estado === 'apto' && pode.liberar && p.hash_visto && (
          <Button
            size="sm"
            onClick={() =>
              rodar(() =>
                liberarPedido({
                  pedido_id: p.pedido_id,
                  hash_visto: p.hash_visto as string,
                  versao_esperada: p.versao_prep,
                }),
              )
            }
          >
            Liberar para faturar
          </Button>
        )}
        {p.liberacao && (
          <div className="text-xs text-muted-foreground">
            Liberado por {p.liberacao.por} em {new Date(p.liberacao.em).toLocaleString('pt-BR')}. A
            nota fiscal é emitida por uma pessoa no Omie.
          </div>
        )}
        {p.estado === 'liberado' && p.para_lancar.length > 0 && (
          <details className="text-xs">
            <summary>O que lançar no Omie (gravação desligada)</summary>
            <ul className="mt-1 list-disc list-inside">
              {p.para_lancar.map((x: any, k: number) => (
                <li key={k}>{linhaLegivel(x)}</li>
              ))}
            </ul>
          </details>
        )}
        {p.gravacoes.map((g) => (
          <div key={g.operacao} className="text-xs">
            Gravação ({String(g.operacao).replace(/_/g, ' ')}):{' '}
            {g.estado === 'gravado_e_conferido'
              ? 'gravado e conferido'
              : g.estado.replace(/_/g, ' ')}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const PedidosPreparacao = () => {
  const [dados, setDados] = useState<RespostaPedidosPreparacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(() => {
    obterPedidosPreparacao()
      .then(setDados)
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar os pedidos agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Preparação de pedidos</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Cada pedido com unidade, tabela, origem, frete e volumes, marcado como apto ou bloqueado.
      </p>
      <ComoFunciona>
        <p>O frete é escolhido pedido a pedido e os volumes são os contados pela expedição.</p>
        <p>
          Nada é alterado no Omie sem a chave ligada pelo dono; a nota fiscal continua sendo emitida
          por uma pessoa.
        </p>
      </ComoFunciona>
      {erro && (
        <div
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {erro}
        </div>
      )}
      {aviso && (
        <div
          className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          role="status"
        >
          {aviso}
        </div>
      )}
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}
      {dados && !dados.disponivel && (
        <Card>
          <CardContent className="py-6 text-sm">
            {textoSeguro(dados.motivo, 'Os pedidos ainda não estão disponíveis.')}
          </CardContent>
        </Card>
      )}
      {dados?.disponivel && dados.pode && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {dados.totais?.pedidos} pedidos · {dados.totais?.aptos} aptos ·{' '}
            {dados.totais?.bloqueados} bloqueados · {dados.totais?.duplicatas_a_revisar} possíveis
            duplicatas a revisar · {dados.totais?.sem_unidade} sem unidade ·{' '}
            {dados.totais?.nomes_a_revisar} nomes de canal a revisar.{' '}
            {dados.ultimo_sucesso
              ? `Última leitura: ${new Date(dados.ultimo_sucesso).toLocaleString('pt-BR')}.`
              : ''}
            {dados.omie_lote === false
              ? ' Pedidos do Omie ainda sem leitura ativa: só os manuais aparecem.'
              : ''}
          </p>
          <p className="mb-2 text-xs">
            Gravação no Omie:{' '}
            {dados.chave?.ligada
              ? 'autorizada pelo dono'
              : 'desligada (lançar à mão com os dados da tela)'}
            .
          </p>
          {dados.aviso && (
            <p className="mb-4 text-xs text-warning">{textoSeguro(dados.aviso, '')}</p>
          )}
          <div className="space-y-3">
            {dados.pedidos?.map((p) => (
              <Linha
                key={`${p.pedido_id}-${p.versao_prep}-${p.estado}`}
                p={p}
                pode={dados.pode!}
                recarregar={carregar}
                aviso={setAviso}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default PedidosPreparacao
