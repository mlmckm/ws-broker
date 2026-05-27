import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { JsonViewer } from '@/components/shared/JsonViewer'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { api } from '@/hooks/useApi'
import { downloadCsv } from '@/lib/utils'
import { AUDIT_ACTIONS } from '@/lib/constants'

interface AuditLog {
  id: number
  actor_username: string
  action: string
  target_type: string
  target_id: string
  details: unknown
  ip_address: string
  result: string
  created_at: string
}

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const [filters, setFilters] = useState({ actor: '', action: '', from: '', to: '' })

  const fetchLogs = async (p = 0) => {
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      })
      const res = await api.get(`/audit?${params}`)
      setLogs(res.data.logs)
      setTotal(res.data.total)
      setPage(p)
    } catch {}
  }

  useEffect(() => { fetchLogs(0) }, [])

  const handleExport = () => {
    downloadCsv(logs.map(l => ({
      id: l.id, actor: l.actor_username, action: l.action, target_type: l.target_type,
      target_id: l.target_id, ip: l.ip_address, result: l.result, created_at: l.created_at,
    })), 'audit-log.csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm">{total.toLocaleString('tr-TR')} kayıt</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Kullanıcı" value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))} className="w-36" />
        <Select value={filters.action || 'all'} onValueChange={v => setFilters(f => ({ ...f, action: v === 'all' ? '' : v }))}>
          <SelectTrigger className="w-48"><SelectValue placeholder="İşlem tipi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            {AUDIT_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="datetime-local" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="w-48" />
        <Input type="datetime-local" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="w-48" />
        <Button size="sm" onClick={() => fetchLogs(0)}>Ara</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Zaman</th>
                  <th className="p-3 text-left font-medium">Kullanıcı</th>
                  <th className="p-3 text-left font-medium">İşlem</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Hedef</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">IP</th>
                  <th className="p-3 text-left font-medium">Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b hover:bg-accent/30 cursor-pointer" onClick={() => setSelected(log)}>
                    <td className="p-3 text-muted-foreground whitespace-nowrap"><TimeAgo date={log.created_at} /></td>
                    <td className="p-3 font-medium">{log.actor_username}</td>
                    <td className="p-3 font-mono text-xs">{log.action}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell text-xs">
                      {log.target_type && <span>{log.target_type}: </span>}
                      {log.target_id}
                    </td>
                    <td className="p-3 text-muted-foreground hidden lg:table-cell">{log.ip_address}</td>
                    <td className="p-3">
                      <Badge variant={log.result === 'success' ? 'success' : 'destructive'} className="text-xs">
                        {log.result === 'success' ? 'Başarılı' : 'Hata'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Kayıt bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center gap-2 p-4 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => fetchLogs(page - 1)}>Önceki</Button>
            <span className="text-sm text-muted-foreground">Sayfa {page + 1} / {Math.ceil(total / PAGE_SIZE) || 1}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => fetchLogs(page + 1)}>Sonraki</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Kullanıcı:</span> {selected.actor_username}</div>
                <div><span className="text-muted-foreground">IP:</span> {selected.ip_address}</div>
                <div><span className="text-muted-foreground">Hedef:</span> {selected.target_type} {selected.target_id}</div>
                <div><span className="text-muted-foreground">Sonuç:</span> {selected.result}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Zaman:</span> {new Date(selected.created_at).toLocaleString('tr-TR')}</div>
              </div>
              {selected.details != null && (
                <div>
                  <p className="text-muted-foreground mb-2">Detaylar</p>
                  <div className="bg-muted rounded p-3">
                    <JsonViewer data={selected.details as Record<string, unknown>} />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
