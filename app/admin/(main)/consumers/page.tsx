"use client"

import { useState, useEffect } from "react"
import { toast } from 'sonner'
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  UserCheck, 
  UserX,
  Shield,
  Database,
  Loader2,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Eye,
  Key,
  UserCog,
  Lock,
  Server
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

// Database user type
interface DBUser {
  username: string
  can_create_db: boolean
  can_create_role: boolean
  is_superuser: boolean
  is_replication: boolean
  bypass_rls: boolean
  has_password: boolean
  password_expiry: string | null
}

interface UserFormData {
  username: string
  password: string
  can_create_db: boolean
  can_create_role: boolean
  is_superuser: boolean
  is_replication: boolean
  bypass_rls: boolean
}

export default function ConsumersPage() {
  const [users, setUsers] = useState<DBUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    can_create_db: false,
    can_create_role: false,
    is_superuser: false,
    is_replication: false,
    bypass_rls: false
  })
  const [editingUser, setEditingUser] = useState<DBUser | null>(null)

  // Fetch database users
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/db-users')
      const data = await response.json()
      
      if (data.success) {
        setUsers(data.users)
      } else {
        toast.error(data.error || 'Failed to fetch database users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to fetch database users')
    } finally {
      setLoading(false)
    }
  }

  const refreshUsers = async () => {
    setRefreshing(true)
    await fetchUsers()
    setRefreshing(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Create user
  const handleCreateUser = async () => {
    if (!formData.username || !formData.password) {
      toast.error('Username and password are required')
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/db-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`User ${formData.username} created successfully`)
        setIsCreateDialogOpen(false)
        resetForm()
        await fetchUsers()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create user')
    } finally {
      setIsCreating(false)
    }
  }

  // Update user
  const handleUpdateUser = async () => {
    if (!editingUser) return

    setIsUpdating(true)
    try {
      const response = await fetch('/api/db-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editingUser.username,
          new_password: formData.password,
          can_create_db: formData.can_create_db,
          can_create_role: formData.can_create_role,
          is_superuser: formData.is_superuser,
          is_replication: formData.is_replication,
          bypass_rls: formData.bypass_rls
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`User ${editingUser.username} updated successfully`)
        setIsEditDialogOpen(false)
        resetForm()
        await fetchUsers()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update user')
    } finally {
      setIsUpdating(false)
    }
  }

  // Delete user
  const handleDeleteUser = async () => {
    if (!selectedUser) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/db-users?username=${selectedUser.username}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`User ${selectedUser.username} deleted successfully`)
        setIsDeleteDialogOpen(false)
        setSelectedUser(null)
        await fetchUsers()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user')
    } finally {
      setIsDeleting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      can_create_db: false,
      can_create_role: false,
      is_superuser: false,
      is_replication: false,
      bypass_rls: false
    })
    setEditingUser(null)
  }

  const openEditDialog = (user: DBUser) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      can_create_db: user.can_create_db,
      can_create_role: user.can_create_role,
      is_superuser: user.is_superuser,
      is_replication: user.is_replication,
      bypass_rls: user.bypass_rls
    })
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (user: DBUser) => {
    setSelectedUser(user)
    setIsDeleteDialogOpen(true)
  }

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && user.has_password) ||
      (statusFilter === "inactive" && !user.has_password)
    return matchesSearch && matchesStatus
  })

  const getInitials = (username: string) => {
    return username.substring(0, 2).toUpperCase()
  }

  const getPermissionBadges = (user: DBUser) => {
    const badges = []
    
    if (user.is_superuser) {
      badges.push(<Badge key="superuser" className="bg-purple-100 text-purple-800">Superuser</Badge>)
    }
    if (user.can_create_db) {
      badges.push(<Badge key="createdb" className="bg-blue-100 text-blue-800">Create DB</Badge>)
    }
    if (user.can_create_role) {
      badges.push(<Badge key="createrole" className="bg-indigo-100 text-indigo-800">Create Role</Badge>)
    }
    if (user.is_replication) {
      badges.push(<Badge key="replication" className="bg-orange-100 text-orange-800">Replication</Badge>)
    }
    if (user.bypass_rls) {
      badges.push(<Badge key="bypassrls" className="bg-pink-100 text-pink-800">Bypass RLS</Badge>)
    }
    
    if (badges.length === 0) {
      badges.push(<Badge key="standard" variant="secondary" className="bg-gray-100 text-gray-800">Standard User</Badge>)
    }
    
    return badges
  }

  const getLoginStatusBadge = (user: DBUser) => {
    if (user.has_password) {
      return <Badge className="bg-green-100 text-green-800">Active</Badge>
    }
    return <Badge variant="secondary" className="bg-red-100 text-red-800">Inactive</Badge>
  }

  const activeCount = users.filter(u => u.has_password).length
  const inactiveCount = users.filter(u => !u.has_password).length
  const superuserCount = users.filter(u => u.is_superuser).length

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Consumers</h1>
          <p className="text-sm text-muted-foreground">
            Manage database consumers and their access permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshUsers} disabled={refreshing} variant="outline" className="gap-2">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Consumer
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Consumers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Registered consumers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Has password set</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inactiveCount}</div>
            <p className="text-xs text-muted-foreground">No password set</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Superusers</CardTitle>
            <Shield className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{superuserCount}</div>
            <p className="text-xs text-muted-foreground">Full system access</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search consumers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="active">Active (Has Password)</SelectItem>
                  <SelectItem value="inactive">Inactive (No Password)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>Consumers List</CardTitle>
          <CardDescription>
            Showing {filteredUsers.length} of {users.length} consumers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div
                key={user.username}
                className="flex items-center justify-between rounded-lg border p-4 transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{user.username}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {getLoginStatusBadge(user)}
                      {getPermissionBadges(user)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => {
                        setSelectedUser(user)
                        setIsViewDialogOpen(true)
                      }}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(user)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit User
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => openDeleteDialog(user)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Consumer</DialogTitle>
            <DialogDescription>
              Create a new database consumer with specific permissions
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                placeholder="Enter username"
                className="mt-1"
                disabled={isCreating}
              />
            </div>
            
            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="Enter password"
                className="mt-1"
                disabled={isCreating}
              />
            </div>
            
            <div className="space-y-3">
              <Label className="font-semibold">Permissions</Label>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="is_superuser"
                    checked={formData.is_superuser}
                    onChange={(e) => setFormData({...formData, is_superuser: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isCreating}
                  />
                  <Label htmlFor="is_superuser" className="text-sm font-normal flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-600" />
                    Superuser
                  </Label>
                  <span className="text-xs text-muted-foreground">(Full system access)</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="can_create_db"
                    checked={formData.can_create_db}
                    onChange={(e) => setFormData({...formData, can_create_db: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isCreating}
                  />
                  <Label htmlFor="can_create_db" className="text-sm font-normal flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    Create Database
                  </Label>
                  <span className="text-xs text-muted-foreground">(Can create new databases)</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="can_create_role"
                    checked={formData.can_create_role}
                    onChange={(e) => setFormData({...formData, can_create_role: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isCreating}
                  />
                  <Label htmlFor="can_create_role" className="text-sm font-normal flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-indigo-600" />
                    Create Role
                  </Label>
                  <span className="text-xs text-muted-foreground">(Can create new roles/users)</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="is_replication"
                    checked={formData.is_replication}
                    onChange={(e) => setFormData({...formData, is_replication: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isCreating}
                  />
                  <Label htmlFor="is_replication" className="text-sm font-normal flex items-center gap-2">
                    <Server className="h-4 w-4 text-orange-600" />
                    Replication
                  </Label>
                  <span className="text-xs text-muted-foreground">(Initiates streaming replication)</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="bypass_rls"
                    checked={formData.bypass_rls}
                    onChange={(e) => setFormData({...formData, bypass_rls: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isCreating}
                  />
                  <Label htmlFor="bypass_rls" className="text-sm font-normal flex items-center gap-2">
                    <Lock className="h-4 w-4 text-pink-600" />
                    Bypass RLS
                  </Label>
                  <span className="text-xs text-muted-foreground">(Bypasses row-level security)</span>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false)
              resetForm()
            }} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Consumer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Consumer</DialogTitle>
            <DialogDescription>
              Update consumer permissions and password
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Username</Label>
              <Input value={editingUser?.username || ''} disabled className="mt-1 bg-gray-50" />
              <p className="text-xs text-muted-foreground mt-1">Username cannot be changed</p>
            </div>
            
            <div>
              <Label htmlFor="edit_password">New Password (optional)</Label>
              <Input
                id="edit_password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="Leave blank to keep current password"
                className="mt-1"
                disabled={isUpdating}
              />
            </div>
            
            <div className="space-y-3">
              <Label className="font-semibold">Permissions</Label>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="edit_is_superuser"
                    checked={formData.is_superuser}
                    onChange={(e) => setFormData({...formData, is_superuser: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isUpdating}
                  />
                  <Label htmlFor="edit_is_superuser" className="text-sm font-normal flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-600" />
                    Superuser
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="edit_can_create_db"
                    checked={formData.can_create_db}
                    onChange={(e) => setFormData({...formData, can_create_db: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isUpdating}
                  />
                  <Label htmlFor="edit_can_create_db" className="text-sm font-normal flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    Create Database
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="edit_can_create_role"
                    checked={formData.can_create_role}
                    onChange={(e) => setFormData({...formData, can_create_role: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isUpdating}
                  />
                  <Label htmlFor="edit_can_create_role" className="text-sm font-normal flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-indigo-600" />
                    Create Role
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="edit_is_replication"
                    checked={formData.is_replication}
                    onChange={(e) => setFormData({...formData, is_replication: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isUpdating}
                  />
                  <Label htmlFor="edit_is_replication" className="text-sm font-normal flex items-center gap-2">
                    <Server className="h-4 w-4 text-orange-600" />
                    Replication
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="edit_bypass_rls"
                    checked={formData.bypass_rls}
                    onChange={(e) => setFormData({...formData, bypass_rls: e.target.checked})}
                    className="h-4 w-4"
                    disabled={isUpdating}
                  />
                  <Label htmlFor="edit_bypass_rls" className="text-sm font-normal flex items-center gap-2">
                    <Lock className="h-4 w-4 text-pink-600" />
                    Bypass RLS
                  </Label>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false)
              resetForm()
            }} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Consumer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Consumer Details</DialogTitle>
            <DialogDescription>
              Detailed information about the consumer
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {getInitials(selectedUser.username)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-semibold">{selectedUser.username}</h3>
                  {getLoginStatusBadge(selectedUser)}
                </div>
              </div>
              
              <div className="grid gap-3">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Username:</span>
                  <span className="font-medium">{selectedUser.username}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Superuser:</span>
                  <Badge variant={selectedUser.is_superuser ? "default" : "secondary"}>
                    {selectedUser.is_superuser ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Create Database:</span>
                  <Badge variant={selectedUser.can_create_db ? "default" : "secondary"}>
                    {selectedUser.can_create_db ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Create Role:</span>
                  <Badge variant={selectedUser.can_create_role ? "default" : "secondary"}>
                    {selectedUser.can_create_role ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Replication:</span>
                  <Badge variant={selectedUser.is_replication ? "default" : "secondary"}>
                    {selectedUser.is_replication ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Bypass RLS:</span>
                  <Badge variant={selectedUser.bypass_rls ? "default" : "secondary"}>
                    {selectedUser.bypass_rls ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-muted-foreground">Has Password:</span>
                  <Badge variant={selectedUser.has_password ? "default" : "secondary"}>
                    {selectedUser.has_password ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Consumer</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the consumer
              and reassign any owned objects to postgres.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="py-4">
              <p className="text-sm">
                Are you sure you want to delete consumer <span className="font-semibold">{selectedUser.username}</span>?
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Consumer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}