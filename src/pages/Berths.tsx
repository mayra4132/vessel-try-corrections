import React, { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, KpiCard, Modal } from '../components/ui/KpiCard';
import { formatDateTime, formatRate } from '../lib/format';
import { Anchor, Plus, Trash2 } from 'lucide-react';
import { Berth, BerthStatus } from '../types';

interface BerthsProps { onSelectVessel: (vesselId: string) => void; }
const emptyForm = {id:'',name:'',location:'',length:'',rate:'',notes:'',status:'ACTIVE' as BerthStatus};
export function Berths({ onSelectVessel }: BerthsProps) {
  const { berths, voyages, api } = useAppData();
  const { user } = useAuth();
  const canManage = ['Admin','Management','Operations'].includes(user?.role || '');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [removing, setRemoving] = useState<Berth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const occupants = voyages.filter(v=>v.status==='ACTIVE' && ['UNLOADING','BERTHED_AT_VIGOR'].includes(v.currentStage));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();setError('');setBusy(true);
    try {
      if(!form.id.trim() || !form.name.trim()) throw new Error('Enter a berth ID and name.');
      await api.addBerth({id:form.id.trim(),name:form.name.trim(),location:form.location.trim(),lengthM:Number(form.length),defaultUnloadingRate:Number(form.rate),notes:form.notes.trim(),status:form.status,type:'Bulk Cement',operationalHours:'24/7'});
      setOpen(false);setForm(emptyForm);
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to save berth.'); }
    finally {setBusy(false);}
  };
  const remove = async () => {
    if(!removing)return;setBusy(true);setError('');
    try {await api.removeBerth(removing.id);setRemoving(null);}
    catch(e) {setError(e instanceof Error ? e.message : 'Unable to remove berth.');}
    finally {setBusy(false);}
  };
  const inputClass='w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg';
  return <div className="space-y-6 pb-12">
    <PageHeader eyebrow="PORT INFRASTRUCTURE" title="Berth Operations" description="Manage port berths and view their recorded vessel assignments.">
      {canManage && <button onClick={()=>{setForm(emptyForm);setError('');setOpen(true);}} className="px-4 py-2 bg-[#0C9349] text-white rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/>Add Berth</button>}
    </PageHeader>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard label="Total Berths" value={String(berths.length)} icon={<Anchor className="w-5 h-5"/>}/>
      <KpiCard label="Active Berths" value={String(berths.filter(b=>b.status==='ACTIVE').length)}/>
      <KpiCard label="Occupied Berths" value={String(berths.filter(b=>occupants.some(v=>v.assignedBerthId===b.id)).length)}/>
    </div>
    {!berths.length && <div className="bg-white border border-[#E1DED4] rounded-xl p-8 text-center"><h2 className="font-bold">No berths configured</h2><p className="mt-2">Add a berth to start managing vessel assignments.</p></div>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {berths.map(berth=>{
        const occupant=occupants.find(v=>v.assignedBerthId===berth.id);
        const upcoming=voyages.filter(v=>v.assignedBerthId===berth.id && v.status!=='COMPLETED' && v.id!==occupant?.id);
        return <article key={berth.id} className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-3">
          <div className="flex justify-between gap-3"><h2 className="font-bold">{berth.name}</h2><span className="text-xs">{berth.status.replaceAll('_',' ')}</span></div>
          <p className="text-sm">ID: {berth.id} · {berth.location || 'Location not specified'}</p>
          <p className="text-sm">Length: {berth.lengthM} m · Unloading rate: {formatRate(berth.defaultUnloadingRate)}</p>
          <p className="text-sm">Current occupant: {occupant ? <button className="text-[#0C9349] underline" onClick={()=>onSelectVessel(occupant.vesselId)}>{occupant.vesselName}</button> : 'No recorded occupant'}</p>
          {occupant && <p className="text-sm">Expected release: {formatDateTime(occupant.expectedBerthRelease)}</p>}
          <p className="text-sm">Other assigned voyages: {upcoming.length}</p>
          {berth.notes && <p className="text-sm">{berth.notes}</p>}
          {canManage && <button aria-label={'Remove '+berth.name} onClick={()=>{setError('');setRemoving(berth);}} className="text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm flex items-center gap-2"><Trash2 className="w-4 h-4"/>Remove Berth</button>}
        </article>;
      })}
    </div>
    <Modal isOpen={open} onClose={()=>{if(!busy)setOpen(false);}} title="Add Berth" subtitle="Add an active, planned or inactive berth. There is no fixed berth count limit.">
      <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <label className="block">Berth ID<input required maxLength={36} className={inputClass} value={form.id} onChange={e=>setForm({...form,id:e.target.value})}/></label>
        <label className="block">Berth Name<input required maxLength={255} className={inputClass} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block">Location<input className={inputClass} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
        <label className="block">Quay Length (meters)<input type="number" required min="0.01" step="any" className={inputClass} value={form.length} onChange={e=>setForm({...form,length:e.target.value})}/></label>
        <label className="block">Unloading Rate (t/h)<input type="number" required min="0.01" step="any" className={inputClass} value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label>
        <label className="block">Status<select className={inputClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value as BerthStatus})}>{['ACTIVE','PLANNED','UNDER_CONSTRUCTION','MAINTENANCE','INACTIVE'].map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>
        <label className="block">Notes<textarea className={inputClass} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button disabled={busy} className="px-4 py-2 bg-[#0C9349] text-white rounded-lg">{busy?'Saving…':'Save Berth'}</button></div>
      </form>
    </Modal>
    <Modal isOpen={!!removing} onClose={()=>{if(!busy)setRemoving(null);}} title="Remove Berth" subtitle={removing?.name}>
      <p>Remove this berth from the system? Berths linked to operational records cannot be deleted.</p>
      {error && <p role="alert" className="text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-5"><button disabled={busy} onClick={()=>setRemoving(null)}>Cancel</button><button disabled={busy} onClick={remove} className="bg-red-700 text-white rounded-lg px-4 py-2">{busy?'Removing…':'Confirm Remove'}</button></div>
    </Modal>
  </div>;
}
