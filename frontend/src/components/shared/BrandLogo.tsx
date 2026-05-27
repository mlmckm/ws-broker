import { cn } from '@/lib/utils'
import { APP_NAME, LOGO_URL } from '@/lib/branding'

interface Props {
  showName?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const heights = { sm: 'h-6', md: 'h-8', lg: 'h-10' }
const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-xl' }

export function BrandLogo({ showName = true, size = 'md', className }: Props) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <img
        src={LOGO_URL}
        alt={APP_NAME}
        className={cn(heights[size], 'w-auto max-w-[140px] object-contain flex-shrink-0')}
      />
      {showName && (
        <span className={cn('font-bold truncate', textSizes[size])}>{APP_NAME}</span>
      )}
    </div>
  )
}
