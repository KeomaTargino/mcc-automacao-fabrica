import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import {
  criarRequisicao,
  decidirCompra,
  enviarParaAprovacao,
  conferirPedidoCompra,
  escolherCotacao,
  lancarPedidoCompra,
  ligarPedidoCompra,
  obterRequisicoes,
  registrarCotacao,
  type RequisicaoCompra,
  type RespostaRequisicoes,
} from '@/services/pcp-compras'
import { Skeleton } from '@/components/ui/skeleton'
import Aviso from '@/components/Aviso'
import Confirmar from '@/components/Confirmar'
import { toast } from 'sonner'

const moeda = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ESTADOS: Record<string, string> = {
  rascunho: 'rascunho',
  em_cotacao: 'em cotação',
  em_aprovacao: 'em aprovação',
  aprovada: 'aprovada',
  recusada: 'recusada',
  cancelada: 'cancelada',
}

const textoDoErro = (e: any): string => {
  const d = e?.response ?? e?.data
  if (Array.isArray(d?.motivos))
    return textoSeguro(d.motivos.join('; '), 'Confira os campos destacados.')
  if (d?.erro === 'alcada_nao_cadastrada') return textoSeguro(d.motivo, 'Alçada não cadastrada.')
  if (d?.erro === 'acima_da_alcada')
    return `Valor acima da sua alçada${d.proxima_alcada ? '; precisa da alçada de ' + d.proxima_alcada : ''}.`
  if (d?.erro === 'sem_cotacao_escolhida')
    return 'Escolha uma cotação para cada item antes de enviar.'
  if (d?.erro === 'conflito_de_versao')
    return 'Outra alteração chegou antes; a tela foi recarregada.'
  if (d?.erro === 'catalogo_indisponivel' || d?.motivo)
    return textoSeguro(d.motivo, 'O catálogo do Omie não está disponível agora.')
  if (d?.erro === 'sem_motivo') return 'Informe o motivo da recusa.'
  if (d?.erro === 'escrita_desligada') return mensagemDeErro({ status: 423 })
  if (d?.erro === 'pedido_diferente')
    return (
      'Pedido diferente da compra: ' +
      textoSeguro((d.diferencas ?? []).join('; '), 'confira os itens')
    )
  if (d?.erro === 'pedido_nao_lido')
    return textoSeguro(d.motivo, 'O pedido ainda não foi lido no Omie.')
  if (d?.erro === 'compra_nao_aprovada')
    return 'Só compra aprovada e sem alteração depois da aprovação.'
  if (d?.erro === 'ja_ligada') return 'Esta compra já está ligada a um pedido.'
  if (d?.erro === 'pedido_ja_ligado') return 'Este pedido já está ligado a outra compra.'
  if (d?.erro === 'payload_invalido') return textoSeguro(d.motivo, 'Confira os campos destacados.')
  return e?.status
    ? mensagemDeErro(e)
    : 'Não foi possível concluir agora. Tente de novo em instantes.'
}

const Requisicoes = () => {
  const [dados, setDados] = useState<RespostaRequisicoes | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novo, setNovo] = useState({
    item: '',
    fornecedor: '',
    quantidade: '',
    apresentacao: '',
    unidadeCompra: '',
    data: '',
    emergencial: false,
    motivo: '',
  })
  const [cot, setCot] = useState<Record<string, { preco: string; prazo: string; cond: string }>>({})
  const [motivoRecusa, setMotivoRecusa] = useState<Record<string, string>>({})
  const [numeroPedido, setNumeroPedido] = useState<Record<string, string>>({})

  const carregar = useCallback(() => {
    obterRequisicoes()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar as requisições agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agir = async (fn: () => Promise<any>, ok: string) => {
    setAviso(null)
    try {
      await fn()
      setAviso(ok)
      toast.success(ok, { duration: 4000 })
    } catch (e: any) {
      setAviso(textoDoErro(e))
      toast.error(textoDoErro(e), { duration: Infinity, closeButton: true })
    }
    carregar()
  }

  const criar = () =>
    agir(async () => {
      const r = await criarRequisicao([
        {
          origem: 'manual|' + Date.now(),
          item: novo.item,
          fornecedor: novo.fornecedor,
          quantidade_estoque: Number(novo.quantidade),
          apresentacao: novo.apresentacao,
          unidade_compra: novo.unidadeCompra,
          data_necessaria: novo.data,
          emergencial: novo.emergencial,
          motivo_emergencia: novo.motivo,
        },
      ])
      if (r.bloqueados?.length) throw { response: { motivo: r.bloqueados[0].mensagem } }
    }, 'Requisição criada.')

  const porFornecedor = (dados?.requisicoes ?? []).reduce<Record<string, RequisicaoCompra[]>>(
    (acc, r) => {
      ;(acc[r.fornecedor] = acc[r.fornecedor] ?? []).push(r)
      return acc
    },
    {},
  )

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Requisições de compra</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        A sugestão não compra: a pessoa decide. Cada requisição é de um fornecedor.
      </p>
      <ComoFunciona>
        <p>
          Os itens recebem cotações, comparadas com o último preço do histórico. Só a compra
          aprovada por quem tem alçada segue para o pedido.
        </p>
        <p>Se algo mudar depois de aprovar, a aprovação cai.</p>
      </ComoFunciona>
      {erro && (
        <Aviso nivel="bloqueio" topo>
          {erro}
        </Aviso>
      )}
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}
      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}
      {dados && dados.alcadas_cadastradas === 0 && (
        <Aviso nivel="atencao">
          Alçada não cadastrada: a aprovação real fica parada até o dono informar as alçadas.
        </Aviso>
      )}
      {dados && dados.tolerancia_percentual === null && (
        <p className="mb-4 text-xs text-muted-foreground">
          Tolerância de preço ainda não cadastrada: a tela mostra a diferença sem julgar.
        </p>
      )}

      {dados?.pode_editar && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Nova requisição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="Código do item no Omie"
                value={novo.item}
                onChange={(e) => setNovo({ ...novo, item: e.target.value })}
              />
              <Input
                placeholder="Fornecedor (vazio = a definir)"
                value={novo.fornecedor}
                onChange={(e) => setNovo({ ...novo, fornecedor: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Quantidade (unidade de estoque)"
                value={novo.quantidade}
                onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })}
              />
              <Input
                placeholder="Apresentação (ex.: saco 25 kg)"
                value={novo.apresentacao}
                onChange={(e) => setNovo({ ...novo, apresentacao: e.target.value })}
              />
              <Input
                placeholder="Unidade de compra (ex.: SC)"
                value={novo.unidadeCompra}
                onChange={(e) => setNovo({ ...novo, unidadeCompra: e.target.value })}
              />
              <Input
                type="date"
                aria-label="Data necessária"
                value={novo.data}
                onChange={(e) => setNovo({ ...novo, data: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={novo.emergencial}
                onChange={(e) => setNovo({ ...novo, emergencial: e.target.checked })}
              />
              Compra emergencial
            </label>
            {novo.emergencial && (
              <Input
                placeholder="Motivo da emergência (obrigatório)"
                value={novo.motivo}
                onChange={(e) => setNovo({ ...novo, motivo: e.target.value })}
              />
            )}
            <Button
              size="sm"
              disabled={!novo.item.trim() || !novo.quantidade || !novo.data}
              onClick={criar}
            >
              Criar requisição
            </Button>
          </CardContent>
        </Card>
      )}

      {Object.keys(porFornecedor).length === 0 && dados && (
        <Card>
          <CardContent className="py-6 text-sm">Nenhuma requisição ainda.</CardContent>
        </Card>
      )}

      {Object.entries(porFornecedor).map(([fornecedor, lista]) => (
        <section key={fornecedor} className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{fornecedor}</h2>
          <div className="space-y-3">
            {lista.map((r) => (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    <span>Necessária até {r.data_necessaria}</span>
                    <Badge variant="outline">{ESTADOS[r.estado] ?? rotuloEstado(r.estado)}</Badge>
                    {r.emergencial && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                        emergencial: {r.motivo_emergencia}
                      </Badge>
                    )}
                    <span className="ml-auto text-sm font-normal">Valor: {moeda(r.valor)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {r.itens.map((it) => {
                    const cotacoes = r.cotacoes.filter((c) => c.item === it.item)
                    const f = cot[r.id + it.item] ?? { preco: '', prazo: '', cond: '' }
                    return (
                      <div key={it.item} className="border-b pb-3">
                        <div className="font-mono">
                          {it.item}: {it.quantidadeEstoque} {it.unidadeEstoque}
                          {it.quantidadeCompra !== null
                            ? ` = ${it.quantidadeCompra} ${it.unidadeCompra}`
                            : ''}
                        </div>
                        {it.pendencias.map((p) => (
                          <div key={p} className="text-xs text-warning">
                            {textoSeguro(p, 'Há uma pendência neste item.')}
                          </div>
                        ))}
                        {cotacoes.map((c) => (
                          <div key={c.id} className="flex flex-wrap items-center gap-2 mt-1">
                            <span>
                              {moeda(c.preco_compra)} / {c.unidade_compra}
                              {c.preco_estoque !== null
                                ? ` (${moeda(c.preco_estoque)} / ${it.unidadeEstoque})`
                                : ' (sem fator: fora da comparação)'}
                              , prazo {c.prazo_dias} dias
                            </span>
                            {c.diferenca_percentual !== null && (
                              <Badge
                                variant="outline"
                                className={
                                  c.acima_da_tolerancia
                                    ? 'border-destructive/30 text-destructive'
                                    : ''
                                }
                              >
                                {c.diferenca_percentual > 0 ? '+' : ''}
                                {c.diferenca_percentual}% sobre o último preço (
                                {moeda(c.ultimo_preco)})
                              </Badge>
                            )}
                            {c.diferenca_percentual === null && c.preco_estoque !== null && (
                              <span className="text-xs text-muted-foreground">sem histórico</span>
                            )}
                            {c.escolhida ? (
                              <Badge>escolhida</Badge>
                            ) : (
                              dados?.pode_editar &&
                              r.estado !== 'recusada' &&
                              r.estado !== 'cancelada' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    agir(() => escolherCotacao(c.id), 'Cotação escolhida.')
                                  }
                                >
                                  Escolher
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                        {dados?.pode_editar &&
                          (r.estado === 'rascunho' || r.estado === 'em_cotacao') && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Input
                                className="w-32"
                                type="number"
                                min={0}
                                step="any"
                                placeholder="Preço / un. de compra"
                                value={f.preco}
                                onChange={(e) =>
                                  setCot({
                                    ...cot,
                                    [r.id + it.item]: { ...f, preco: e.target.value },
                                  })
                                }
                              />
                              <Input
                                className="w-24"
                                type="number"
                                min={0}
                                placeholder="Prazo (dias)"
                                value={f.prazo}
                                onChange={(e) =>
                                  setCot({
                                    ...cot,
                                    [r.id + it.item]: { ...f, prazo: e.target.value },
                                  })
                                }
                              />
                              <Input
                                className="w-40"
                                placeholder="Condição de pagamento"
                                value={f.cond}
                                onChange={(e) =>
                                  setCot({
                                    ...cot,
                                    [r.id + it.item]: { ...f, cond: e.target.value },
                                  })
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!f.preco || f.prazo === ''}
                                onClick={() =>
                                  agir(
                                    () =>
                                      registrarCotacao({
                                        requisicao: r.id,
                                        item: it.item,
                                        preco: Number(f.preco),
                                        prazo_dias: Number(f.prazo),
                                        condicao_pagamento: f.cond,
                                        validade: '',
                                      }),
                                    'Cotação registrada.',
                                  )
                                }
                              >
                                Registrar cotação
                              </Button>
                            </div>
                          )}
                      </div>
                    )
                  })}

                  {dados?.pode_editar && (r.estado === 'rascunho' || r.estado === 'em_cotacao') && (
                    <Button
                      size="sm"
                      onClick={() =>
                        agir(() => enviarParaAprovacao(r.id, r.versao), 'Enviada para aprovação.')
                      }
                    >
                      Enviar para aprovação
                    </Button>
                  )}

                  {dados?.pode_aprovar && r.estado === 'em_aprovacao' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Confirmar
                        titulo="Aprovar esta compra?"
                        resumo={`Compra de ${r.fornecedor}, valor ${moeda(r.valor)}. Se algo mudar depois de aprovar, a aprovação cai.`}
                        rotuloBotao="Aprovar"
                        onConfirmar={() =>
                          agir(
                            () => decidirCompra({ id: r.id, decisao: 'aprovada', motivo: '' }),
                            'Compra aprovada.',
                          )
                        }
                      >
                        <Button size="sm">Aprovar</Button>
                      </Confirmar>
                      <Input
                        className="w-56"
                        placeholder="Motivo da recusa"
                        value={motivoRecusa[r.id] ?? ''}
                        onChange={(e) =>
                          setMotivoRecusa({ ...motivoRecusa, [r.id]: e.target.value })
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          agir(
                            () =>
                              decidirCompra({
                                id: r.id,
                                decisao: 'recusada',
                                motivo: motivoRecusa[r.id] ?? '',
                              }),
                            'Compra recusada.',
                          )
                        }
                      >
                        Recusar
                      </Button>
                    </div>
                  )}

                  {r.estado === 'aprovada' && (
                    <div className="rounded-md border px-3 py-2 space-y-2 bg-muted/40">
                      {r.vinculo ? (
                        <div>
                          {r.vinculo.estado === 'ligado'
                            ? `Ligado ao pedido ${r.vinculo.numero_omie || '(número ainda não lido)'} do Omie.`
                            : r.vinculo.estado === 'resultado_incerto'
                              ? 'Lançamento com resultado incerto: só consulta, nunca repete a gravação.'
                              : `Situação do lançamento: ${rotuloEstado(r.vinculo.estado)}.`}
                          {r.vinculo.estado === 'resultado_incerto' && dados?.pode_editar && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2"
                              onClick={() =>
                                agir(() => conferirPedidoCompra(r.id), 'Conferência feita.')
                              }
                            >
                              Conferir no Omie
                            </Button>
                          )}
                        </div>
                      ) : (
                        dados?.pode_editar && (
                          <>
                            <div className="text-xs text-muted-foreground">
                              Lance o pedido no Omie com os dados desta compra (fornecedor{' '}
                              {r.fornecedor}, itens e quantidades acima, código de integração{' '}
                              <span className="font-mono">{r.id}</span>) e informe o número para
                              ligar. O lançamento pelo sistema fica desligado até o dono autorizar.
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Input
                                className="w-40"
                                placeholder="Número do pedido no Omie"
                                value={numeroPedido[r.id] ?? ''}
                                onChange={(e) =>
                                  setNumeroPedido({ ...numeroPedido, [r.id]: e.target.value })
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!(numeroPedido[r.id] ?? '').trim()}
                                onClick={() =>
                                  agir(
                                    () =>
                                      ligarPedidoCompra({
                                        requisicao: r.id,
                                        numero: numeroPedido[r.id],
                                      }),
                                    'Compra ligada ao pedido.',
                                  )
                                }
                              >
                                Ligar ao pedido
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  agir(() => lancarPedidoCompra(r.id), 'Pedido lançado no Omie.')
                                }
                              >
                                Lançar no Omie
                              </Button>
                            </div>
                          </>
                        )
                      )}
                    </div>
                  )}

                  {r.aprovacoes.map((a, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {a.decisao === 'aprovada' ? 'Aprovada' : 'Recusada'} por {a.aprovador} em{' '}
                      {new Date(a.hora).toLocaleString('pt-BR')} — {moeda(a.valor)}
                      {a.alcada_usada !== null ? `, alçada até ${moeda(a.alcada_usada)}` : ''}
                      {a.motivo ? `, motivo: ${a.motivo}` : ''}
                      {!a.valida && ' — invalidada por mudança depois da decisão'}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default Requisicoes
