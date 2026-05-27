import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, Pin, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrokerStore } from '@/store/brokerStore'
import { TimeAgo } from '@/components/shared/TimeAgo'

interface TreeNode {
  name: string
  fullTopic: string
  children: Map<string, TreeNode>
  subscribers: number
  retained: boolean
  last_message_at?: string
}

function buildTree(topics: Array<{ topic: string; subscribers: number; retained: boolean; last_message_at?: string }>) {
  const root = new Map<string, TreeNode>()

  for (const t of topics) {
    const parts = t.topic.split('/')
    let current = root
    let path = ''

    for (let i = 0; i < parts.length; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i]
      if (!current.has(parts[i])) {
        current.set(parts[i], {
          name: parts[i],
          fullTopic: path,
          children: new Map(),
          subscribers: 0,
          retained: false,
        })
      }
      const node = current.get(parts[i])!
      if (i === parts.length - 1) {
        node.subscribers = t.subscribers
        node.retained = t.retained
        node.last_message_at = t.last_message_at
      }
      current = node.children
    }
  }

  return root
}

function TreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.size > 0

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 rounded hover:bg-accent cursor-pointer text-sm group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren ? setExpanded(e => !e) : navigate(`/messages?topic=${encodeURIComponent(node.fullTopic)}`)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        <span className="flex-1 font-medium truncate">{node.name}</span>
        {node.retained && <span title="Retained"><Pin className="h-3 w-3 text-orange-500 flex-shrink-0" /></span>}
        {node.subscribers > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />{node.subscribers}
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {Array.from(node.children.values()).map(child => (
            <TreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function TopicTree() {
  const { topics } = useBrokerStore()
  const tree = buildTree(topics)

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Topic Ağacı</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full p-2">
          {tree.size === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Aktif topic yok
            </div>
          ) : (
            Array.from(tree.values()).map(node => (
              <TreeNode key={node.name} node={node} />
            ))
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
