import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  ChartLine,
  ChevronDown,
  CircleUser,
  ClipboardCheck,
  ClipboardPen,
  Download,
  FilePlus,
  FileText,
  House,
  Layers,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Package,
  PackageCheck,
  PackageOpen,
  Send,
  SlidersHorizontal,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import Marca from '@/components/Marca'
import { obterPerfil, type RespostaPerfil } from '@/services/pcp-access'
import { obterContadorAlertas } from '@/services/pcp-alertas'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  MENSAGEM_SEM_ACESSO,
  grupoDaRota,
  menuDaPessoa,
  temPainel,
  tituloDaRota,
  type ItemMenu,
} from '@/lib/pcp/menu'

const ICONES: Record<string, LucideIcon> = {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  ChartLine,
  ClipboardCheck,
  ClipboardPen,
  Download,
  FilePlus,
  FileText,
  House,
  Layers,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Package,
  PackageCheck,
  PackageOpen,
  Send,
  SlidersHorizontal,
  Store,
  Truck,
}

const CHAVE_GRUPOS = 'pcp_menu_grupos' // só preferência de tela, não é dado

const lerPreferencia = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_GRUPOS) || '{}') || {}
  } catch {
    return {}
  }
}

function Item({ item, pathname }: { item: ItemMenu; pathname: string }) {
  const { setOpenMobile } = useSidebar()
  const Icone = ICONES[item.icone] ?? House
  const ativo =
    item.rota === '/'
      ? pathname === '/'
      : pathname === item.rota || pathname.startsWith(item.rota + '/')
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={ativo} tooltip={item.rotulo}>
        <NavLink to={item.rota} onClick={() => setOpenMobile(false)}>
          <Icone />
          <span>{item.rotulo}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function Menu({ areas, pathname }: { areas: string[] | null; pathname: string }) {
  const { state, isMobile } = useSidebar()
  const [preferencia, setPreferencia] = useState<Record<string, boolean>>(lerPreferencia)
  const { inicio, grupos } = menuDaPessoa(areas)
  const grupoAtual = grupoDaRota(pathname)
  const recolhido = state === 'collapsed' && !isMobile

  const alternar = (g: string, aberto: boolean) => {
    const novo = { ...preferencia, [g]: aberto }
    setPreferencia(novo)
    try {
      localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(novo))
    } catch {
      // sem armazenamento: a escolha vale só nesta tela
    }
  }

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <Item item={inicio} pathname={pathname} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {areas !== null && areas.length === 0 && (
        <p className="px-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {MENSAGEM_SEM_ACESSO}
        </p>
      )}
      {grupos.map(({ grupo, itens }) => {
        // O grupo da tela aberta fica aberto; os outros começam fechados. No menu recolhido, todos mostram os ícones.
        const aberto = recolhido || (preferencia[grupo] ?? grupo === grupoAtual)
        return (
          <Collapsible key={grupo} open={aberto} onOpenChange={(v) => alternar(grupo, v)}>
            <SidebarGroup className="py-0">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel asChild>
                  <button type="button" className="w-full justify-between hover:bg-sidebar-accent">
                    <span>{grupo}</span>
                    <ChevronDown
                      className={
                        aberto ? 'rotate-180 transition-transform' : 'transition-transform'
                      }
                    />
                  </button>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {itens.map((i) => (
                      <Item key={i.rota} item={i} pathname={pathname} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )
      })}
    </SidebarContent>
  )
}

export default function Layout() {
  const { user, isAuthenticated, signOut } = useAuth()
  const { pathname } = useLocation()
  const [areas, setAreas] = useState<string[] | null>(null)
  const [alertasAbertos, setAlertasAbertos] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setAreas(null)
      return
    }
    let vivo = true
    obterPerfil()
      .then((r: RespostaPerfil) => {
        if (!vivo) return
        const minhas = r.perfil ? r.perfil.areas : []
        setAreas(minhas)
        if (temPainel(minhas))
          obterContadorAlertas()
            .then((c) => {
              if (vivo) setAlertasAbertos(c.abertos)
            })
            .catch(() => {
              if (vivo) setAlertasAbertos(null) // falha: o sino fica sem número
            })
      })
      .catch(() => {
        if (vivo) setAreas([])
      })
    return () => {
      vivo = false
    }
  }, [isAuthenticated])

  if (!isAuthenticated) return <Outlet />

  const nome = String(user?.name || '').trim() || String(user?.email || '')

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            to="/"
            className="px-2 py-1 text-sm font-semibold group-data-[collapsible=icon]:hidden"
          >
            PCP American Goodies
          </Link>
        </SidebarHeader>
        <Menu areas={areas} pathname={pathname} />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-clip">
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label="Abrir ou recolher o menu" />
          <h2 className="flex-1 truncate text-sm font-medium">{tituloDaRota(pathname)}</h2>
          {temPainel(areas) && (
            <Button asChild variant="ghost" size="sm" aria-label="Alertas abertos">
              <Link to="/alertas">
                <Bell className="h-4 w-4" />
                {alertasAbertos !== null && alertasAbertos > 0 && (
                  <span className="ml-1 text-xs font-medium">{alertasAbertos}</span>
                )}
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Menu da pessoa">
                <CircleUser className="h-4 w-4" />
                <span className="ml-1 hidden max-w-[10rem] truncate text-xs sm:inline">{nome}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-[16rem] truncate">{nome}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/trocar-senha">Trocar senha</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
