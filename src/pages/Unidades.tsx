import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import {
  decidirNomeCanal,
  obterUnidades,
  registrarNomeCanal,
  salvarPrecoTabela,
  salvarUnidade,
  type RespostaUnidades,
} from '@/services/pcp-faturamento'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import Escolha from '@/components/Escolha'
import Aviso from '@/components/Aviso'

const TIPOS: Record<string, string> = {
  franquia: 'franquia',
  loja_propria: 'loja própria',
  cliente_b2b: 'cliente B2B',
}

const textoDoErro = (e: any): string => {
  const d = e?.response ?? e?.data
  if (Array.isArray(d?.motivos))
    return textoSeguro(d.motivos.join('; '), 'Confira os campos destacados.')
  if (d?.erro === 'conflito_de_versao') return mensagemDeErro({ status: 409 })
  if (d?.erro === 'unidade_nao_cadastrada') return 'Cadastre a unidade deste cliente antes.'
  if (d?.erro === 'nada_a_revisar') return 'Este nome não está aguardando revisão.'
  return e?.status
    ? mensagemDeErro(e)
    : 'Não foi possível concluir agora. Tente de novo em instantes.'
}

const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const Unidades = () => {
  const [dados, setDados] = useState<RespostaUnidades | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [u, setU] = useState({ cliente: '', unidade: '', nome: '', tipo: 'franquia' })
  const [nc, setNc] = useState({ canal: 'nuvemshop', cliente: '', nome: '' })
  const [pr, setPr] = useState({ chave: '', item: '', preco: '', unidade: '', vig: '' })

  const carregar = useCallback(() => {
    obterUnidades()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar as unidades agora. Tente de novo em instantes.',
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
    } catch (e: any) {
      setAviso(textoDoErro(e))
    }
    carregar()
  }

  const versaoAtual = (cliente: string) =>
    dados?.unidades.find((x) => x.cliente_omie === cliente.trim())?.versao ?? 0

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Unidades</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Cada cliente do Omie que recebe pedido tem uma unidade e o nome fantasia da operação.
      </p>
      <ComoFunciona>
        <p>
          O nome que chega de um canal nunca troca o nome operacional sozinho: se for diferente,
          fica “a revisar” até o faturamento aceitar ou recusar.
        </p>
        <p>Toda mudança gera uma versão com autor e hora.</p>
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

      {dados?.pode_editar && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Cadastrar ou alterar uma unidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="Código do cliente no Omie"
                value={u.cliente}
                onChange={(e) => setU({ ...u, cliente: e.target.value })}
              />
              <Input
                placeholder="Unidade"
                value={u.unidade}
                onChange={(e) => setU({ ...u, unidade: e.target.value })}
              />
              <Input
                placeholder="Nome fantasia operacional"
                value={u.nome}
                onChange={(e) => setU({ ...u, nome: e.target.value })}
              />
              <Escolha
                rotuloAria="Tipo"
                value={u.tipo}
                onChange={(v) => setU({ ...u, tipo: v })}
                opcoes={Object.entries(TIPOS).map(([v, r]) => ({ valor: v, rotulo: r }))}
              />
            </div>
            <Button
              size="sm"
              disabled={!u.cliente.trim() || !u.unidade.trim() || !u.nome.trim()}
              onClick={() =>
                agir(
                  () =>
                    salvarUnidade({
                      cliente_omie: u.cliente.trim(),
                      unidade: u.unidade,
                      nome_fantasia_operacional: u.nome,
                      tipo: u.tipo,
                      versao_esperada: versaoAtual(u.cliente),
                    }),
                  'Unidade salva (versão nova).',
                )
              }
            >
              Salvar unidade
            </Button>
          </CardContent>
        </Card>
      )}

      {dados && dados.unidades.length === 0 && (
        <Card className="mb-6">
          <CardContent className="py-6 text-sm">
            Nenhuma unidade cadastrada ainda. Pedidos de clientes sem unidade ficam como "Unidade
            não cadastrada" e não seguem para a preparação.
          </CardContent>
        </Card>
      )}
      {dados && dados.unidades.length > 0 && (
        <div className="overflow-x-auto mb-6">
          <Table className="w-full text-sm text-left">
            <TableHeader>
              <TableRow className="border-b text-xs text-muted-foreground">
                <TableHead className="py-2 pr-3">Cliente (Omie)</TableHead>
                <TableHead className="py-2 pr-3">Unidade</TableHead>
                <TableHead className="py-2 pr-3">Nome fantasia operacional</TableHead>
                <TableHead className="py-2 pr-3">Tipo</TableHead>
                <TableHead className="py-2 pr-3">Versão</TableHead>
                <TableHead className="py-2">Alterado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.unidades.map((x) => (
                <TableRow key={x.cliente_omie} className="border-b align-top">
                  <TableCell className="py-2 pr-3 font-mono">{x.cliente_omie}</TableCell>
                  <TableCell className="py-2 pr-3">{x.unidade}</TableCell>
                  <TableCell className="py-2 pr-3">{x.nome_fantasia_operacional}</TableCell>
                  <TableCell className="py-2 pr-3">
                    {TIPOS[x.tipo] ?? rotuloEstado(x.tipo)}
                  </TableCell>
                  <TableCell className="py-2 pr-3">{x.versao}</TableCell>
                  <TableCell className="py-2">
                    {x.alterado_por}, {new Date(x.alterado_em).toLocaleDateString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-2">
        Nomes dos canais{' '}
        {dados && dados.a_revisar > 0 && (
          <Badge variant="outline">{dados.a_revisar} a revisar</Badge>
        )}
      </h2>
      {dados?.pode_editar && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Escolha
                rotuloAria="Canal"
                value={nc.canal}
                onChange={(v) => setNc({ ...nc, canal: v })}
                opcoes={[
                  { valor: 'nuvemshop', rotulo: 'Nuvemshop' },
                  { valor: 'lunet', rotulo: 'Lunet' },
                  { valor: 'omie', rotulo: 'Omie' },
                  { valor: 'manual', rotulo: 'Manual' },
                ]}
              />
              <Input
                placeholder="Código do cliente no Omie"
                value={nc.cliente}
                onChange={(e) => setNc({ ...nc, cliente: e.target.value })}
              />
              <Input
                placeholder="Nome recebido do canal"
                value={nc.nome}
                onChange={(e) => setNc({ ...nc, nome: e.target.value })}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!nc.cliente.trim() || !nc.nome.trim()}
                onClick={() =>
                  agir(
                    () =>
                      registrarNomeCanal({
                        canal: nc.canal,
                        cliente_omie: nc.cliente.trim(),
                        nome_recebido: nc.nome,
                      }),
                    'Nome registrado.',
                  )
                }
              >
                Registrar nome
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2 mb-6">
        {dados?.nomes.length === 0 && <p className="text-sm">Nenhum nome de canal registrado.</p>}
        {dados?.nomes.map((n) => (
          <div
            key={n.canal + n.cliente_omie + n.nome_recebido}
            className="text-sm border-b pb-2 flex flex-wrap items-center gap-2"
          >
            <span className="font-mono">{n.cliente_omie}</span>
            <span>
              {n.canal}: “{n.nome_recebido}”
            </span>
            <Badge variant="outline">
              {n.estado === 'a_revisar'
                ? 'a revisar'
                : n.estado === 'igual'
                  ? 'igual ao operacional'
                  : rotuloEstado(n.estado)}
            </Badge>
            {n.estado === 'a_revisar' && dados.pode_editar && (
              <span className="flex gap-1 ml-auto">
                <Button
                  size="sm"
                  onClick={() =>
                    agir(
                      () =>
                        decidirNomeCanal({
                          canal: n.canal,
                          cliente_omie: n.cliente_omie,
                          nome_recebido: n.nome_recebido,
                          decisao: 'aceito',
                        }),
                      'Nome aceito: virou o nome operacional (versão nova).',
                    )
                  }
                >
                  Aceitar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    agir(
                      () =>
                        decidirNomeCanal({
                          canal: n.canal,
                          cliente_omie: n.cliente_omie,
                          nome_recebido: n.nome_recebido,
                          decisao: 'recusado',
                        }),
                      'Nome recusado: o operacional continua.',
                    )
                  }
                >
                  Recusar
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-2">Tabela de preço operacional</h2>
      <p className="text-xs text-muted-foreground mb-2">
        Use o código do cliente para o preço da unidade, ou * para o preço geral.
      </p>
      {dados?.pode_editar && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              <Input
                placeholder="Cliente ou *"
                value={pr.chave}
                onChange={(e) => setPr({ ...pr, chave: e.target.value })}
              />
              <Input
                placeholder="Item"
                value={pr.item}
                onChange={(e) => setPr({ ...pr, item: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Preço"
                value={pr.preco}
                onChange={(e) => setPr({ ...pr, preco: e.target.value })}
              />
              <Input
                placeholder="Unidade (ex.: CX)"
                value={pr.unidade}
                onChange={(e) => setPr({ ...pr, unidade: e.target.value })}
              />
              <Input
                type="date"
                aria-label="Vigência"
                value={pr.vig}
                onChange={(e) => setPr({ ...pr, vig: e.target.value })}
              />
              <Button
                size="sm"
                disabled={
                  !pr.chave.trim() || !pr.item.trim() || !pr.preco || !pr.unidade.trim() || !pr.vig
                }
                onClick={() =>
                  agir(
                    () =>
                      salvarPrecoTabela({
                        chave: pr.chave.trim(),
                        item: pr.item,
                        preco: Number(pr.preco),
                        unidade: pr.unidade,
                        vigencia_inicio: pr.vig,
                      }),
                    'Preço salvo (versão nova).',
                  )
                }
              >
                Salvar preço
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {dados && dados.tabela.length === 0 && <p className="text-sm">Nenhum preço cadastrado.</p>}
      {dados && dados.tabela.length > 0 && (
        <div className="overflow-x-auto">
          <Table className="w-full text-sm text-left">
            <TableHeader>
              <TableRow className="border-b text-xs text-muted-foreground">
                <TableHead className="py-2 pr-3">Cliente / geral</TableHead>
                <TableHead className="py-2 pr-3">Item</TableHead>
                <TableHead className="py-2 pr-3">Preço</TableHead>
                <TableHead className="py-2 pr-3">Vigência</TableHead>
                <TableHead className="py-2">Versão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.tabela.map((p) => (
                <TableRow
                  key={p.chave + p.item + p.vigencia_inicio + p.versao}
                  className="border-b"
                >
                  <TableCell className="py-2 pr-3 font-mono">{p.chave}</TableCell>
                  <TableCell className="py-2 pr-3 font-mono">{p.item}</TableCell>
                  <TableCell className="py-2 pr-3">
                    {moeda(p.preco)} / {p.unidade}
                  </TableCell>
                  <TableCell className="py-2 pr-3">
                    {new Date(p.vigencia_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="py-2">{p.versao}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default Unidades
