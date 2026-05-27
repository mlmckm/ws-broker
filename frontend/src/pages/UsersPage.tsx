import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/constants'

interface User {
  id: number
  username: string
  role: 'admin' | 'viewer' | 'client'
  created_at: string
  last_seen: string
  active_connections: number
}

export default function UsersPage() {
  const { isAdmin } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPassword, setShowPassword] = useState<User | null>(null)
  const [showRoleEdit, setShowRoleEdit] = useState<User | null>(null)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'client' })
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('')

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users')
      setUsers(res.data.users)
    } catch {}
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async () => {
    try {
      await api.post('/users', newUser)
      toast({ title: 'Kullanıcı oluşturuldu' })
      setShowAdd(false)
      setNewUser({ username: '', password: '', role: 'client' })
      fetchUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Hata'
      toast({ title: msg, variant: 'destructive' })
    }
  }

  const handlePasswordChange = async () => {
    if (!showPassword) return
    try {
      await api.patch(`/users/${showPassword.id}`, { password: newPassword })
      toast({ title: 'Şifre güncellendi' })
      setShowPassword(null)
      setNewPassword('')
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleRoleChange = async () => {
    if (!showRoleEdit) return
    try {
      await api.patch(`/users/${showRoleEdit.id}`, { role: newRole })
      toast({ title: 'Rol güncellendi' })
      setShowRoleEdit(null)
      fetchUsers()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`)
      toast({ title: 'Kullanıcı silindi' })
      fetchUsers()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const strengthColor = (p: string) => {
    if (p.length >= 12) return 'bg-green-500'
    if (p.length >= 8) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm">{users.length} kullanıcı</p>
        </div>
        {isAdmin() && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />Yeni Kullanıcı
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Kullanıcı Adı</th>
                  <th className="p-3 text-left font-medium">Rol</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Oluşturulma</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Son Görülme</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Aktif Bağlantı</th>
                  <th className="p-3 text-left font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b hover:bg-accent/30">
                    <td className="p-3 font-medium">{user.username}</td>
                    <td className="p-3">
                      <Badge className={ROLES[user.role]?.color}>{ROLES[user.role]?.label}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">
                      <TimeAgo date={user.created_at} />
                    </td>
                    <td className="p-3 text-muted-foreground hidden lg:table-cell">
                      {user.last_seen ? <TimeAgo date={user.last_seen} /> : '—'}
                    </td>
                    <td className="p-3 hidden lg:table-cell">{user.active_connections}</td>
                    <td className="p-3">
                      {isAdmin() && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowPassword(user); setNewPassword('') }} title="Şifre Değiştir">
                            <KeyRound className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowRoleEdit(user); setNewRole(user.role) }} title="Rol Değiştir">
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
                                <AlertDialogTitle>Kullanıcı silinsin mi?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{user.username}" kullanıcısı ve aktif bağlantıları silinecek. Bu işlem geri alınamaz.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>İptal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(user.id)}>Sil</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add User */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yeni Kullanıcı</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kullanıcı Adı (3-50 karakter)</Label>
              <Input value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} placeholder="kullanici-adi" />
            </div>
            <div className="space-y-2">
              <Label>Şifre (min 8 karakter)</Label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
              {newUser.password && (
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 rounded flex-1 ${strengthColor(newUser.password)}`} />
                  <span className="text-xs text-muted-foreground">{newUser.password.length < 8 ? 'Zayıf' : newUser.password.length < 12 ? 'Orta' : 'Güçlü'}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(u => ({ ...u, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>İptal</Button>
            <Button onClick={handleCreate} disabled={!newUser.username || newUser.password.length < 8}>Oluştur</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change */}
      <Dialog open={!!showPassword} onOpenChange={() => setShowPassword(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Şifre Değiştir — {showPassword?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Yeni Şifre</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPassword(null)}>İptal</Button>
            <Button onClick={handlePasswordChange} disabled={newPassword.length < 8}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Edit */}
      <Dialog open={!!showRoleEdit} onOpenChange={() => setShowRoleEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rol Değiştir — {showRoleEdit?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleEdit(null)}>İptal</Button>
            <Button onClick={handleRoleChange}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
