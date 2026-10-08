import { ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { obterPerfil, type RespostaPerfil } from '@/services/pcp-access'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type EstadoAcesso = 'carregando' | 'sem_perfil' | 'perfil_inativo' | 'sem_permissao' | 'autorizado'

/**
 * Guarda de área (SPEC-1-001 CA-A2/A3): exige sessão válida e perfil com a área.
 * A decisão vem do servidor (rota /backend/v1/pcp/perfil) — nunca do navegador.
 * Sessão expirada/revogada (401) limpa o estado e pede login.
 */
export default function ProtectedArea({ area, children }: { area: string; children: ReactNode }) {
  const { isAuthenticated, loading: authLoading, signOut } = useAuth()
  const [estado, setEstado] = useState<EstadoAcesso>('carregando')

  useEffect(() => {
    if (!isAuthenticated) return
    let vivo = true
    obterPerfil()
      .then((r: RespostaPerfil) => {
        if (!vivo) return
        if (r.perfil && r.perfil.areas.includes(area)) setEstado('autorizado')
        else if (r.motivo === 'perfil_inativo') setEstado('perfil_inativo')
        else if (r.perfil) setEstado('sem_permissao')
        else setEstado('sem_perfil')
      })
      .catch((err: any) => {
        if (!vivo) return
        if (err?.status === 401) {
          signOut() // token expirado/revogado: limpa e volta ao login
        } else {
          setEstado('sem_perfil')
        }
      })
    return () => {
      vivo = false
    }
  }, [isAuthenticated, area, signOut])

  if (authLoading || !isAuthenticated) {
    if (!authLoading && !isAuthenticated) return <Navigate to="/login" replace />
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground" role="status">
          Carregando…
        </p>
      </div>
    )
  }

  if (estado === 'autorizado') return <>{children}</>

  const mensagens: Record<Exclude<EstadoAcesso, 'carregando' | 'autorizado'>, string> = {
    sem_perfil:
      'Acesso pendente — seu usuário ainda não possui perfil cadastrado. Fale com o responsável.',
    perfil_inativo: 'Acesso pendente — seu perfil está inativo. Fale com o responsável.',
    sem_permissao: 'Acesso não autorizado — seu perfil não contempla esta área.',
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" role="alert">
            {mensagens[estado as Exclude<EstadoAcesso, 'carregando' | 'autorizado'>]}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
