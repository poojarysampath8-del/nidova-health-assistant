import { useState } from 'react';
import { Shield, UserPlus } from 'lucide-react';
import { apiFetch } from '../api';
import type { FamilyAccess, FamilyRole, PatientProfile } from '../types';

interface FamilyViewProps {
  patient: PatientProfile;
  familyAccess: FamilyAccess[];
  onRefresh: () => Promise<void>;
}

export function FamilyView({ patient, familyAccess, onRefresh }: FamilyViewProps) {
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [role, setRole] = useState<FamilyRole>('viewer');
  const [canUpload, setCanUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const memberList = familyAccess.filter((f) => f.patientId === patient.id);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim() || !memberEmail.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          memberName,
          memberEmail,
          role,
          canUpload: role === 'caregiver' ? canUpload : false,
          canEditProfile: false,
        }),
      });
      if (res.ok) {
        setMemberName('');
        setMemberEmail('');
        setRole('viewer');
        setCanUpload(false);
        setFeedback('Family member access granted and logged.');
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: FamilyAccess) => {
    const nextStatus = item.status === 'accepted' ? 'revoked' : 'accepted';
    await apiFetch(`/api/family/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    await onRefresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Authorized Access — {patient.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit consent-based sharing. Patient owners retain exclusive delete and revoke control.
          </p>
        </div>

        {memberList.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No family viewers or caregivers have been added for {patient.name} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Member</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Permissions</th>
                  <th className="py-2.5 px-4">State</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {memberList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{item.memberName}</div>
                      <div className="text-xs text-slate-500">{item.memberEmail}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800">
                      {item.role === 'caregiver' ? 'Caregiver' : 'Family Viewer'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {item.role === 'caregiver' && item.canUpload
                        ? 'View reports · Upload documents'
                        : 'Read-only access'}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span
                        className={
                          item.status === 'accepted' ? 'text-emerald-700' : 'text-red-700'
                        }
                      >
                        {item.status === 'accepted' ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className="text-xs font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        {item.status === 'accepted' ? 'Revoke' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <UserPlus className="w-5 h-5 text-teal-700" />
          <h3 className="text-base font-semibold text-slate-900">Invite Family Member</h3>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="e.g., Rohan Rao"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="rohan@example.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Access Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as FamilyRole)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="viewer">Family Viewer (View reports & trends only)</option>
              <option value="caregiver">Caregiver (Can assist with uploads)</option>
            </select>
          </div>

          {role === 'caregiver' && (
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={canUpload}
                onChange={(e) => setCanUpload(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Allow caregiver to upload new reports for {patient.name}</span>
            </label>
          )}

          {feedback && <p className="text-xs text-emerald-700 font-medium">{feedback}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Granting Access...' : 'Grant Family Access'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
          <Shield className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p>
            Every invitation, permission change, and document view is recorded in the patient
            audit log for caregiver transparency.
          </p>
        </div>
      </div>
    </div>
  );
}
