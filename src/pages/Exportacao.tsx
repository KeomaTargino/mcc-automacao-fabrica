import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  montarZip,
  obterColecaoExportada,
  obterResumoExportacao,
  resumoParaCsv,
  type ResumoExportacao,
} from '@/services/pcp-exportacao'

// Nome da coleção como a pessoa lê: sem o prefixo do sistema e sem sublinhado.
const nomeColecao = (c: string) => String(c).replace(/^pcp_/, '').replace(/_/g, ' ')

const Exportacao = () => {
  const { isAuthenticated, loading } = useAuth()
  const [resumo, setResumo] = useState<ResumoExportacao | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [ultima, setUltima] = useState<string | null>(null)

  if (!loading && !isAuthenticated) return <Navigate to="/login" replace />

  const erro403 = (e: any) =>
    setMsg(
      e?.status === 403
        ? mensagemDeErro(e)
        : 'Não foi possível exportar agora. Tente de novo em instantes.',
    )

  const ver = () => {
    setMsg(null)
    obterResumoExportacao().then(setResumo).catch(erro403)
  }

  const baixar = async () => {
    setMsg(null)
    try {
      const base = await obterResumoExportacao()
      const arquivos: { nome: string; conteudo: string }[] = []
      const linhas = [...base.linhas]
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i]
        if (!l.exportada) continue
        setProgresso(`Lendo ${nomeColecao(l.colecao)} (${i + 1} de ${linhas.length})…`)
        const c = await obterColecaoExportada(l.colecao)
        if (c.exportada && c.csv !== undefined) {
          arquivos.push({ nome: `${l.colecao}.csv`, conteudo: c.csv })
          linhas[i] = { ...l, registros: c.registros }
        } else {
          linhas[i] = {
            ...l,
            exportada: false,
            registros: c.registros,
            motivo: c.motivo ?? 'não exportada',
          }
        }
      }
      const final: ResumoExportacao = {
        ...base,
        completo: linhas
          .filter(
            (l) => !['pcp_dados', 'pcp_lotes', 'pcp_fontes', 'pcp_execucoes'].includes(l.colecao),
          )
          .every((l) => l.exportada),
        linhas,
      }
      arquivos.unshift({ nome: 'resumo.csv', conteudo: resumoParaCsv(final) })
      const agora = new Date()
      const blob = montarZip(arquivos, agora)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dados-american-goodies-${agora.toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setResumo(final)
      setUltima(agora.toLocaleString('pt-BR'))
      setProgresso(null)
      setMsg(
        final.completo
          ? 'Pacote baixado, completo.'
          : 'Pacote baixado, mas incompleto: veja no resumo o que ficou fora do pacote.',
      )
    } catch (e) {
      setProgresso(null)
      erro403(e)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Exportação dos dados</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Baixa os dados do sistema num arquivo só, com uma planilha por assunto e um resumo.
      </p>
      <ComoFunciona>
        <p>
          O arquivo é identificado como dados da American Goodies. Não leva senha, chave nem
          segredo, mas contém dados dos seus clientes e fornecedores: guarde com cuidado e não envie
          por e-mail.
        </p>
        <p>
          As cópias das leituras do Omie e da Nuvemshop entram só como contagem, porque a fonte pode
          ser lida de novo.
        </p>
      </ComoFunciona>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={ver}>
          Ver o resumo
        </Button>
        <Button onClick={baixar} disabled={!!progresso}>
          Baixar o pacote
        </Button>
        {ultima && (
          <span className="self-center text-xs text-muted-foreground">
            Última exportação nesta sessão: {ultima}
          </span>
        )}
      </div>
      {progresso && (
        <p className="text-sm mb-2" role="status">
          {progresso}
        </p>
      )}
      {msg && (
        <p className="text-sm mb-2" role="status">
          {msg}
        </p>
      )}
      {resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Resumo de contagens — {resumo.completo ? 'completo' : 'incompleto'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="text-xs text-muted-foreground">
              {resumo.identificacao} · gerado em{' '}
              {new Date(resumo.gerado_em).toLocaleString('pt-BR')}
            </div>
            {resumo.linhas.map((l) => (
              <div key={l.colecao} className="flex flex-wrap gap-x-3">
                <span className="font-medium">{nomeColecao(l.colecao)}</span>
                <span>{l.registros === null ? '—' : l.registros} registros</span>
                <span>{l.exportada ? 'no pacote' : 'fora do pacote'}</span>
                {l.motivo && (
                  <span className="text-xs text-amber-800">
                    {textoSeguro(l.motivo, 'fora do pacote')}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Exportacao
