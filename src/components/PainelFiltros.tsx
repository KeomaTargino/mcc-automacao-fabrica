import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

// Filtros (SPEC-4-006): no tablet e no computador ficam na tela; no celular abrem num painel pelo botão "Filtros".
export default function PainelFiltros({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{children}</div>
      <div className="mb-4 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">{children}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
