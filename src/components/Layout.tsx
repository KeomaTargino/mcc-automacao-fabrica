import { Outlet, Link, NavLink } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1 rounded-md text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold">
            PCP American Goodies
          </Link>
          <nav className="flex gap-2" aria-label="Navegação principal">
            <NavLink to="/catalogo" className={navLinkClass}>
              Catálogo
            </NavLink>
            <NavLink to="/painel" className={navLinkClass}>
              Painel
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex flex-col flex-1">
        <Outlet />
      </main>
    </div>
  )
}
