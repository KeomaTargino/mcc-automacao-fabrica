import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  marcarPagoAntecipado,
  obterRecebimentos,
  preConferirNota,
  registrarRecebimento,
  salvarParcelas,
  type RespostaRecebimentos,
} from '@/services/pcp-compras'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const textoDoErro = (e: any): string => {
  const d = e?.response ?? e?.data
  if (Array.isArray(d?.motivos))
    return textoSeguro(d.motivos.join('; '), 'Confira os campos destacados.')
  if (d?.motivo) return textoSeguro(d.motivo, 'Confira os campos destacados.')
  return e?.status
    ? mensagemDeErro(e)
    : 'Não foi possível concluir agora. Tente de novo em instantes.'
}

const Recebimentos = () => {
  const [dados, setDados] = useState<RespostaRecebimentos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [rec, setRec] = useState({
    chave: '',
    fornecedor: '',
    data: '',
    item: '',
    quantidade: '',
    ligacoes: '',
  })
  const [parc, setParc] = useState({
    pedido: '',
    numero: '1',
    vencimento: '',
    valor: '',
    referencia: '',
  })
  const [nota, setNota] = useState({
    pedido: '',
    numero: '',
    item: '',
    quantidade: '',
    valor: '',
    dupValor: '',
  })

  const carregar = useCallback(() => {
    obterRecebimentos()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar os recebimentos agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agir = async (fn: () => Promise<any>, ok: (r: any) => string) => {
    setAviso(null)
    try {
      setAviso(ok(await fn()))
    } catch (e: any) {
      setAviso(textoDoErro(e))
    }
    carregar()
  }

  // "A:60, B:40" → ligações
  const lerLigacoes = (t: string) =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const [p, q] = x.split(':')
        return { pedido_id: (p ?? '').trim(), quantidade: Number((q ?? '').replace(',', '.')) }
      })

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Recebimentos</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        O almoxarifado registra o que chegou e liga cada linha aos pedidos aprovados.
      </p>
      <ComoFunciona>
        <p>A soma das ligações precisa bater com a linha. Falta e sobra aparecem na tela.</p>
        <p>
          Nada aqui ajusta o estoque, classifica a nota ou lança no financeiro: isso continua no
          Omie, com as pessoas.
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
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}
      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}

      {dados?.pode_conferir && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Registrar chegada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Pedidos aprovados e ligados:{' '}
              {dados.pedidos.length === 0
                ? 'nenhum ainda'
                : dados.pedidos.map((p) => `${p.pedido_id} (${p.fornecedor})`).join(', ')}
              . Em "Ligações", escreva pedido:quantidade, separados por vírgula (ex.: A:60, B:40).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="Identificação (ex.: nota ou romaneio)"
                value={rec.chave}
                onChange={(e) => setRec({ ...rec, chave: e.target.value })}
              />
              <Input
                placeholder="Fornecedor"
                value={rec.fornecedor}
                onChange={(e) => setRec({ ...rec, fornecedor: e.target.value })}
              />
              <Input
                type="date"
                aria-label="Data da chegada"
                value={rec.data}
                onChange={(e) => setRec({ ...rec, data: e.target.value })}
              />
              <Input
                placeholder="Código do item"
                value={rec.item}
                onChange={(e) => setRec({ ...rec, item: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Quantidade (unidade de estoque)"
                value={rec.quantidade}
                onChange={(e) => setRec({ ...rec, quantidade: e.target.value })}
              />
              <Input
                placeholder="Ligações (pedido:quantidade, …)"
                value={rec.ligacoes}
                onChange={(e) => setRec({ ...rec, ligacoes: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              disabled={
                !rec.chave.trim() ||
                !rec.fornecedor.trim() ||
                !rec.data ||
                !rec.item.trim() ||
                !rec.quantidade
              }
              onClick={() =>
                agir(
                  () =>
                    registrarRecebimento({
                      chave: rec.chave,
                      fornecedor: rec.fornecedor,
                      data: rec.data,
                      linhas: [
                        {
                          item: rec.item,
                          quantidade_estoque: Number(rec.quantidade),
                          ligacoes: lerLigacoes(rec.ligacoes),
                        },
                      ],
                    }),
                  (r) =>
                    r.criado
                      ? 'Recebimento registrado.' +
                        (r.avisos_ja_paga?.length
                          ? ' ' + textoSeguro(r.avisos_ja_paga.join(' '), '')
                          : '')
                      : 'Esse recebimento já estava registrado.',
                )
              }
            >
              Registrar recebimento
            </Button>
          </CardContent>
        </Card>
      )}

      {dados && dados.recebimentos.length === 0 && (
        <Card className="mb-6">
          <CardContent className="py-6 text-sm">Nenhum recebimento registrado ainda.</CardContent>
        </Card>
      )}
      <div className="space-y-3 mb-6">
        {dados?.recebimentos.map((r) => (
          <Card key={r.chave}>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <span>
                  {r.chave} — {r.fornecedor}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')} · por{' '}
                  {r.registrado_por}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {r.linhas.map((l) => (
                <div key={l.item}>
                  <span className="font-mono">{l.item}</span>: {l.quantidadeEstoque}{' '}
                  {l.unidadeEstoque ?? ''} —{' '}
                  {l.ligacoes.length === 0
                    ? 'sem pedido'
                    : l.ligacoes.map((g) => `${g.quantidade} do pedido ${g.pedidoId}`).join(' + ')}
                  {l.porExcecao && (
                    <Badge variant="outline" className="ml-2">
                      exceção
                    </Badge>
                  )}
                  {l.pendencias.map((p) => (
                    <div key={p} className="text-xs text-warning">
                      {textoSeguro(p, 'Há uma pendência neste item.')}
                    </div>
                  ))}
                </div>
              ))}
              {r.diferencas.map((d) => (
                <div key={d.pedidoId + d.item} className="text-destructive">
                  {d.tipo === 'falta' ? 'Falta' : 'Sobra'} de {d.diferenca} no item {d.item} do
                  pedido {d.pedidoId} (pedido {d.pedido}, recebido {d.recebido})
                </div>
              ))}
              {r.diferencas.length === 0 && (
                <div className="text-muted-foreground">Sem diferença.</div>
              )}
              {r.avisos_ja_paga.map((a) => (
                <div key={a} className="text-warning font-medium">
                  {textoSeguro(a, 'Este pedido já foi pago.')}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-2">Parcelas e pagamento antecipado</h2>
      {dados?.pode_financeiro && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <Input
                placeholder="Pedido"
                value={parc.pedido}
                onChange={(e) => setParc({ ...parc, pedido: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                placeholder="Parcela nº"
                value={parc.numero}
                onChange={(e) => setParc({ ...parc, numero: e.target.value })}
              />
              <Input
                type="date"
                aria-label="Vencimento"
                value={parc.vencimento}
                onChange={(e) => setParc({ ...parc, vencimento: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Valor"
                value={parc.valor}
                onChange={(e) => setParc({ ...parc, valor: e.target.value })}
              />
              <Button
                size="sm"
                disabled={!parc.pedido.trim() || !parc.vencimento || !parc.valor}
                onClick={() =>
                  agir(
                    () =>
                      salvarParcelas({
                        pedido: parc.pedido.trim(),
                        parcelas: [
                          {
                            numero: Number(parc.numero),
                            vencimento: parc.vencimento,
                            valor: Number(parc.valor),
                          },
                        ],
                      }),
                    () => 'Parcela registrada (substitui as parcelas anteriores do pedido).',
                  )
                }
              >
                Registrar parcela
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-64"
                placeholder="Referência do pagamento antecipado"
                value={parc.referencia}
                onChange={(e) => setParc({ ...parc, referencia: e.target.value })}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!parc.pedido.trim() || !parc.referencia.trim()}
                onClick={() =>
                  agir(
                    () =>
                      marcarPagoAntecipado({
                        pedido: parc.pedido.trim(),
                        referencia: parc.referencia,
                      }),
                    () => 'Pedido marcado como já pago. O sistema não lança nada no financeiro.',
                  )
                }
              >
                Marcar como já pago
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {dados && dados.parcelas.length === 0 && (
        <p className="text-sm mb-6">Nenhuma parcela registrada.</p>
      )}
      {dados && dados.parcelas.length > 0 && (
        <div className="overflow-x-auto mb-6">
          <Table className="w-full text-sm text-left">
            <TableHeader>
              <TableRow className="border-b text-xs text-muted-foreground">
                <TableHead className="py-2 pr-3">Pedido</TableHead>
                <TableHead className="py-2 pr-3">Parcela</TableHead>
                <TableHead className="py-2 pr-3">Vencimento</TableHead>
                <TableHead className="py-2 pr-3">Valor</TableHead>
                <TableHead className="py-2">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.parcelas.map((p) => (
                <TableRow key={p.pedido + p.numero} className="border-b">
                  <TableCell className="py-2 pr-3 font-mono">{p.pedido}</TableCell>
                  <TableCell className="py-2 pr-3">{p.numero}</TableCell>
                  <TableCell className="py-2 pr-3">
                    {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="py-2 pr-3">{moeda(p.valor)}</TableCell>
                  <TableCell className="py-2">
                    {p.pago_antecipado ? (
                      <Badge className="bg-warning/10 text-warning border-warning/30">
                        já paga ({p.referencia_pagamento}): não lançar nova conta a pagar
                      </Badge>
                    ) : (
                      'prevista'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-2">Pré-conferência com nota de demonstração</h2>
      <p className="text-xs text-muted-foreground mb-2">
        Só nota de demonstração. A leitura de nota real e a escrita do recebimento no Omie estão em
        revisão e não existem nesta tela.
      </p>
      {dados?.pode_conferir && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="Pedido"
                value={nota.pedido}
                onChange={(e) => setNota({ ...nota, pedido: e.target.value })}
              />
              <Input
                placeholder="Número da nota (demonstração)"
                value={nota.numero}
                onChange={(e) => setNota({ ...nota, numero: e.target.value })}
              />
              <Input
                placeholder="Código do item"
                value={nota.item}
                onChange={(e) => setNota({ ...nota, item: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Quantidade na nota"
                value={nota.quantidade}
                onChange={(e) => setNota({ ...nota, quantidade: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Valor do item"
                value={nota.valor}
                onChange={(e) => setNota({ ...nota, valor: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Valor das duplicatas"
                value={nota.dupValor}
                onChange={(e) => setNota({ ...nota, dupValor: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              disabled={!nota.pedido.trim() || !nota.item.trim() || !nota.quantidade}
              onClick={() =>
                agir(
                  () =>
                    preConferirNota({
                      pedido: nota.pedido.trim(),
                      nota: {
                        demonstracao: true,
                        emitente: 'Fornecedor de demonstração',
                        numero: nota.numero,
                        serie: '1',
                        itens: [
                          {
                            item: nota.item,
                            quantidade: Number(nota.quantidade),
                            unidade: '',
                            valor: Number(nota.valor || 0),
                          },
                        ],
                        duplicatas: nota.dupValor
                          ? [{ numero: 1, vencimento: '', valor: Number(nota.dupValor) }]
                          : [],
                      },
                    }),
                  (r) =>
                    r.estado === 'conferida'
                      ? 'Nota de demonstração confere.'
                      : 'Pendente: ' +
                        textoSeguro(
                          r.pendencias.map((p: any) => p.mensagem).join('; '),
                          'confira os itens da nota',
                        ),
                )
              }
            >
              Pré-conferir
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {dados?.notas_demo.map((n, i) => (
          <div key={i} className="text-sm border-b pb-2">
            Pedido {n.pedido}, nota de demonstração {n.numero ?? ''}:{' '}
            <Badge variant="outline">{n.estado === 'conferida' ? 'confere' : 'pendente'}</Badge>
            {n.pendencias.map((p) => (
              <div key={p.mensagem} className="text-xs text-destructive">
                {textoSeguro(p.mensagem, 'Há uma diferença para conferir.')}
              </div>
            ))}
            {n.avisos.map((a) => (
              <div key={a} className="text-xs text-warning">
                {textoSeguro(a, 'Confira esta nota.')}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Recebimentos
