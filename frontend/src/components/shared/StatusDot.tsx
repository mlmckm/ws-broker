import { cn } from '@/lib/utils'

interface Props {
  status: 'online' | 'offline' | 'connecting' | 'error'
  className?: string
}

const colors = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  connecting: 'bg-yellow-500 animate-pulse',
  error: 'bg-red-500',
}

export function StatusDot({ status, className }: Props) {
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full', colors[status], className)} />
  )
}
