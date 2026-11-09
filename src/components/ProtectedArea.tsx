import { ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { obterPerfil, verificarPrimeiraSenha, type RespostaPerfil } from '@/services/pcp-access'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type EstadoAcesso =
  | 'carregando'
  | 'trocar_senha'
  | 'sem_perfil'
  | 'perfil_inativo'
  | 'sem_permissao'
  | 'autorizado'

/**
 * Guarda de área (SPEC-1-001 CA-A2/A3) com troca obrigatória de senha (SPEC-2-000 49327a88):
 * exige sessão válida e perfil com a área; contas com senha inicial não trocada vão para
 * /trocar-senha antes de qualquer tela. A decisão vem do servidor (/backend/v1/pcp/perfil).
 */
export default function ProtectedArea({ area, children }: { area: string; children: ReactNode }) {
  const { isAuthenticated, loading: authLoading, signOut } = useAuth()
  const [estado, setEstado] = useState<EstadoAcesso>('carregando')

  useEffect(() => {
    if (!isAuthenticated) return
    let vivo = true
    Promise.all([obterPerfil(), verificarPrimeiraSenha().catch(() => null)])
      .then(([r, primeira]) => {
        if (!vivo) return
        const perfilRes = r as RespostaPerfil
        if (primeira && primeira.exige_troca) {
          setEstado('trocar_senha')
          return
        }
        // `area` aceita alternativas separadas por "|" (ex.: "conferir_expedicao|painel") e "*" para
        // qualquer perfil ativo (tela inicial, SPEC-4-003).
        const aceitas = area.split('|')
        if (
          perfilRes.perfil &&
          (aceitas.includes('*') || aceitas.some((a) => perfilRes.perfil!.areas.includes(a)))
        )
          setEstado('autorizado')
        else if (perfilRes.motivo === 'perfil_inativo') setEstado('perfil_inativo')
        else if (perfilRes.perfil) setEstado('sem_permissao')
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

  if (estado === 'trocar_senha') {
    return <Navigate to="/trocar-senha" replace />
  }

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
    trocar_senha: 'Troque a senha inicial para continuar.',
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
