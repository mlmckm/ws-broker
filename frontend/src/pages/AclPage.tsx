import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, TestTube2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'

interface AclRule {
  id: number
  username: string | null
  topic_pattern: string
  action: string
  permission: string
  priority: number
}

const empty = { username: '', topic_pattern: '', action: 'both', permission: 'allow', priority: 0 }

export default function AclPage() {
  const { isAdmin } = useAuthStore()
  const [rules, setRules] = useState<AclRule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AclRule | null>(null)
  const [form, setForm] = useState(empty)
  const [testForm, setTestForm] = useState({ username: '', topic: '', action: 'publish' })
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null)
  const [showTest, setShowTest] = useState(false)

  const fetchRules = async () => {
    try {
      const res = await api.get('/acl')
      setRules(res.data.rules)
    } catch {}
  }

  useEffect(() => { fetchRules() }, [])

  const openEdit = (rule: AclRule) => {
    setEditing(rule)
    setForm({ username: rule.username || '', topic_pattern: rule.topic_pattern, action: rule.action, permission: rule.permission, priority: rule.priority })
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/acl/${editing.id}`, { ...form, username: form.username || null })
      } else {
        await api.post('/acl', { ...form, username: form.username || null })
      }
      toast({ title: editing ? 'Kural güncellendi' : 'Kural eklendi' })
      setShowForm(false)
      setEditing(null)
      setForm(empty)
      fetchRules()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/acl/${id}`)
      toast({ title: 'Kural silindi' })
      fetchRules()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleTest = async () => {
    try {
      const res = await api.post('/acl/test', testForm)
      setTestResult(res.data)
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ACL Kuralları</h1>
          <p className="text-muted-foreground text-sm">{rules.length} kural</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTest(true)}>
            <TestTube2 className="h-4 w-4 mr-1" />ACL Test
          </Button>
          {isAdmin() && (
            <Button size="sm" onClick={() => { setEditing(null); setForm(empty); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-1" />Yeni Kural
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Priority</th>
                  <th className="p-3 text-left font-medium">Kullanıcı</th>
                  <th className="p-3 text-left font-medium">Topic Pattern</th>
                  <th className="p-3 text-left font-medium">Action</th>
                  <th className="p-3 text-left font-medium">Permission</th>
                  <th className="p-3 text-left font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className="border-b hover:bg-accent/30">
                    <td className="p-3 font-mono">{rule.priority}</td>
                    <td className="p-3">{rule.username || <span className="text-muted-foreground italic">Tüm Kullanıcılar</span>}</td>
                    <td className="p-3 font-mono text-xs">{rule.topic_pattern}</td>
                    <td className="p-3">
                      <Badge variant="outline">{rule.action}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={rule.permission === 'allow' ? 'success' : 'destructive'}>
                        {rule.permission === 'allow' ? 'İzin Ver' : 'Engelle'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {isAdmin() && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Kural silinsin mi?</AlertDialogTitle>
                                <AlertDialogDescription>Bu kural kalıcı olarak silinecek.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>İptal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(rule.id)}>Sil</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Kural yok — tüm erişimler varsayılan olarak açık</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rule Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Kural Düzenle' : 'Yeni Kural'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kullanıcı (boş = tüm kullanıcılar)</Label>
              <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="esp32-salon" />
            </div>
            <div className="space-y-2">
              <Label>Topic Pattern</Label>
              <Input value={form.topic_pattern} onChange={e => setForm(f => ({ ...f, topic_pattern: e.target.value }))} placeholder="ev/salon/#" />
              <p className="text-xs text-muted-foreground">Wildcard: + (tek segment), # (çok seviye)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Her İkisi</SelectItem>
                    <SelectItem value="publish">Publish</SelectItem>
                    <SelectItem value="subscribe">Subscribe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Permission</Label>
                <Select value={form.permission} onValueChange={v => setForm(f => ({ ...f, permission: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">İzin Ver</SelectItem>
                    <SelectItem value="deny">Engelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority (yüksek = önce uygulanır)</Label>
              <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={!form.topic_pattern}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACL Test */}
      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent>
          <DialogHeader><DialogTitle>ACL Test Aracı</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kullanıcı Adı</Label>
              <Input value={testForm.username} onChange={e => setTestForm(f => ({ ...f, username: e.target.value }))} placeholder="esp32-salon" />
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={testForm.topic} onChange={e => setTestForm(f => ({ ...f, topic: e.target.value }))} placeholder="ev/salon/sicaklik" />
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={testForm.action} onValueChange={v => setTestForm(f => ({ ...f, action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publish">Publish</SelectItem>
                  <SelectItem value="subscribe">Subscribe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {testResult && (
              <div className={`p-4 rounded-lg text-sm ${testResult.allowed ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                <p className="font-bold">{testResult.allowed ? '✓ İzin verildi' : '✗ Erişim reddedildi'}</p>
                <p className="text-xs mt-1">{testResult.reason}</p>
              </div>
            )}
            <Button onClick={handleTest} disabled={!testForm.username || !testForm.topic} className="w-full">Test Et</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
