import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface Props {
  date: string | Date
  className?: string
}

export function TimeAgo({ date, className }: Props) {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  return (
    <span className={className} title={d.toLocaleString('tr-TR')}>
      {formatDistanceToNow(d, { addSuffix: true, locale: tr })}
    </span>
  )
}
