import React, { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader, KpiCard, Modal } from '../components/ui/KpiCard';
import { StatusBadge, OperationsHealthBadge } from '../components/ui/StatusBadge';
import {
  formatDateTime,
  formatTime,
  formatTonnage,
  formatRate,
} from '../lib/format';
import { Route, Plus, ArrowRight, Ship, Clock, CheckCircle2 } from 'lucide-react';

interface VoyagesProps {
  onSelectVessel: (vesselId: string) => void;
}

export function Voyages({ onSelectVessel }: VoyagesProps) {
  const { voyages, vessels, berths, systemSettings, api } = useAppData();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Voyage form
  const [vesselId, setVesselId] = useState('');
  const [voyageNum, setVoyageNum] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [plannedCargo, setPlannedCargo] = useState('');

  const [berthId,setBerthId]=useState('');
  const [arrival,setArrival]=useState('');
  const [rate,setRate]=useState('');
  const [manufacturer,setManufacturer]=useState('');
  const [stage,setStage]=useState<'PLANNED'|'UNLOADING'>('PLANNED');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  const filteredVoyages = voyages.filter((v) => {
    if (filter === 'ACTIVE') return v.status === 'ACTIVE';
    if (filter === 'COMPLETED') return v.status === 'COMPLETED';
    return true;
  });

  const handleCreateVoyage = async (e: React.FormEvent) => {
    e.preventDefault();setError('');setSaving(true);
    try {
      const vessel=vessels.find(v=>v.id===vesselId),berth=berths.find(b=>b.id===berthId);
      if(!vessel||!berth)throw new Error('Select a vessel and berth.');
      const cargo=Number(plannedCargo),unloadRate=Number(rate);
      if(cargo<=0||cargo>vessel.capacityT)throw new Error('Cargo must be positive and within vessel capacity.');
      if(unloadRate<=0)throw new Error('Enter a positive unloading rate.');
      const start=new Date(arrival).toISOString();
      const end=new Date(Date.parse(start)+cargo/unloadRate*3600000).toISOString();
      await api.addVoyage({vesselId,vesselName:vessel.name,voyageNumber:voyageNum.trim(),assignedBerthId:berthId,
        origin:origin.trim(),destination:destination.trim()||berth.location||berth.name,manufacturerName:manufacturer.trim()||'Not specified',
        status:'ACTIVE',currentStage:stage,cargoType:'Bulk Cement',plannedCargoT:cargo,actualCargoT:cargo,
        unloadedTonnes:0,unloadingRateTph:unloadRate,plannedUnloadStart:start,plannedUnloadEnd:end,forecastUnloadEnd:end,
        actualUnloadStart:stage==='UNLOADING'?start:undefined,postUnloadBufferHours:systemSettings.postUnloadBerthBufferHours,
        expectedBerthRelease:new Date(Date.parse(end)+systemSettings.postUnloadBerthBufferHours*3600000).toISOString(),health:'READY',risk:'ON_TRACK',currentBlocker:'NONE'});
      setIsAddModalOpen(false);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save voyage.');}finally{setSaving(false);}
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="VOYAGE OPERATIONS"
        title="Voyage Rotations"
        description="Comprehensive cycle history across Zanzibar discharge, coastal transit, manufacturer loading, and return logistics."
      >
        <button
          onClick={() => {setVesselId(vessels[0]?.id||'');setBerthId(berths[0]?.id||'');setRate(String(berths[0]?.defaultUnloadingRate||600));setVoyageNum('');setPlannedCargo('');setArrival(new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));setError('');setIsAddModalOpen(true);}}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] text-white flex items-center gap-1.5 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Initiate New Voyage Rotation
        </button>
      </PageHeader>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filter === tab
                ? 'bg-[#14181A] text-white'
                : 'bg-white text-[#3F4A47] border border-[#E1DED4] hover:bg-[#F7F5F0]'
            }`}
          >
            {tab} Rotations
          </button>
        ))}
      </div>

      {/* Voyage Cards List */}
      <div className="space-y-4">
        {filteredVoyages.map((voyage) => (
          <div
            key={voyage.id}
            onClick={() => onSelectVessel(voyage.vesselId)}
            className="bg-white border border-[#E1DED4] rounded-xl p-5 hover:border-[#3F4A47] transition cursor-pointer shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-[#0C9349] bg-[#E7F4EB] px-2 py-0.5 rounded">
                  {voyage.voyageNumber}
                </span>
                <h3 className="text-base font-bold text-[#14181A] flex items-center gap-1.5">
                  <Ship className="w-4 h-4 text-[#3F4A47]" />
                  {voyage.vesselName}
                </h3>
                <StatusBadge stage={voyage.currentStage} />
                <OperationsHealthBadge health={voyage.health} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono text-[#3F4A47]">
                <div>
                  <span className="text-[10px] text-[#3F4A47] uppercase block font-sans">Route</span>
                  <span className="font-semibold text-[#14181A]">
                    {voyage.origin} → {voyage.destination}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#3F4A47] uppercase block font-sans">Cargo</span>
                  <span className="font-semibold text-[#14181A]">
                    {formatTonnage(voyage.actualCargoT || voyage.plannedCargoT)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#3F4A47] uppercase block font-sans">Unloaded</span>
                  <span className="font-semibold text-[#0A7A3D]">
                    {voyage.unloadedTonnes.toLocaleString()} T
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#3F4A47] uppercase block font-sans">Berth {voyage.assignedBerthId} Release</span>
                  <span className="font-semibold text-[#14181A]">
                    {formatTime(voyage.expectedBerthRelease)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-center">
              <span className="text-xs text-[#0A7A3D] font-semibold flex items-center gap-1">
                View Cycle Console <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Initiate New Voyage */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Initiate New Voyage Rotation"
        subtitle="Schedule a new round-trip cement rotation cycle."
      >
        <form onSubmit={handleCreateVoyage} className="space-y-4 text-xs">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {(!vessels.length||!berths.length) && <p role="alert">Add a vessel and berth before creating a voyage.</p>}
          <label className="block">Assigned Berth<select required aria-label="Assigned Berth" value={berthId} onChange={e=>{setBerthId(e.target.value);setRate(String(berths.find(b=>b.id===e.target.value)?.defaultUnloadingRate||''));}} className="w-full border p-2 rounded"><option value="">Select berth</option>{berths.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="block">Planned Arrival<input required type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)} className="w-full border p-2 rounded"/></label>
          <label className="block">Unloading Rate (t/h)<input required type="number" min="0.01" step="any" value={rate} onChange={e=>setRate(e.target.value)} className="w-full border p-2 rounded"/></label>
          <label className="block">Current Stage<select value={stage} onChange={e=>setStage(e.target.value as 'PLANNED'|'UNLOADING')} className="w-full border p-2 rounded"><option value="PLANNED">Planned arrival</option><option value="UNLOADING">Currently unloading</option></select></label>
          <label className="block">Manufacturer<input value={manufacturer} onChange={e=>setManufacturer(e.target.value)} className="w-full border p-2 rounded"/></label>
          <div>
            <label className="block font-semibold text-[#14181A] mb-1">Select Vessel *</label>
            <select
              required aria-label="Select Vessel" value={vesselId}
              onChange={(e) => setVesselId(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
            >
              <option value="">Select vessel</option>{vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.reference})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Voyage Number *</label>
              <input
                type="text"
                required
                aria-label="Voyage Number" value={voyageNum}
                onChange={(e) => setVoyageNum(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Planned Cargo (T) *</label>
              <input
                type="number"
                required
                min="0.01" step="any" aria-label="Planned Cargo" value={plannedCargo}
                onChange={(e) => setPlannedCargo(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Origin Port</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Destination Port</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white border border-[#E1DED4] text-[#3F4A47] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving||!vessels.length||!berths.length}
              className="px-4 py-2 rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] text-white font-semibold shadow-xs"
            >
              {saving?'Saving...':'Start Voyage'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
