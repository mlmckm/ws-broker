import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  data: unknown
  className?: string
  collapsed?: boolean
}

export function JsonViewer({ data, className, collapsed = false }: Props) {
  const [expanded, setExpanded] = useState(!collapsed)

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return <JsonViewer data={parsed} className={className} collapsed={collapsed} />
    } catch {
      return <span className={cn('font-mono text-sm text-green-600 dark:text-green-400', className)}>"{data}"</span>
    }
  }

  if (data === null) return <span className="font-mono text-sm text-gray-400">null</span>
  if (typeof data === 'boolean') return <span className="font-mono text-sm text-blue-500">{String(data)}</span>
  if (typeof data === 'number') return <span className="font-mono text-sm text-orange-500">{data}</span>

  if (typeof data === 'object') {
    const isArray = Array.isArray(data)
    const entries: [string | number, unknown][] = isArray
      ? (data as unknown[]).map((v, i) => [i, v])
      : Object.entries(data as Record<string, unknown>)

    return (
      <div className={cn('font-mono text-sm', className)}>
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 hover:opacity-70">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-muted-foreground">{isArray ? `[${entries.length}]` : `{${entries.length}}`}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-3">
            {entries.map(([key, val]) => (
              <div key={String(key)} className="my-0.5">
                <span className="text-blue-600 dark:text-blue-400">"{String(key)}"</span>
                <span className="text-muted-foreground">: </span>
                <JsonViewer data={val} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return <span className="font-mono text-sm">{String(data)}</span>
}
