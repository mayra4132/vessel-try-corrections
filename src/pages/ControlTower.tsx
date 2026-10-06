import React from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader } from '../components/ui/KpiCard';
import { ControlTowerTimeline } from '../components/ui/ControlTowerTimeline';
import { formatDateTime, formatTime, formatHoursAndMinutes } from '../lib/format';

interface ControlTowerProps {
  onSelectVessel: (vesselId: string) => void;
  onNavigateToBerths: () => void;
  onNavigateToPayments: () => void;
}

export function ControlTower({ onSelectVessel }: ControlTowerProps) {
  const { vessels, voyages, berths, paymentAccounts, fuelOperations } = useAppData();
  const activeVoyages = voyages.filter(v => v.status === 'ACTIVE' && vessels.some(s => s.id === v.vesselId));
  const vesselName = (id: string) => vessels.find(v => v.id === id)?.name || 'Unknown vessel';
  const conflicts = activeVoyages.filter(v => (v.predictedAnchorageWaitHours ?? 0) > 0);
  const card = 'bg-white border border-[#E1DED4] rounded-xl p-5 space-y-3';

  return <div className="space-y-6 pb-12">
    <PageHeader eyebrow="MULTI-VESSEL CONTROL CENTER" title="Operations Control Tower" description="Berth allocation, vessel schedules and recorded operational forecasts." />
    {!vessels.length || !voyages.length ? <div className={card}>
      <h2 className="font-bold">No vessel operations yet</h2>
      <p>Add a vessel and a voyage to see schedules, berth occupancy and operational forecasts.</p>
    </div> : <ControlTowerTimeline vessels={vessels} voyages={voyages} payments={paymentAccounts} fuelOperations={fuelOperations} onSelectVessel={onSelectVessel} />}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className={card}>
        <h2 className="font-bold">Berth Allocation</h2>
        {!berths.length && <p>No berths configured.</p>}
        {berths.map(berth => {
          const occupant = activeVoyages.find(v => v.assignedBerthId === berth.id && ['UNLOADING', 'BERTHED_AT_VIGOR'].includes(v.currentStage));
          const next = activeVoyages.filter(v => v.assignedBerthId === berth.id && v.id !== occupant?.id && v.returnEtaForecast && Number.isFinite(Date.parse(v.returnEtaForecast))).sort((a,b) => Date.parse(a.returnEtaForecast) - Date.parse(b.returnEtaForecast))[0];
          const progress = occupant && occupant.actualCargoT > 0 ? Math.min(100, Math.max(0, Math.round(100 * (occupant.unloadedTonnes ?? 0) / occupant.actualCargoT))) : null;
          return <div key={berth.id} className="rounded-lg border border-[#E1DED4] p-3 space-y-2 text-sm">
            <h3 className="font-bold">{berth.name}</h3>
            <p>Current occupant: <strong>{occupant ? vesselName(occupant.vesselId) : 'No recorded occupant'}</strong></p>
            {occupant && <>
              <p>Unloaded: {progress === null ? 'Unavailable' : `${progress}%`}</p>
              <p>Discharge rate: {occupant.unloadingRateTph == null ? 'Unavailable' : `${occupant.unloadingRateTph} t/h`}</p>
              <p>Forecast unload finish: {formatTime(occupant.forecastUnloadEnd)}</p>
              <p>Expected berth release: {formatTime(occupant.expectedBerthRelease)}</p>
            </>}
            <p>Next returning vessel: <strong>{next ? vesselName(next.vesselId) : 'No scheduled arrival'}</strong></p>
            {next && <>
              <p>Forecast arrival: {formatDateTime(next.returnEtaForecast)}</p>
              {(next.predictedAnchorageWaitHours ?? 0) > 0 && <p className="text-red-700">Forecast anchorage wait: {formatHoursAndMinutes(next.predictedAnchorageWaitHours)}</p>}
            </>}
          </div>;
        })}
      </section>
      <section className={card}>
        <h2 className="font-bold">Bunkering Schedules ({fuelOperations.length})</h2>
        {!fuelOperations.length && <p>No bunkering operations recorded.</p>}
        {fuelOperations.map(fuel => <div key={fuel.id} className="rounded-lg border border-[#E1DED4] p-3 space-y-1 text-sm">
          <h3 className="font-bold">{vesselName(fuel.vesselId)}</h3>
          <p>{fuel.status}</p><p>Supplier: {fuel.supplierName || 'Not assigned'}</p>
          <p>{fuel.quantity}T {fuel.fuelType}</p>
          <p>Window: {formatTime(fuel.scheduledStart)} � {formatTime(fuel.scheduledEnd)}</p>
        </div>)}
      </section>
      <section className={card}>
        <h2 className="font-bold">Decision Support</h2>
        {!activeVoyages.length ? <p>No active voyages to assess.</p> : !conflicts.length ? <p>No anchorage wait recorded in the current voyage forecasts.</p> : conflicts.map(v => <div key={v.id} className="rounded-lg border border-amber-300 p-3 text-sm">
          <h3 className="font-bold">{vesselName(v.vesselId)}</h3>
          <p>Forecast anchorage wait: {formatHoursAndMinutes(v.predictedAnchorageWaitHours)}. Review the arrival schedule and berth availability with operations.</p>
        </div>)}
      </section>
    </div>
  </div>;
}
