import { LOGO_MR_CHENEY } from '@/lib/pcp/logoMrCheney'

// Marca (SPEC-4-002): logo do Mr. Cheney sem fundo. O logo é preto; sobre fundo escuro (menu marrom)
// use `claro` para mostrá-lo em branco.
export default function Marca({
  className = 'h-10 w-10',
  claro = false,
}: {
  className?: string
  claro?: boolean
}) {
  return (
    <img
      src={LOGO_MR_CHENEY}
      alt="Mr. Cheney cookies"
      className={`object-contain ${claro ? 'invert' : ''} ${className}`}
    />
  )
}
