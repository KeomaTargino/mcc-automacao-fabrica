import { LOGO_MR_CHENEY } from '@/lib/pcp/logoMrCheney'

// Marca (SPEC-4-002): logo do Mr. Cheney sobre um quadro creme, para aparecer bem no menu marrom e no login.
export default function Marca({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-[#F6E7C9] p-1 ${className}`}
    >
      <img src={LOGO_MR_CHENEY} alt="Mr. Cheney cookies" className="h-full w-full object-contain" />
    </span>
  )
}
