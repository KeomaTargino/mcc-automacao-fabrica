import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, semInformacao, textoSeguro } from '@/lib/pcp/textos'
import {
  obterRelatorio,
  paraCsv,
  type RelatorioCompras,
  type RelatorioPedidos,
  type RelatorioProducao,
  type RelatorioQualquer,
  type RodapeRelatorio,
} from '@/services/pcp-relatorios'

const BLOCOS = [
  ['producao', 'Produção: planejado, produzido e conferido'],
  ['consumo', 'Consumo e perdas declaradas'],
  ['compras', 'Compras'],
  ['pedidos', 'Pedidos'],
] as const

const campo = 'border rounded px-2 py-1 text-sm bg-background'
const baixar = (nome: string, csv: string) => {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

const Rodape = ({ r }: { r: RodapeRelatorio }) => (
  <div className="mt-3 border-t pt-2 text-xs text-muted-foreground space-y-1">
    <div>
      Período {r.periodo.de} a {r.periodo.ate} · fonte: {textoSeguro(r.fonte, 'sistema')} ·
      atualizado em{' '}
      {r.atualizado_em ? new Date(r.atualizado_em).toLocaleString('pt-BR') : 'sem registro'}
    </div>
    {r.lacunas.map((l) => (
      <div key={l} className="text-warning">
        Lacuna: {textoSeguro(l, 'falta informação neste bloco')}
      </div>
    ))}
  </div>
)

const Compras = ({ d }: { d: RelatorioCompras }) => (
  <div className="text-sm space-y-2">
    {d.rodape.sem_dados ? (
      <div>sem dados no período</div>
    ) : (
      <>
        <div>
          {d.por_unidade.map((u) => (
            <div key={u.unidade}>
              {u.unidade}: comprado <strong>{u.comprado}</strong> · recebido{' '}
              <strong>{u.recebido}</strong>
            </div>
          ))}
        </div>
        <div>
          Entregas no prazo: {d.entregas.no_prazo} de {d.entregas.com_recebimento}
          {d.entregas.pct_no_prazo !== null
            ? ` (${d.entregas.pct_no_prazo}%)`
            : ' (nenhum recebimento no período)'}
        </div>
        <div>
          {d.preco_medio.length === 0 && <div>Preço médio: sem preços no período</div>}
          {d.preco_medio.map((p) => (
            <div key={p.fornecedor + p.unidade}>
              Preço médio de {p.fornecedor} por {p.unidade}:{' '}
              <strong>{p.preco_medio.toLocaleString('pt-BR')}</strong> (base {p.quantidade_base}{' '}
              {p.unidade})
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            baixar(
              'compras.csv',
              paraCsv(
                ['unidade', 'comprado', 'recebido'],
                d.por_unidade.map((u) => [u.unidade, u.comprado, u.recebido]),
              ),
            )
          }
        >
          Exportar planilha
        </Button>
      </>
    )}
    <Rodape r={d.rodape} />
  </div>
)

const semDado = (v: number | null) => (v === null ? semInformacao() : v.toLocaleString('pt-BR'))

const Producao = ({ d }: { d: RelatorioProducao }) => (
  <div className="text-sm space-y-2">
    {d.rodape.sem_dados ? (
      <div>sem dados no período</div>
    ) : (
      <>
        {d.linhas.map((l) => (
          <div key={l.produto + l.unidade}>
            {l.produto} ({l.unidade}): planejado <strong>{semDado(l.planejado)}</strong> · produzido{' '}
            <strong>{semDado(l.produzido)}</strong> · conferido{' '}
            <strong>{semDado(l.conferido)}</strong> · {l.ordens} ordem(ns)
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            baixar(
              'producao.csv',
              paraCsv(
                ['produto', 'unidade', 'planejado', 'produzido', 'conferido', 'ordens'],
                d.linhas.map((l) => [
                  l.produto,
                  l.unidade,
                  l.planejado,
                  l.produzido,
                  l.conferido,
                  l.ordens,
                ]),
              ),
            )
          }
        >
          Exportar planilha
        </Button>
      </>
    )}
    <Rodape r={d.rodape} />
  </div>
)

const Pedidos = ({ d }: { d: RelatorioPedidos }) => (
  <div className="text-sm space-y-2">
    {d.rodape.sem_dados ? (
      <div>sem dados no período</div>
    ) : (
      <>
        {d.confirmados.map((c) => (
          <div key={c.origem + c.unidade}>
            {c.origem} · {c.unidade}: {c.total} confirmados — {c.aptos} aptos, {c.bloqueados}{' '}
            bloqueados, {c.liberados} liberados
          </div>
        ))}
        <div>Intenção da Nuvemshop (fora do confirmado): {d.intencoes}</div>
        <div>
          Tempo até liberar:{' '}
          {d.horas_ate_liberar.media === null
            ? 'nenhum pedido liberado no período'
            : `${d.horas_ate_liberar.media} h em média (${d.horas_ate_liberar.pedidos} pedidos)`}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            baixar(
              'pedidos.csv',
              paraCsv(
                ['origem', 'unidade', 'total', 'aptos', 'bloqueados', 'liberados'],
                d.confirmados.map((c) => [
                  c.origem,
                  c.unidade,
                  c.total,
                  c.aptos,
                  c.bloqueados,
                  c.liberados,
                ]),
              ),
            )
          }
        >
          Exportar planilha
        </Button>
      </>
    )}
    <Rodape r={d.rodape} />
  </div>
)

const Relatorios = () => {
  const hoje = new Date().toISOString().slice(0, 10)
  const [de, setDe] = useState(`${hoje.slice(0, 8)}01`)
  const [ate, setAte] = useState(hoje)
  const [produto, setProduto] = useState('')
  const [res, setRes] = useState<Record<string, RelatorioQualquer | 'sem_acesso' | 'erro'>>({})
  const [carregando, setCarregando] = useState(false)

  const gerar = async () => {
    setCarregando(true)
    const novo: Record<string, RelatorioQualquer | 'sem_acesso' | 'erro'> = {}
    for (const [b] of BLOCOS) {
      try {
        novo[b] = await obterRelatorio({ bloco: b, de, ate, ...(produto ? { produto } : {}) })
      } catch (e: any) {
        novo[b] = e?.status === 403 ? 'sem_acesso' : 'erro'
      }
    }
    setRes(novo)
    setCarregando(false)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Relatórios comparativos</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Produção, consumo, compras e pedidos de um período, lado a lado.
      </p>
      <ComoFunciona>
        <p>
          Cada bloco mostra período, fonte, hora da atualização e lacunas, e só aparece para quem
          tem a área correspondente.
        </p>
        <p>
          Unidades diferentes não se somam, bloco sem registro mostra “sem dados no período” e a
          diferença de consumo nunca é chamada de perda sem declaração.
        </p>
      </ComoFunciona>
      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          De
          <input
            type="date"
            className={`${campo} block`}
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </label>
        <label className="block">
          Até
          <input
            type="date"
            className={`${campo} block`}
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </label>
        <label className="block">
          Produto (opcional)
          <input
            className={`${campo} block`}
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
          />
        </label>
        <Button size="sm" onClick={gerar} disabled={carregando}>
          {carregando ? 'Gerando…' : 'Gerar relatórios'}
        </Button>
      </div>
      <div className="space-y-4">
        {BLOCOS.map(([b, titulo]) => {
          const r = res[b]
          if (!r || r === 'sem_acesso') return null
          return (
            <Card key={b}>
              <CardHeader>
                <CardTitle className="text-base">{titulo}</CardTitle>
              </CardHeader>
              <CardContent>
                {r === 'erro' && (
                  <div className="text-sm text-destructive">
                    Não foi possível gerar este bloco agora.
                  </div>
                )}
                {r !== 'erro' && r.bloco === 'compras' && <Compras d={r as RelatorioCompras} />}
                {r !== 'erro' && r.bloco === 'pedidos' && <Pedidos d={r as RelatorioPedidos} />}
                {r !== 'erro' && r.bloco === 'producao' && <Producao d={r as RelatorioProducao} />}
                {r !== 'erro' && r.bloco === 'consumo' && (
                  <div className="text-sm space-y-2">
                    <div>sem dados no período</div>
                    <Rodape r={r.rodape} />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {Object.keys(res).length > 0 && Object.values(res).every((x) => x === 'sem_acesso') && (
          <p className="text-sm">{mensagemDeErro({ status: 403 })}</p>
        )}
      </div>
    </div>
  )
}

export default Relatorios
