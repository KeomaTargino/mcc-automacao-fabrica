import type { ReactNode } from 'react'

// Ação principal do chão de fábrica (SPEC-4-006): no celular fica fixa no rodapé, na largura toda, com
// área de toque de 48 px; a partir do tablet volta para o lugar normal. O espaço abaixo evita cobrir o fim da tela.
export default function RodapeFixo({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:border-t max-md:bg-background max-md:p-3 max-md:[&>*]:h-12 max-md:[&>*]:w-full">
        {children}
      </div>
    </>
  )
}
