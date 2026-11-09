import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import { perguntarAoAssistente, type RespostaAssistente } from '@/services/pcp-assistente'
import { dataEHora } from '@/lib/pcp/formato'

interface Troca {
  pergunta: string
  resposta: RespostaAssistente | 'permissao' | 'erro'
}

const Assistente = () => {
  const { isAuthenticated, loading } = useAuth()
  const [pergunta, setPergunta] = useState('')
  const [trocas, setTrocas] = useState<Troca[]>([])
  const [enviando, setEnviando] = useState(false)

  if (!loading && !isAuthenticated) return <Navigate to="/login" replace />

  const enviar = () => {
    const p = pergunta.trim()
    if (p.length < 3) return
    setEnviando(true)
    perguntarAoAssistente(p)
      .then((r) => setTrocas((t) => [{ pergunta: p, resposta: r }, ...t]))
      .catch((e: any) =>
        setTrocas((t) => [
          { pergunta: p, resposta: e?.status === 403 ? 'permissao' : 'erro' },
          ...t,
        ]),
      )
      .finally(() => {
        setEnviando(false)
        setPergunta('')
      })
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Assistente de consulta</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Pergunte em português sobre alertas, compras e pedidos da sua área.
      </p>
      <ComoFunciona>
        <p>
          O assistente só consulta: não compra, não aprova, não libera, não publica e não envia nada
          ao Omie.
        </p>
        <p>
          Toda resposta traz a fonte, o período, a hora da atualização e os limites. Cada pergunta
          fica registrada; não digite dados pessoais.
        </p>
      </ComoFunciona>
      <p className="mb-3 text-sm">
        <Link to="/assistente/loop" className="underline">
          Perguntas respondidas com fonte
        </Link>
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          aria-label="Pergunta"
          className="flex-1 min-w-64 border rounded px-3 py-2 text-sm bg-background"
          placeholder="Ex.: quantos alertas críticos estão abertos?"
          maxLength={1000}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !enviando && enviar()}
        />
        <Button onClick={enviar} disabled={enviando || pergunta.trim().length < 3}>
          {enviando ? 'Consultando…' : 'Perguntar'}
        </Button>
      </div>
      <div className="space-y-3">
        {trocas.map((t, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">
                Você: {t.pergunta}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {t.resposta === 'permissao' && <div>{mensagemDeErro({ status: 403 })}</div>}
              {t.resposta === 'erro' && (
                <div>Não foi possível consultar agora. As telas seguem funcionando.</div>
              )}
              {typeof t.resposta === 'object' && (
                <>
                  <div>
                    {textoSeguro(t.resposta.texto, 'Não encontrei uma resposta para isso.')}
                  </div>
                  {t.resposta.tipo === 'acao_recusada' && (
                    <div className="text-xs text-warning">Tela indicada: {t.resposta.tela}</div>
                  )}
                  {t.resposta.tipo === 'sem_dados' && (
                    <ul className="list-disc pl-5 text-xs text-warning">
                      {t.resposta.falta.map((f) => (
                        <li key={f}>Falta: {textoSeguro(f, 'uma informação')}</li>
                      ))}
                    </ul>
                  )}
                  {t.resposta.tipo === 'respondida' && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {t.resposta.fontes.map((f) => (
                        <div key={f.nome}>
                          Fonte: {f.nome} · período: {f.periodo} · atualizado em{' '}
                          {f.atualizadoEm ? dataEHora(f.atualizadoEm) : 'sem registro'}
                        </div>
                      ))}
                      {t.resposta.limites.map((l) => (
                        <div key={l}>Limite: {textoSeguro(l, 'veja a fonte indicada')}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Assistente
