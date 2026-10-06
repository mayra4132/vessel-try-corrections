import React, { useState, useEffect } from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader } from '../components/ui/KpiCard';
import {
  Users,
  Shield,
  FileText,
  Database,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Download,
  Zap,
  Server,
  KeyRound,
  UserCheck,
  UserX,
  PlusCircle,
  Copy,
  ExternalLink,
  Search,
} from 'lucide-react';
import { useAuth, UserRole } from '../auth/AuthContext';

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  department: string;
  role: UserRole;
  status: 'Active' | 'Disabled' | 'Pending';
  createdAt: string;
  lastLoginAt?: string;
}

interface ActivityLogRecord {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress?: string;
}

interface DbHealthStatus {
  status: string;
  database: string;
  provider: string;
  host: string;
  databaseName: string;
  user: string;
  message: string;
  lastChecked: string;
}

export function Admin() {
  const { systemSettings, api } = useAppData();
  const { user: currentAuthUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'USERS' | 'AUDIT' | 'CPANEL' | 'CONFIG'>('USERS');

  // Calculation parameters
  const [bufferHours, setBufferHours] = useState(String(systemSettings.postUnloadBerthBufferHours));
  const [paymentThreshold, setPaymentThreshold] = useState(String(systemSettings.manufacturerEligibilityPercent));
  const [savedSuccess, setSavedSuccess] = useState(false);

  // User management state
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);

  // New staff modal state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Turkys@2025');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('Terminal Operations');
  const [newRole, setNewRole] = useState<UserRole>('Operations');

  // Audit logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  // Database diagnostic state
  const [dbHealth, setDbHealth] = useState<DbHealthStatus | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  // Fetch users
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/v1/users', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('vigor_auth_token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Fetch logs
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/v1/activity-logs', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('vigor_auth_token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data);
      }
    } catch (e) {
      console.warn('Failed to fetch logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch DB health
  const checkDbHealth = async () => {
    setIsTestingDb(true);
    try {
      const res = await fetch('/api/v1/health/database');
      const data = await res.json();
      setDbHealth(data);
    } catch (e: any) {
      setDbHealth({
        status: 'error',
        database: 'unreachable',
        provider: 'N/A',
        host: 'N/A',
        databaseName: 'N/A',
        user: 'N/A',
        message: e.message || 'Failed to ping database health endpoint',
        lastChecked: new Date().toISOString(),
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'USERS') {
      loadUsers();
    } else if (activeTab === 'AUDIT') {
      loadLogs();
    } else if (activeTab === 'CPANEL') {
      checkDbHealth();
    }
  }, [activeTab]);

  const handleUpdateStatus = async (userId: string, status: 'Active' | 'Disabled') => {
    try {
      const res = await fetch(`/api/v1/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vigor_auth_token') || ''}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setUserActionMsg(`User status updated to ${status}.`);
        loadUsers();
        setTimeout(() => setUserActionMsg(null), 3000);
      }
    } catch (err: any) {
      setUserActionMsg(`Error: ${err.message}`);
    }
  };

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      const res = await fetch(`/api/v1/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vigor_auth_token') || ''}`,
        },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setUserActionMsg(`User role changed to ${role}.`);
        loadUsers();
        setTimeout(() => setUserActionMsg(null), 3000);
      }
    } catch (err: any) {
      setUserActionMsg(`Error: ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.toLowerCase().endsWith('@turkysgroup.co.tz')) {
      alert('Email must end with @turkysgroup.co.tz');
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          fullName: newName,
          department: newDept,
          requestedRole: newRole,
        }),
      });

      if (res.ok) {
        setShowAddUser(false);
        setNewEmail('');
        setNewName('');
        setUserActionMsg('Staff account successfully registered.');
        loadUsers();
        setTimeout(() => setUserActionMsg(null), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Registration failed');
      }
    } catch (err: any) {
      alert(err.message || 'Registration error');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    api.updateSystemSettings({
      postUnloadBerthBufferHours: Number(bufferHours) || 1.5,
      manufacturerEligibilityPercent: Number(paymentThreshold) || 100,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(api.exportState(), null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `vigor-port-ops-export-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredUsers = usersList.filter(
    (u) =>
      u.fullName?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.department?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.role?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredLogs = activityLogs.filter(
    (l) =>
      l.userEmail?.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.action?.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.details?.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.entityType?.toLowerCase().includes(logSearch.toLowerCase())
  );

  const envSample = `# cPanel MySQL Connection Configuration for VIGOR
DB_HOST=localhost          # or cPanel server IP / remote MySQL host
DB_PORT=3306
DB_USER=cpaneluser_vigor
DB_PASSWORD=SecurePassword_2025!
DB_NAME=cpaneluser_vigor_port
SESSION_SECRET=turkys_group_production_session_secret_key_9281`;

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText(envSample);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="CORPORATE GOVERNANCE"
        title="System Administration & Enterprise Governance"
        description="User authorization (@turkysgroup.co.tz), role assignments, audit logging, cPanel MySQL database integration, and terminal engine calculation rules."
      />

      {/* Tabs Bar */}
      <div className="flex border-b border-[#E1DED4] gap-2 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition cursor-pointer border-b-2 ${
            activeTab === 'USERS'
              ? 'border-[#0A7A3D] text-[#0A7A3D] bg-white'
              : 'border-transparent text-[#5A6764] hover:text-[#14181A]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Management & RBAC</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E7F4EB] text-[#0A7A3D]">
            {usersList.length || 4}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AUDIT')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition cursor-pointer border-b-2 ${
            activeTab === 'AUDIT'
              ? 'border-[#0A7A3D] text-[#0A7A3D] bg-white'
              : 'border-transparent text-[#5A6764] hover:text-[#14181A]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Activity & Audit Trail</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CPANEL')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition cursor-pointer border-b-2 ${
            activeTab === 'CPANEL'
              ? 'border-[#0A7A3D] text-[#0A7A3D] bg-white'
              : 'border-transparent text-[#5A6764] hover:text-[#14181A]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>cPanel MySQL Integration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CONFIG')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition cursor-pointer border-b-2 ${
            activeTab === 'CONFIG'
              ? 'border-[#0A7A3D] text-[#0A7A3D] bg-white'
              : 'border-transparent text-[#5A6764] hover:text-[#14181A]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Terminal Engine & Scenarios</span>
        </button>
      </div>

      {/* Action Notification Banner */}
      {userActionMsg && (
        <div className="p-3 bg-[#E7F4EB] border border-[#0C9349]/30 text-xs text-[#0A7A3D] rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{userActionMsg}</span>
          </div>
        </div>
      )}

      {/* ----------------- TAB 1: USERS ----------------- */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E1DED4]">
              <div>
                <h3 className="text-base font-bold text-[#14181A]">Authorized Turkys Group Personnel</h3>
                <p className="text-xs text-[#5A6764]">
                  Only users with confirmed corporate emails (<code className="font-mono">@turkysgroup.co.tz</code>)
                  can access the system.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadUsers}
                  disabled={isLoadingUsers}
                  className="p-2 bg-[#F7F5F0] hover:bg-[#E1DED4] rounded-lg text-xs transition cursor-pointer"
                  title="Refresh user list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddUser(true)}
                  className="px-3 py-2 bg-[#0A7A3D] hover:bg-[#086331] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Register Staff</span>
                </button>
              </div>
            </div>

            {/* Filter */}
            <div className="pt-3 pb-2 flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-[#7C8884] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search staff by name, email, department..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg text-xs"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E1DED4] text-[#5A6764] font-semibold">
                    <th className="py-2.5 px-3">Name & Email</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Last Active</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1DED4]/60 font-medium">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-xs text-[#5A6764]">
                        No users match query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#FAF9F5]">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#14181A]">{u.fullName}</div>
                          <div className="text-[11px] font-mono text-[#5A6764]">{u.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[#14181A]">{u.department || 'Terminal'}</td>
                        <td className="py-2.5 px-3">
                          <select
                            value={u.role}
                            onChange={(e) => handleUpdateRole(u.id, e.target.value as UserRole)}
                            className={`p-1 rounded text-[11px] font-semibold border cursor-pointer ${
                              u.role === 'Admin'
                                ? 'bg-[#F2EDFD] text-[#5B37B7] border-[#5B37B7]/30'
                                : u.role === 'Management'
                                ? 'bg-[#EBF2FF] text-[#0F62FE] border-[#0F62FE]/30'
                                : u.role === 'Operations'
                                ? 'bg-[#E7F4EB] text-[#0A7A3D] border-[#0A7A3D]/30'
                                : 'bg-[#F7F5F0] text-[#5A6764] border-[#E1DED4]'
                            }`}
                          >
                            <option value="Admin">Admin</option>
                            <option value="Management">Management</option>
                            <option value="Operations">Operations</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              u.status === 'Active'
                                ? 'bg-[#E7F4EB] text-[#0A7A3D]'
                                : u.status === 'Pending'
                                ? 'bg-[#FFF3D6] text-[#B5760F]'
                                : 'bg-[#FCEBEA] text-[#AE3B2E]'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] font-mono text-[#5A6764]">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {u.status === 'Active' ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(u.id, 'Disabled')}
                              className="px-2.5 py-1 text-[11px] text-[#AE3B2E] hover:bg-[#FCEBEA] rounded border border-[#AE3B2E]/30 transition cursor-pointer"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(u.id, 'Active')}
                              className="px-2.5 py-1 text-[11px] text-[#0A7A3D] hover:bg-[#E7F4EB] rounded border border-[#0A7A3D]/30 transition cursor-pointer"
                            >
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Staff Modal */}
          {showAddUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-xl border border-[#E1DED4] shadow-xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
                  <h3 className="font-bold text-sm text-[#14181A] flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-[#0A7A3D]" />
                    <span>Register Turkys Group Staff</span>
                  </h3>
                  <button
                    onClick={() => setShowAddUser(false)}
                    className="text-[#5A6764] hover:text-[#14181A] text-lg font-mono leading-none"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-[#14181A] mb-1">Full Legal Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Salim Ali Mwamba"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#14181A] mb-1">Company Email (@turkysgroup.co.tz)</label>
                    <input
                      type="email"
                      required
                      placeholder="staff.name@turkysgroup.co.tz"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#14181A] mb-1">Temporary Password</label>
                    <input
                      type="text"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-[#14181A] mb-1">Department</label>
                      <select
                        value={newDept}
                        onChange={(e) => setNewDept(e.target.value)}
                        className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
                      >
                        <option value="Terminal Operations">Terminal Operations</option>
                        <option value="Marine Dispatch">Marine Dispatch</option>
                        <option value="Executive Office">Executive Office</option>
                        <option value="Finance & Accounts">Finance & Accounts</option>
                        <option value="Information Technology">Information Technology</option>
                        <option value="Compliance & Audit">Compliance & Audit</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-[#14181A] mb-1">Assigned Role</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
                      >
                        <option value="Operations">Operations</option>
                        <option value="Management">Management</option>
                        <option value="Admin">Admin</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddUser(false)}
                      className="px-3 py-1.5 rounded-lg border border-[#E1DED4] text-xs font-semibold hover:bg-[#F7F5F0]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#0A7A3D] hover:bg-[#086331] text-white text-xs font-semibold cursor-pointer"
                    >
                      Save & Authorize
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- TAB 2: AUDIT LOGS ----------------- */}
      {activeTab === 'AUDIT' && (
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E1DED4]">
            <div>
              <h3 className="text-base font-bold text-[#14181A]">Operational Activity & Security Trail</h3>
              <p className="text-xs text-[#5A6764]">
                Tamper-evident logs of logins, pneumatic rate submissions, berth clearances, and user management.
              </p>
            </div>

            <button
              type="button"
              onClick={loadLogs}
              disabled={isLoadingLogs}
              className="p-2 bg-[#F7F5F0] hover:bg-[#E1DED4] rounded-lg text-xs transition cursor-pointer self-start sm:self-auto"
              title="Refresh logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-[#7C8884] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail by user, action, details..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1DED4] text-[#5A6764] font-semibold">
                  <th className="py-2.5 px-3">Timestamp (EAT)</th>
                  <th className="py-2.5 px-3">Actor / Email</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1DED4]/60 font-medium">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-xs text-[#5A6764]">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAF9F5]">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6764] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#14181A] font-semibold">
                        {log.userEmail}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#F7F5F0] border border-[#E1DED4] text-[#14181A] font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6764]">
                        {log.entityType}: {log.entityId}
                      </td>
                      <td className="py-2.5 px-3 text-[#14181A]">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: CPANEL MYSQL ----------------- */}
      {activeTab === 'CPANEL' && (
        <div className="space-y-5">
          {/* Live Status Card */}
          <div className="bg-white border border-[#E1DED4] rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E1DED4] mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[#E7F4EB] text-[#0A7A3D] border border-[#0C9349]/20">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#14181A]">cPanel MySQL Production Integration</h3>
                  <p className="text-xs text-[#5A6764]">
                    Official database engine for VIGOR Cement Works port telemetry and vessel schedules.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={checkDbHealth}
                disabled={isTestingDb}
                className="px-3 py-1.5 bg-[#0A7A3D] hover:bg-[#086331] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? 'animate-spin' : ''}`} />
                <span>{isTestingDb ? 'Testing...' : 'Test Connection'}</span>
              </button>
            </div>

            {/* Health Diagnostics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
              <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E1DED4]">
                <div className="text-[10px] text-[#5A6764] uppercase font-mono">Engine State</div>
                <div className="text-xs font-bold mt-1 text-[#0A7A3D] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{dbHealth?.database === 'connected' ? 'MySQL Connected' : 'Resilient Cache Engine'}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E1DED4]">
                <div className="text-[10px] text-[#5A6764] uppercase font-mono">Host Endpoint</div>
                <div className="text-xs font-mono font-bold mt-1 text-[#14181A] truncate">
                  {dbHealth?.host || 'localhost (3306)'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E1DED4]">
                <div className="text-[10px] text-[#5A6764] uppercase font-mono">Target Database</div>
                <div className="text-xs font-mono font-bold mt-1 text-[#14181A] truncate">
                  {dbHealth?.databaseName || 'cpanel_vigor_port'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E1DED4]">
                <div className="text-[10px] text-[#5A6764] uppercase font-mono">Database User</div>
                <div className="text-xs font-mono font-bold mt-1 text-[#14181A] truncate">
                  {dbHealth?.user || 'vigor_cpanel_user'}
                </div>
              </div>
            </div>

            {dbHealth?.message && (
              <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E1DED4] text-xs font-mono text-[#5A6764]">
                <strong>Diagnostics:</strong> {dbHealth.message}
              </div>
            )}
          </div>

          {/* cPanel Setup Instructions for Turkys IT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-[#14181A] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#0A7A3D]" />
                <span>cPanel Database Setup Checklist for IT</span>
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-xs text-[#5A6764] leading-relaxed">
                <li>
                  <strong className="text-[#14181A]">Log in to Turkys cPanel:</strong> Navigate to{' '}
                  <span className="font-mono">MySQL Databases</span>.
                </li>
                <li>
                  <strong className="text-[#14181A]">Create New Database:</strong> e.g.{' '}
                  <code className="font-mono bg-[#F7F5F0] px-1 py-0.5 rounded">turkysgr_vigor_port</code>.
                </li>
                <li>
                  <strong className="text-[#14181A]">Create Database User:</strong> Generate a strong alphanumeric password and assign it to the user.
                </li>
                <li>
                  <strong className="text-[#14181A]">Grant Privileges:</strong> Under "Add User to Database", check{' '}
                  <strong className="text-[#14181A]">ALL PRIVILEGES</strong> and apply changes.
                </li>
                <li>
                  <strong className="text-[#14181A]">Import Relational Schema:</strong> Open{' '}
                  <span className="font-mono">phpMyAdmin</span>, select the database, click <em>Import</em>, and upload{' '}
                  <code className="font-mono bg-[#F7F5F0] px-1 py-0.5 rounded">/database/schema.sql</code> followed by{' '}
                  <code className="font-mono bg-[#F7F5F0] px-1 py-0.5 rounded">/database/demo_seed.sql</code>.
                </li>
              </ol>
            </div>

            <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#14181A] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#0A7A3D]" />
                  <span>Environment Variables Template</span>
                </h4>
                <button
                  type="button"
                  onClick={copyEnvSnippet}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#F7F5F0] hover:bg-[#E1DED4] border border-[#E1DED4] text-[#14181A] flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedEnv ? 'Copied!' : 'Copy .env'}</span>
                </button>
              </div>

              <p className="text-xs text-[#5A6764]">
                Paste these into your backend <code className="font-mono">.env</code> or Vercel Environment Variables:
              </p>

              <pre className="p-3 bg-[#14181A] text-[#E7F4EB] rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre leading-snug">
                {envSample}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 4: CONFIGURATION & SCENARIOS ----------------- */}
      {activeTab === 'CONFIG' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Core Calculation Parameters */}
          <div className="lg:col-span-2 bg-white border border-[#E1DED4] rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4] mb-5">
              <h3 className="text-base font-bold text-[#14181A] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#0A7A3D]" />
                Downstream Calculation Parameters
              </h3>
              {savedSuccess && (
                <span className="text-xs font-semibold text-[#0A7A3D] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Changes saved
                </span>
              )}
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5 text-xs">
              <div>
                <label className="block font-semibold text-[#14181A] mb-1">
                  Post-Unload Berth Clearance Buffer (Hours)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.1"
                    value={bufferHours}
                    onChange={(e) => setBufferHours(e.target.value)}
                    className="w-32 p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono font-bold"
                  />
                  <span className="text-[#5A6764]">
                    Hours required after last cement tonne discharged for pneumatic line purge, disconnect, and castoff clearance (default 1.5h).
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#14181A] mb-1">
                  Manufacturer Payment Gate Eligibility Threshold (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={paymentThreshold}
                    onChange={(e) => setPaymentThreshold(e.target.value)}
                    className="w-32 p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono font-bold"
                  />
                  <span className="text-[#5A6764]">
                    Percentage of advance commercial invoice required cleared in treasury before manufacturer confirms loading slot (Default: 100%).
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E1DED4] flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0A7A3D] hover:bg-[#086331] text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Apply Engine Parameters
                </button>
              </div>
            </form>
          </div>

          {/* Operational Scenarios & Data Management */}
          <div className="space-y-6">
            <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#B5760F]" />
                Interactive Operational Scenarios
              </h3>
              <p className="text-xs text-[#5A6764] mb-4">
                Trigger operational test states to preview system-wide recalculations across berths, queues, and financial gates.
              </p>

              <div className="space-y-2.5">
                <button
                  onClick={() => api.loadPresetScenario('BASELINE')}
                  className="w-full text-left p-3 rounded-lg bg-[#F7F5F0] hover:bg-[#E1DED4]/60 border border-[#E1DED4] transition text-xs cursor-pointer"
                >
                  <div className="font-bold text-[#14181A]">1. Reset to Baseline Conflict</div>
                  <div className="text-[11px] text-[#5A6764] mt-0.5">
                    V01 unloading, V03 arrives early (berth conflict), V01 payment pending.
                  </div>
                </button>

                <button
                  onClick={() => api.loadPresetScenario('SOLVE_PAYMENT')}
                  className="w-full text-left p-3 rounded-lg bg-[#E7F4EB] hover:bg-[#0C9349]/20 border border-[#0C9349]/40 transition text-xs cursor-pointer"
                >
                  <div className="font-bold text-[#0A7A3D]">2. Solve Manufacturer Payment</div>
                  <div className="text-[11px] text-[#5A6764] mt-0.5">
                    Clears remaining TZS 200M wire, unlocking V01 queue eligibility.
                  </div>
                </button>

                <button
                  onClick={() => api.loadPresetScenario('SOLVE_BERTH')}
                  className="w-full text-left p-3 rounded-lg bg-[#E4F1F2] hover:bg-[#0E7C86]/20 border border-[#0E7C86]/40 transition text-xs cursor-pointer"
                >
                  <div className="font-bold text-[#0E7C86]">3. Eco-Steaming (Berth Synced)</div>
                  <div className="text-[11px] text-[#5A6764] mt-0.5">
                    Adjusts MV VIGOR 03 speed to 8.5 kts, arriving right as B01 releases.
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#5A6764]" />
                Data Persistence & Snapshot
              </h3>
              <p className="text-xs text-[#5A6764] mb-4">
                Export full state snapshot (vessels, voyages, transactions, readings, alerts) for offline backup.
              </p>

              <button
                onClick={handleExportData}
                className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-white border border-[#E1DED4] hover:bg-[#F7F5F0] text-[#14181A] flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#0A7A3D]" />
                <span>Export System State (JSON)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
