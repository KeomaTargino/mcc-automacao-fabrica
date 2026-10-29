import { Outlet, Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { obterPerfil, type RespostaPerfil } from '@/services/pcp-access'
import { obterContadorAlertas } from '@/services/pcp-alertas'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1 rounded-md text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`

/** Itens de menu por área (SPEC-1-001 CA-A2): o menu mostra apenas áreas permitidas. */
const ITENS: { area: string; rotulo: string; rota: string }[] = [
  { area: 'catalogo', rotulo: 'Catálogo', rota: '/catalogo' },
  { area: 'painel', rotulo: 'Painel', rota: '/painel' },
  { area: 'painel', rotulo: 'Qualidade', rota: '/qualidade' },
  { area: 'planejamento', rotulo: 'Planejamento', rota: '/planejamento' },
  { area: 'planejamento', rotulo: 'Parâmetros', rota: '/parametros' },
  { area: 'apontar_producao', rotulo: 'Apontamentos', rota: '/apontamentos' },
  { area: 'conferir_expedicao', rotulo: 'Conferências', rota: '/conferencias' },
  { area: 'painel', rotulo: 'Sugestões', rota: '/sugestoes' },
  { area: 'painel', rotulo: 'Consolidações', rota: '/consolidacoes' },
  { area: 'painel', rotulo: 'Alertas', rota: '/alertas' },
  { area: 'painel', rotulo: 'Envio ao Omie', rota: '/envio-omie' },
  { area: 'compras', rotulo: 'Fornecedores', rota: '/fornecedores' },
  { area: 'compras', rotulo: 'Conversões', rota: '/conversoes' },
  { area: 'compras', rotulo: 'Histórico de preços', rota: '/compras/historico' },
  { area: 'compras', rotulo: 'Requisições', rota: '/compras/requisicoes' },
  { area: 'compras', rotulo: 'Entregas', rota: '/compras/entregas' },
  { area: 'recebimento', rotulo: 'Recebimentos', rota: '/recebimentos' },
  { area: 'faturamento', rotulo: 'Unidades', rota: '/unidades' },
  { area: 'faturamento', rotulo: 'Preparação', rota: '/pedidos/preparacao' },
  { area: 'faturamento', rotulo: 'Pedidos manuais', rota: '/pedidos/manuais' },
]

// Demonstração (task 556da315): em modo demo, o item Conferências aparece para
// qualquer conta autenticada com painel (a rota /conferencias também usa painel
// no guard). Removido na task d77447ab (uso real volta a conferir_expedicao).
const ITENS_DEMO = ITENS.map((i) =>
  DEMO_CONFERENCIA && i.rota === '/conferencias' ? { ...i, area: 'painel' } : i,
)

// Demonstração (task 556da315, recorte sintético): permite visualizar /conferencias
// com a conta atual sem ampliar acesso real — o botão "Conferir" permanece inativo
// quando o perfil não tem a ação conferir_expedicao. Removido na task d77447ab (uso real).
export const DEMO_CONFERENCIA = true

export default function Layout() {
  const { user, isAuthenticated, signOut } = useAuth()
  const [areas, setAreas] = useState<string[] | null>(null)
  const [alertasAbertos, setAlertasAbertos] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) {
      setAreas(null)
      return
    }
    let vivo = true
    obterPerfil()
      .then((r: RespostaPerfil) => {
        if (vivo) setAreas(r.perfil ? r.perfil.areas : [])
        obterContadorAlertas()
          .then((c) => {
            if (vivo) setAlertasAbertos(c.abertos)
          })
          .catch(() => {})
      })
      .catch(() => {
        if (vivo) setAreas([])
      })
    return () => {
      vivo = false
    }
  }, [isAuthenticated])

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/" className="font-semibold">
            PCP American Goodies
          </Link>
          <nav className="flex gap-2" aria-label="Navegação principal">
            {isAuthenticated &&
              areas !== null &&
              ITENS_DEMO.filter((i) => areas.includes(i.area)).map((i) => (
                <NavLink key={i.rota} to={i.rota} className={navLinkClass}>
                  {i.rotulo}
                  {i.rota === '/alertas' && alertasAbertos > 0 ? ` (${alertasAbertos})` : ''}
                </NavLink>
              ))}
          </nav>
          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sair
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="flex flex-col flex-1">
        <Outlet />
      </main>
    </div>
  )
}
