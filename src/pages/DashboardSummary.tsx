import React from 'react';
import { useAppData } from '../hooks/useAppData';
import { calculatePaymentAccountTotals } from '../lib/paymentEngine';

interface DashboardSummaryProps {
  onSelectVessel: (vesselId: string) => void;
  onNavigateToBerths: () => void;
  onNavigateToPayments: () => void;
  onNavigateToAlerts: () => void;
  onNavigateToControlTower: () => void;
}
export function DashboardSummary(props: DashboardSummaryProps) {
  const { vessels, voyages, berths, paymentAccounts, paymentTransactions, alerts, connectionInfo } = useAppData();
  const active = voyages.filter(v => v.status !== 'COMPLETED');
  const unpaid = paymentAccounts.filter(a => calculatePaymentAccountTotals(a,paymentTransactions).remaining > 0);
  return <div className="space-y-6" id="executive-dashboard-summary">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Dashboard Summary</h1><span className="text-sm text-gray-500">{connectionInfo.connectionStatus}</span></div>
    {connectionInfo.errorMessage && <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">{connectionInfo.errorMessage}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        {label:'Fleet vessels',value:vessels.length,click:props.onNavigateToControlTower},
        {label:'Active voyages',value:active.length,click:props.onNavigateToControlTower},
        {label:'Available infrastructure',value:berths.filter(b=>b.status==='ACTIVE').length,click:props.onNavigateToBerths},
        {label:'Outstanding accounts',value:unpaid.length,click:props.onNavigateToPayments},
      ].map(card=><button key={card.label} onClick={card.click} className="text-left p-5 bg-white border border-gray-200 rounded-xl"><div className="text-xs uppercase text-gray-500">{card.label}</div><div className="text-3xl font-bold text-[#0A7A3D] mt-2">{card.value}</div></button>)}
    </div>
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">Port berths ({berths.length})</h2><button className="text-[#0A7A3D] underline" onClick={props.onNavigateToBerths}>Manage berths</button></div>
      {!berths.length && <p className="text-gray-500">No berths have been recorded.</p>}
      <div className="grid gap-3 md:grid-cols-3">{berths.map(berth=><button key={berth.id} onClick={props.onNavigateToBerths} className="text-left border border-gray-200 rounded-lg p-3"><div className="font-semibold">{berth.name}</div><div className="text-sm text-gray-500">{berth.id} ? {berth.status.replaceAll('_',' ')}</div></button>)}</div>
    </section>
    <section className="bg-white rounded-xl border border-gray-200 p-5"><h2 className="font-semibold mb-4">Vessel operations</h2>
      {!active.length && <p className="text-gray-500">No active voyages have been recorded.</p>}
      <div className="space-y-3">{active.map(v=><button key={v.id} onClick={()=>props.onSelectVessel(v.vesselId)} className="flex flex-wrap items-center justify-between gap-3 w-full text-left border-b border-gray-100 pb-3">
        <div><div className="font-semibold">{vessels.find(s=>s.id===v.vesselId)?.name || v.vesselName}</div><div className="text-sm text-gray-500">{v.voyageNumber} · {v.currentStage.replaceAll('_',' ')}</div></div>
        <div className="text-sm">{(v.unloadedTonnes||0).toLocaleString()} / {(v.actualCargoT||v.plannedCargoT||0).toLocaleString()} tonnes unloaded</div>
        <span className={v.berthConflict?'text-red-700':'text-[#0A7A3D]'}>{v.berthConflict?'Berth conflict':v.health.replaceAll('_',' ')}</span>
      </button>)}</div>
    </section>
    <section className="bg-white rounded-xl border border-gray-200 p-5"><h2 className="font-semibold mb-4">Operational alerts ({alerts.length})</h2>
      {!alerts.length && <p className="text-gray-500">No current alerts.</p>}
      {alerts.slice(0,5).map(alert=><button key={alert.id} onClick={props.onNavigateToAlerts} className="block w-full text-left py-2 border-b border-gray-100"><span className="font-medium">{alert.title}</span><p className="text-sm text-gray-500">{alert.message}</p></button>)}
    </section>
  </div>;
}
