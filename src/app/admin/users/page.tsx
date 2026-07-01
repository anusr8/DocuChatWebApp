'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Lock, 
  Trash2, 
  Shield, 
  Loader2, 
  ArrowLeft,
  Search,
  ChevronRight,
  Copy,
  Ban,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  CheckCircle,
  XCircle,
  Database
} from 'lucide-react';
import { validatePassword, passwordPolicy } from '@/lib/validation';

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', tempPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Storage report states
  const [storageData, setStorageData] = useState<any>(null);
  const [loadingStorage, setLoadingStorage] = useState(true);

  const fetchStorageReport = async () => {
    try {
      const res = await fetch(`/api/admin/storage?adminEmail=${user?.email}`);
      const data = await res.json();
      if (res.ok) {
        setStorageData(data);
      }
    } catch (err) {
      console.error('Failed to fetch storage report', err);
    } finally {
      setLoadingStorage(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Modal states
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!selectedUser) {
      setShowPassword(false);
    }
  }, [selectedUser]);

  const passwordValidation = validatePassword(newPass);
  const isPasswordValid = passwordValidation.isValid;


  useEffect(() => {
    if (!authLoading) {
      if (!user || user.email !== 'admin@10xds.com') {
        router.push('/login');
      } else {
        fetchUsers();
        fetchStorageReport();
      }
    }
  }, [user, authLoading, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?adminEmail=${user?.email}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: user?.email,
          userEmail: newUser.email,
          tempPassword: newUser.tempPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${newUser.email} added successfully!`);
        setNewUser({ email: '', tempPassword: '' });
        fetchUsers();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (email === 'admin@10xds.com') {
      alert('Cannot delete the main administrator');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;

    try {
      const res = await fetch(`/api/admin/users?adminEmail=${user?.email}&id=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setSuccess(`User ${email} deleted successfully`);
        fetchUsers();
        if (selectedUser?.id === id) setSelectedUser(null);
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const handleUpdateStatus = async (userId: string, action: 'block' | 'reset_password', newValue: any) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: user?.email,
          userId,
          action,
          newValue
        })
      });

      if (res.ok) {
        setSuccess(`User updated successfully`);
        fetchUsers();
        if (action === 'reset_password') {
          setIsResetting(false);
          setNewPass('');
          if (selectedUser) setSelectedUser({ ...selectedUser, password: newValue, isFirstLogin: true });
        } else if (action === 'block') {
          if (selectedUser) setSelectedUser({ ...selectedUser, blocked: newValue });
        }
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to update user');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const maskPassword = (password: string) => {
    if (!password) return '';
    if (password.length <= 4) return '*'.repeat(password.length);
    return '****' + password.slice(4);
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-10 h-10 animate-spin text-[#6E3C96]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-20">
      {/* Header Area */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/')}
              className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200 mx-2" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#6E3C96]/10 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-[#6E3C96]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">User Management</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Admin Control Center</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">{user?.email}</span>
              <span className="text-[10px] font-black text-[#6E3C96] uppercase tracking-tighter">System Administrator</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              <Shield className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-12 grid lg:grid-cols-3 gap-10">
        
        {/* Left: Add User Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm sticky top-32">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 bg-[#6E3C96]/10 rounded-lg flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-[#6E3C96]" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-900">Provision User</h2>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[10px] font-bold animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-2xl bg-green-50 border border-green-100 text-green-600 text-[10px] font-bold animate-in fade-in slide-in-from-top-2">
                {success}
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">User Email</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#6E3C96]" />
                  <input 
                    type="email" 
                    required
                    placeholder="user@10xds.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#6E3C96]/10 focus:border-[#6E3C96]/50 transition-all"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Temporary Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#6E3C96]" />
                  <input 
                    type="text" 
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#6E3C96]/10 focus:border-[#6E3C96]/50 transition-all"
                    value={newUser.tempPassword}
                    onChange={(e) => setNewUser({...newUser, tempPassword: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                className="w-full bg-[#6E3C96] hover:bg-[#5D3280] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#6E3C96]/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create User Account</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Storage Usage Report */}
          <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm mt-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#6E3C96]/10 rounded-lg flex items-center justify-center">
                  <Database className="w-4 h-4 text-[#6E3C96]" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">Storage Report</h2>
              </div>
              <button
                onClick={fetchStorageReport}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#6E3C96] transition-colors"
                title="Refresh Report"
              >
                <RefreshCw className={`w-4 h-4 ${loadingStorage ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingStorage ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-[#6E3C96]" />
              </div>
            ) : storageData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Space</p>
                    <p className="text-base font-bold text-slate-900">{formatBytes(storageData.totalSize)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Files</p>
                    <p className="text-base font-bold text-slate-900">{storageData.totalFiles}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Breakdown by Type</p>
                  {Object.entries(storageData.typeBreakdown || {}).map(([type, stats]: any) => {
                    if (stats.count === 0) return null;
                    const percentage = storageData.totalSize > 0 ? (stats.size / storageData.totalSize) * 100 : 0;
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-700 capitalize">
                          <span>{type === 'ppt' ? 'PPT Decks' : type === 'word' ? 'Word Docs' : type}</span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {stats.count} files · {formatBytes(stats.size)} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#6E3C96] rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">Failed to load report</p>
            )}
          </div>
        </div>

        {/* Right: User List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-extrabold text-slate-900">Active Directory</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input 
                  type="text" 
                  placeholder="Search users..."
                  className="bg-slate-50 border border-slate-100 rounded-full py-2 pl-10 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#6E3C96]/10 w-full md:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs uppercase ${u.blocked ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                            {u.email.substring(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              {u.email}
                              {u.role === 'admin' && <Shield className="w-3 h-3 text-[#6E3C96]" />}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">Added on {new Date(u.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {u.blocked ? (
                          <span className="flex items-center gap-1.5 text-red-500 text-[10px] font-bold uppercase tracking-tighter">
                            <Ban className="w-3 h-3" />
                            Blocked
                          </span>
                        ) : u.isFirstLogin ? (
                          <span className="flex items-center gap-1.5 text-orange-500 text-[10px] font-bold uppercase tracking-tighter">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            Pending Reset
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-tighter">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setSelectedUser(u)}
                            className="p-2 text-slate-400 hover:text-[#6E3C96] hover:bg-[#6E3C96]/10 rounded-lg transition-all"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <div className="relative inline-flex items-center">
                            {copiedId === u.id && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                Credentials copied to clipboard!
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-green-500" />
                              </div>
                            )}
                            <button 
                              onClick={() => copyToClipboard(`${u.email} / ${u.password}`, u.id)}
                              className="p-2 text-slate-400 hover:text-[#6E3C96] hover:bg-[#6E3C96]/10 rounded-lg transition-all"
                              title="Copy Credentials"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                          <button 
                            onClick={() => {
                              const actionText = u.blocked ? 'unblock' : 'block';
                              if (window.confirm(`Are you sure you want to ${actionText} user ${u.email}?`)) {
                                handleUpdateStatus(u.id, 'block', !u.blocked);
                              }
                            }}
                            className={`p-2 transition-all rounded-lg ${u.blocked ? 'text-red-500 bg-red-50' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                            title={u.blocked ? 'Unblock User' : 'Block User'}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-2 text-blue-500 hover:text-black hover:bg-slate-100 rounded-lg transition-all"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center">
                        <Users className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                        <p className="text-slate-400 font-medium text-sm">No users found in the directory.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg ${selectedUser.blocked ? 'bg-red-100 text-red-500' : 'bg-[#6E3C96]/10 text-[#6E3C96]'}`}>
                  {selectedUser.email.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900">{selectedUser.email}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    ID: {selectedUser.id}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedUser(null); setIsResetting(false); }}
                className="p-2 hover:bg-white rounded-full transition-colors shadow-sm"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Status</p>
                  <p className={`text-sm font-bold ${selectedUser.blocked ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedUser.blocked ? 'Blocked' : 'Active'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</p>
                  <p className="text-sm font-bold text-slate-700 capitalize">{selectedUser.role}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined Date</p>
                  <p className="text-sm font-bold text-slate-700">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">First Login</p>
                  <p className="text-sm font-bold text-slate-700">{selectedUser.isFirstLogin ? 'Pending' : 'Completed'}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Credentials</p>
                  <div className="relative inline-flex items-center">
                    {copiedId === 'modal' && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                        Credentials copied to clipboard!
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-green-500" />
                      </div>
                    )}
                    <button 
                      onClick={() => copyToClipboard(`${selectedUser.email} / ${selectedUser.password}`, 'modal')}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-[#6E3C96] hover:underline"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Email</span>
                    <span className="text-xs font-bold text-slate-900">{selectedUser.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Password</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-100">
                        {showPassword ? selectedUser.password : maskPassword(selectedUser.password)}
                      </span>
                      <button 
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        title={showPassword ? "Hide Password" : "Show Password"}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {isResetting ? (
                <div className="space-y-6 animate-in slide-in-from-bottom-2">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="text" 
                        placeholder="Enter new password"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-[#6E3C96]"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                      />
                    </div>
                    
                    {/* Password Requirements Checklist */}
                    <div className="grid grid-cols-2 gap-2 px-2 mt-2">
                      {[
                        { label: `Min ${passwordPolicy.minLength} chars`, met: newPass.length >= passwordPolicy.minLength },
                        { label: 'Upper Case', met: passwordPolicy.hasUpperCase(newPass) },
                        { label: 'Lower Case', met: passwordPolicy.hasLowerCase(newPass) },
                        { label: 'Number', met: passwordPolicy.hasNumber(newPass) },
                        { label: 'Special Char', met: passwordPolicy.hasSpecialChar(newPass) },
                      ].map((req, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          {req.met ? (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-slate-200" />
                          )}
                          <span className={`text-[9px] font-bold uppercase tracking-tight ${req.met ? 'text-green-600' : 'text-slate-400'}`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleUpdateStatus(selectedUser.id, 'reset_password', newPass)}
                      disabled={!isPasswordValid}
                      className="flex-1 bg-[#6E3C96] text-white font-bold py-3 rounded-xl text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Confirm Reset
                    </button>
                    <button 
                      onClick={() => setIsResetting(false)}
                      className="px-6 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsResetting(true)}
                    className="flex-1 bg-white border border-[#6E3C96] text-[#6E3C96] font-bold py-3.5 rounded-xl text-xs hover:bg-[#6E3C96]/5 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset Password
                  </button>
                  <button 
                    onClick={() => {
                      const actionText = selectedUser.blocked ? 'unblock' : 'block';
                      if (window.confirm(`Are you sure you want to ${actionText} user ${selectedUser.email}?`)) {
                        handleUpdateStatus(selectedUser.id, 'block', !selectedUser.blocked);
                      }
                    }}
                    className={`flex-1 font-bold py-3.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 ${selectedUser.blocked ? 'bg-green-500 text-white' : 'bg-red-50 text-red-500 border border-red-100'}`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    {selectedUser.blocked ? 'Unblock User' : 'Block User'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

