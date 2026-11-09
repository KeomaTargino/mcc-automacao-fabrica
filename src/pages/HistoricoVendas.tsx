import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  aprovarRegraSazonalidade,
  levarAntecipacaoParaRequisicao,
  obterHistoricoVendas,
  type RespostaHistoricoVendas,
} from '@/services/pcp-vendas'
import Aviso from '@/components/Aviso'

const campo = 'border rounded px-2 py-1 text-sm bg-background'
const num = (n: number | null, sufixo = '') =>
  n === null ? 'não lido' : `${n.toLocaleString('pt-BR')}${sufixo}`

const HistoricoVendas = () => {
  const [produto, setProduto] = useState('')
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7))
  const [dataNec, setDataNec] = useState(`${new Date().toISOString().slice(0, 7)}-01`)
  const [d, setD] = useState<RespostaHistoricoVendas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ciclos, setCiclos] = useState('')
  const [cobertura, setCobertura] = useState('')
  const [qtd, setQtd] = useState('')

  const consultar = () => {
    setErro(null)
    setMsg(null)
    obterHistoricoVendas({ produto, periodo, data_necessaria: dataNec })
      .then(setD)
      .catch((e: any) =>
        setErro(e?.status === 403 ? mensagemDeErro(e) : 'Não foi possível consultar agora.'),
      )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Histórico de vendas e sazonalidade</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        O mês escolhido ao lado do mesmo mês dos anos anteriores.{' '}
        <Link to="/sugestoes" className="underline">
          Ver as sugestões
        </Link>
      </p>
      <ComoFunciona>
        <p>
          Cada ciclo mostra a cobertura do histórico. A sazonalidade só aparece quando o histórico
          cumpre a regra aprovada pelo PCP; senão fica “histórico insuficiente”.
        </p>
        <p>
          É contexto e sugestão: o cálculo das sugestões não muda, nada é comprado e a diferença de
          vendas não é tratada como perda.
        </p>
      </ComoFunciona>
      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          Produto (código)
          <input
            className={`${campo} block`}
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
          />
        </label>
        <label className="block">
          Mês de referência
          <input
            type="month"
            className={`${campo} block`}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
        </label>
        <label className="block">
          Data necessária (para a antecipação)
          <input
            type="date"
            className={`${campo} block`}
            value={dataNec}
            onChange={(e) => setDataNec(e.target.value)}
          />
        </label>
        <Button size="sm" disabled={!produto.trim()} onClick={consultar}>
          Comparar
        </Button>
      </div>
      {erro && (
        <Aviso nivel="bloqueio" topo>
          {erro}
        </Aviso>
      )}
      {d && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                Comparação com anos anteriores — <span className="font-mono">{d.produto}</span>
                {d.suficiente ? (
                  <Badge>histórico suficiente</Badge>
                ) : (
                  <Badge variant="outline">histórico insuficiente</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                {d.periodo_atual}: <strong>{num(d.atual.quantidade)}</strong>
                {d.variacao_sobre_anos_anteriores_pct !== null && (
                  <span>
                    {' '}
                    · diferença de {d.variacao_sobre_anos_anteriores_pct}% sobre a média dos anos
                    anteriores
                  </span>
                )}
              </div>
              {d.ciclos.map((c) => (
                <div key={c.periodo} className="flex flex-wrap gap-x-4">
                  <span className="font-mono">{c.periodo}</span>
                  <span>
                    vendas: <strong>{num(c.quantidade)}</strong>
                  </span>
                  <span>cobertura do ciclo: {c.cobertura_pct}%</span>
                  {c.indice_sobre_media_pct !== null && (
                    <span>{c.indice_sobre_media_pct}% sobre a média do ano</span>
                  )}
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                {textoSeguro(d.mensagem, 'Histórico em leitura')}. {d.meses_lidos} meses lidos do
                Omie até agora.
                {d.regra
                  ? ` Regra v${d.regra.versao}: ${d.regra.ciclosMinimos} ciclos com cobertura de ${d.regra.coberturaMinimaPct}% ou mais.`
                  : ''}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sugestão de antecipação da compra</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>{textoSeguro(d.antecipacao.texto, 'Sem sugestão de antecipação agora.')}</div>
              {d.antecipacao.sugerir && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Quantidade (unidade de estoque)"
                    className={`${campo} w-48`}
                    inputMode="decimal"
                    placeholder="quantidade em estoque"
                    value={qtd}
                    onChange={(e) => setQtd(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!(Number(qtd) > 0)}
                    onClick={() =>
                      levarAntecipacaoParaRequisicao({
                        produto: d.produto,
                        periodo: d.periodo_atual,
                        quantidade_estoque: Number(qtd),
                        data_necessaria: d.antecipacao.data_sugerida_de_compra ?? dataNec,
                      })
                        .then((r) =>
                          setMsg(
                            r.requisicoes?.length
                              ? 'Requisição criada em rascunho; nada foi comprado.'
                              : r.ja_existiam
                                ? 'Esta sugestão já virou requisição.'
                                : textoSeguro(r.bloqueados?.[0]?.mensagem, 'Nada foi criado.'),
                          ),
                        )
                        .catch((e: any) =>
                          setMsg(
                            e?.status === 403
                              ? mensagemDeErro(e)
                              : 'Não foi possível criar a requisição agora.',
                          ),
                        )
                    }
                  >
                    Levar para a requisição
                  </Button>
                  <Link to="/compras/requisicoes" className="underline text-xs">
                    Ver requisições
                  </Link>
                </div>
              )}
              {msg && <p role="status">{msg}</p>}
            </CardContent>
          </Card>
          {d.pode_editar_regra && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Regra de suficiência (PCP)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3 text-sm">
                <label className="block">
                  Ciclos mínimos
                  <input
                    className={`${campo} block w-24`}
                    inputMode="numeric"
                    value={ciclos}
                    onChange={(e) => setCiclos(e.target.value)}
                  />
                </label>
                <label className="block">
                  Cobertura mínima de cada ciclo (%)
                  <input
                    className={`${campo} block w-24`}
                    inputMode="decimal"
                    value={cobertura}
                    onChange={(e) => setCobertura(e.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    aprovarRegraSazonalidade({
                      ciclos_minimos: Number(ciclos),
                      cobertura_minima_pct: Number(cobertura),
                    })
                      .then((r) => {
                        setMsg(
                          r.estado === 'replay'
                            ? 'Nada mudou: é a regra vigente.'
                            : `Regra v${r.versao} aprovada.`,
                        )
                        consultar()
                      })
                      .catch((e: any) =>
                        setMsg(
                          textoSeguro(
                            e?.response?.motivos?.join(' '),
                            'Não foi possível aprovar agora.',
                          ),
                        ),
                      )
                  }
                >
                  Aprovar nova versão
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default HistoricoVendas
