import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { obterPerfil, type RespostaPerfil } from '@/services/pcp-access'
import { obterContadorAlertas } from '@/services/pcp-alertas'
import {
  MENSAGEM_SEM_ACESSO,
  dataPorExtenso,
  menuDaPessoa,
  saudacaoCompleta,
  temPainel,
} from '@/lib/pcp/menu'
import { Skeleton } from '@/components/ui/skeleton'

// Tela inicial (SPEC-4-003): saudação, data, alertas abertos (só para quem tem painel) e os atalhos
// das áreas da pessoa. Nenhum número novo é calculado.
const Index = () => {
  const { user } = useAuth()
  const [areas, setAreas] = useState<string[] | null>(null)
  const [alertas, setAlertas] = useState<number | null>(null)
  const [erro, setErro] = useState(false)
  const agora = new Date()

  useEffect(() => {
    let vivo = true
    obterPerfil()
      .then((r: RespostaPerfil) => {
        if (!vivo) return
        const minhas = r.perfil ? r.perfil.areas : []
        setAreas(minhas)
        if (temPainel(minhas))
          obterContadorAlertas()
            .then((c) => vivo && setAlertas(c.abertos))
            .catch(() => vivo && setErro(true))
      })
      .catch(() => {
        if (vivo) {
          setAreas([])
          setErro(true)
        }
      })
    return () => {
      vivo = false
    }
  }, [])

  const { grupos } = menuDaPessoa(areas)

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-1">{saudacaoCompleta(agora, user?.name)}</h1>
      <p className="text-sm text-muted-foreground mb-6 capitalize" data-subtitulo>
        {dataPorExtenso(agora)}
      </p>

      {areas !== null && areas.length === 0 && (
        <p className="text-sm" role="status">
          {MENSAGEM_SEM_ACESSO}
        </p>
      )}

      {temPainel(areas) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Alertas abertos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {erro ? (
              <p role="alert">Não foi possível carregar os alertas.</p>
            ) : alertas === null ? (
              <Skeleton className="h-24 w-full" aria-label="Carregando" />
            ) : (
              <p>
                <strong>{alertas}</strong> {alertas === 1 ? 'alerta aberto' : 'alertas abertos'}.
              </p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/alertas">Ver alertas</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {grupos.map(({ grupo, itens }) => (
          <section key={grupo}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{grupo}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itens.map((i) => (
                <Link
                  key={i.rota}
                  to={i.rota}
                  className="rounded-md border px-4 py-3 text-sm hover:bg-accent"
                >
                  {i.rotulo}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default Index
