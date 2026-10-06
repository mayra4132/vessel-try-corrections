import React, { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader, KpiCard, Modal } from '../components/ui/KpiCard';
import {
  StatusBadge,
  OperationsHealthBadge,
  RiskBadge,
  DataQualityBadge,
  CurrentBlockerBadge,
  ScheduleSourceBadge,
  PaymentCountdownBadge,
} from '../components/ui/StatusBadge';
import { DualProgress, ProgressBar } from '../components/ui/DualProgress';
import { VesselCycleTimeline } from '../components/ui/VesselCycleTimeline';
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatTonnage,
  formatRate,
  formatHoursAndMinutes,
} from '../lib/format';
import { calculatePaymentAccountTotals } from '../lib/paymentEngine';
import { VesselActivitySection } from '../components/activities/VesselActivitySection';
import {
  Ship,
  ArrowLeft,
  Anchor,
  Fuel,
  CreditCard,
  Factory,
  Route,
  Clock,
  Plus,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface VesselDetailProps {
  vesselId: string;
  onBack: () => void;
  onNavigateToVoyages: () => void;
  onNavigateToPayments: () => void;
  onNavigateToBerths: () => void;
}

export function VesselDetail({
  vesselId,
  onBack,
  onNavigateToVoyages,
  onNavigateToPayments,
  onNavigateToBerths,
}: VesselDetailProps) {
  const {
    vessels,
    voyages,
    paymentAccounts,
    paymentTransactions,
    fuelOperations,
    operationalReadings,
    delayEvents,
    manufacturerQueue,
    api,
  } = useAppData();

  const vessel = vessels.find((v) => v.id === vesselId);
  const voyage = voyages.find((v) => v.vesselId === vesselId && v.status === 'ACTIVE');
  const fuel = fuelOperations.find((f) => f.voyageId === voyage?.id);
  const mfrPayment = paymentAccounts.find(
    (p) => p.voyageId === voyage?.id && p.category === 'MANUFACTURER'
  );
  const mfrQueue = manufacturerQueue.find((q) => q.voyageId === voyage?.id);
  const vesselReadings = operationalReadings.filter((r) => r.vesselId === vesselId);
  const vesselDelays = delayEvents.filter((d) => d.vesselId === vesselId);

  // Modals state
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isConfirmSlotModalOpen, setIsConfirmSlotModalOpen] = useState(false);

  // Add Reading form
  const [readingUnloaded, setReadingUnloaded] = useState(
    voyage?.unloadedTonnes ? String(voyage.unloadedTonnes + 300) : '7200'
  );
  const [readingRate, setReadingRate] = useState(
    voyage?.unloadingRateTph ? String(voyage.unloadingRateTph) : '605'
  );
  const [readingNotes, setReadingNotes] = useState('');

  // Add Delay form
  const [delayCategory, setDelayCategory] = useState<any>('Equipment');
  const [delayArea, setDelayArea] = useState('Pneumatic Manifold B01');
  const [delayDesc, setDelayDesc] = useState('');
  const [delayImpact, setDelayImpact] = useState('1.0');

  // Record Payment form
  const [paymentAmount, setPaymentAmount] = useState('100000000');
  const [paymentMethod, setPaymentMethod] = useState('Bank Wire (CRDB Bank)');
  const [paymentRef, setPaymentRef] = useState('CRDB-TZ-' + Math.floor(1000000 + Math.random() * 9000000));
  const [paymentNotes, setPaymentNotes] = useState('');

  // Record Confirmation form
  const [confirmedSlotTime, setConfirmedSlotTime] = useState(
    new Date(Date.now() + 30 * 3600000).toISOString().slice(0, 16)
  );
  const [confirmedPos, setConfirmedPos] = useState('2');

  if (!vessel) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-[#E1DED4]">
        <h3 className="text-lg font-bold text-[#14181A]">Vessel not found</h3>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 text-xs font-semibold bg-[#0C9349] text-white rounded-lg"
        >
          Return to Vessels
        </button>
      </div>
    );
  }

  if (!voyage) return <div className="bg-white border rounded-xl p-6 space-y-4">
    <button onClick={onBack} className="text-[#0A7A3D] underline">Back to Vessels</button>
    <h1 className="text-xl font-bold">{vessel.name}</h1>
    <p>No active voyage is linked to this vessel. Create a voyage and select this vessel and its berth to enable readings, delays, fuel and activity tracking.</p>
    <button onClick={onNavigateToVoyages} className="px-4 py-2 bg-[#0C9349] text-white rounded">Create a Voyage</button>
  </div>;

  // Payment totals
  const pmtTotals = mfrPayment
    ? calculatePaymentAccountTotals(mfrPayment, paymentTransactions)
    : null;

  // Handlers
  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voyage) return;

    const unl = Number(readingUnloaded);
    const rate = Number(readingRate);
    const total = voyage.actualCargoT || voyage.plannedCargoT || 9600;

    api.addOperationalReading({
      voyageId: voyage.id,
      vesselId: vessel.id,
      timestamp: new Date().toISOString(),
      source: 'Manual',
      unloadedTonnes: unl,
      remainingTonnes: Math.max(0, total - unl),
      observedRateTph: rate,
      dataQuality: 'CURRENT',
      notes: readingNotes.trim() || 'Manual sounding entry from terminal floor',
      enteredBy: 'Operations Manager (OM)',
    });

    setIsReadingModalOpen(false);
    setReadingNotes('');
  };

  const handleAddDelay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voyage) return;

    api.addDelayEvent({
      voyageId: voyage.id,
      vesselId: vessel.id,
      start: new Date().toISOString(),
      category: delayCategory,
      area: delayArea,
      description: delayDesc.trim(),
      impactHours: Number(delayImpact) || 1.0,
      resolved: false,
      recordedBy: 'Operations Manager (OM)',
    });

    setIsDelayModalOpen(false);
    setDelayDesc('');
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfrPayment || !voyage) return;

    api.addPaymentTransaction({
      paymentAccountId: mfrPayment.id,
      vesselId: vessel.id,
      voyageId: voyage.id,
      category: 'MANUFACTURER',
      amount: Number(paymentAmount),
      currency: 'TZS',
      transactionDate: new Date().toISOString(),
      paymentMethod,
      referenceNumber: paymentRef,
      enteredBy: 'Fatma M. (Finance Officer)',
      notes: paymentNotes.trim() || 'Settlement tranche recorded via single-vessel console',
    });

    setIsPaymentModalOpen(false);
    setPaymentNotes('');
  };

  const handleConfirmSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfrQueue) return;

    api.updateManufacturerConfirmation(
      mfrQueue.id,
      new Date(confirmedSlotTime).toISOString(),
      Number(confirmedPos)
    );

    setIsConfirmSlotModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Bar with Navigation and Key Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E1DED4]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-white border border-[#C9C4B6] hover:bg-[#F7F5F0] text-[#14181A] transition"
            title="Back to fleet"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[#14181A] flex items-center gap-2">
                <Ship className="w-6 h-6 text-[#0C9349]" />
                {vessel.name}
              </h1>
              <span className="text-xs font-mono text-[#3F4A47] bg-[#E1DED4]/60 px-2 py-0.5 rounded font-semibold">
                {vessel.reference}
              </span>
            </div>
            <div className="text-xs text-[#3F4A47] font-mono mt-0.5">
              Active Voyage: <strong>{voyage?.voyageNumber || 'None'}</strong> · IMO {vessel.imo || 'N/A'} · MMSI {vessel.mmsi || 'N/A'}
            </div>
          </div>
        </div>

        {/* High-level status badges */}
        {voyage && (
          <div className="flex items-center gap-2 flex-wrap">
            <OperationsHealthBadge health={voyage.health} />
            <RiskBadge risk={voyage.risk} />
            <StatusBadge stage={voyage.currentStage} />
          </div>
        )}
      </div>

      {/* Critical Path Current Blocker */}
      {voyage && (
        <CurrentBlockerBadge
          blocker={voyage.currentBlocker}
          description={voyage.blockerDescription}
        />
      )}

      {/* Full Vessel Cycle Timeline */}
      {voyage && <VesselCycleTimeline voyage={voyage} />}

      {/* Operational Activity Workflow Engine */}
      <VesselActivitySection
        vesselId={vesselId}
        vesselName={vessel?.name || 'Vessel'}
      />

      {/* 2-Column Core Operational Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1 & 2: CURRENT OPERATION & CARGO */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <Anchor className="w-4 h-4 text-[#0C9349]" />
              Current Operation & Cargo Unloading
            </h3>
            {voyage?.currentStage === 'UNLOADING' && (
              <button
                onClick={() => setIsReadingModalOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-[#0C9349] hover:bg-[#0A7A3D] text-white flex items-center gap-1 transition shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Sounding Reading
              </button>
            )}
          </div>

          {voyage?.currentStage === 'UNLOADING' ? (
            <>
              {/* Dual Progress */}
              <DualProgress
                cargoProgress={(voyage.unloadedTonnes / (voyage.actualCargoT || 9600)) * 100}
                scheduleProgress={72}
                unloadedT={voyage.unloadedTonnes}
                totalCargoT={voyage.actualCargoT || 9600}
                rateTph={voyage.unloadingRateTph}
                timeRemainingStr={formatHoursAndMinutes(
                  (voyage.actualCargoT - voyage.unloadedTonnes) / (voyage.unloadingRateTph || 600)
                )}
              />

              {/* Unloading Forecast Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                  <span className="text-[#3F4A47] text-[10px] uppercase font-bold block">Current Discharge Rate</span>
                  <span className="text-base font-mono font-bold text-[#14181A]">
                    {formatRate(voyage.unloadingRateTph)}
                  </span>
                  <span className="text-[10px] text-[#3F4A47] block mt-0.5">Dual compressor line 2</span>
                </div>
                <div className="p-2.5 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                  <span className="text-[#3F4A47] text-[10px] uppercase font-bold block">Forecast Unload Finish</span>
                  <span className="text-base font-mono font-bold text-[#0A7A3D]">
                    {formatTime(voyage.forecastUnloadEnd)}
                  </span>
                  <span className="text-[10px] text-[#3F4A47] block mt-0.5">
                    Planned: {formatTime(voyage.plannedUnloadEnd)}
                  </span>
                </div>
                <div className="p-2.5 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                  <span className="text-[#3F4A47] text-[10px] uppercase font-bold block">Berth Release Window</span>
                  <span className="text-base font-mono font-bold text-[#0E7C86]">
                    {formatTime(voyage.expectedBerthRelease)}
                  </span>
                  <span className="text-[10px] text-[#3F4A47] block mt-0.5">+1.5h line purge buffer</span>
                </div>
              </div>

              {/* Operational Readings Log */}
              <div>
                <h4 className="text-xs font-bold text-[#14181A] uppercase tracking-wider mb-2">
                  Recent Operational Soundings & Readings ({vesselReadings.length})
                </h4>
                <div className="border border-[#E1DED4] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F7F5F0] text-[#3F4A47] border-b border-[#E1DED4]">
                      <tr>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Unloaded</th>
                        <th className="py-2 px-3">Rate</th>
                        <th className="py-2 px-3">Quality</th>
                        <th className="py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1DED4]">
                      {vesselReadings.map((r) => (
                        <tr key={r.id} className="hover:bg-[#F7F5F0]/50 font-mono text-[11px]">
                          <td className="py-2 px-3 text-[#14181A]">{formatTime(r.timestamp)}</td>
                          <td className="py-2 px-3 font-semibold text-[#0A7A3D]">
                            {r.unloadedTonnes.toLocaleString()} T
                          </td>
                          <td className="py-2 px-3">{r.observedRateTph} t/h</td>
                          <td className="py-2 px-3">
                            <DataQualityBadge quality={r.dataQuality} />
                          </td>
                          <td className="py-2 px-3 font-sans text-xs text-[#3F4A47] truncate max-w-[150px]">
                            {r.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#3F4A47]">Current Activity:</span>
                <span className="font-semibold text-[#14181A]">{voyage?.currentStage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#3F4A47]">Cargo Type:</span>
                <span className="font-mono text-[#14181A]">{voyage?.cargoType || 'Bulk Portland Cement'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#3F4A47]">Planned Tonnage:</span>
                <span className="font-mono font-bold text-[#14181A]">{formatTonnage(voyage?.actualCargoT || 9400)}</span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: VIGOR BERTH STATUS & SEQUENCING */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <Anchor className="w-4 h-4 text-[#0C9349]" />
              VIGOR Berth B01 Allocation
            </h3>
            <button
              onClick={onNavigateToBerths}
              className="text-xs font-semibold text-[#0A7A3D] hover:underline"
            >
              Berth Management →
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                <span className="text-[10px] text-[#3F4A47] uppercase font-bold block">Assigned Berth</span>
                <span className="text-base font-bold text-[#14181A]">Berth B01</span>
                <span className="text-[10px] text-[#3F4A47] block mt-0.5">Bulk Cement Dedicated (180m)</span>
              </div>
              <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                <span className="text-[10px] text-[#3F4A47] uppercase font-bold block">Expected Release</span>
                <span className="text-base font-mono font-bold text-[#0A7A3D]">
                  {formatTime(voyage?.expectedBerthRelease)}
                </span>
                <span className="text-[10px] text-[#3F4A47] block mt-0.5">Buffer: 1.5 hours</span>
              </div>
            </div>

            {/* Berth Conflict Notification if returning */}
            {voyage?.berthConflict && (
              <div className="p-3.5 bg-[#F8E7E3] border border-[#AE3B2E]/40 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-[#AE3B2E] font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  BERTH CONFLICT DETECTED
                </div>
                <p className="text-[#14181A] leading-relaxed">
                  {voyage.conflictNotes || 'Return ETA precedes B01 release.'}
                </p>
                <div className="pt-2 flex justify-between font-mono text-xs font-bold text-[#AE3B2E]">
                  <span>Predicted Anchorage Wait:</span>
                  <span>{formatHoursAndMinutes(voyage.predictedAnchorageWaitHours)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: FUEL / OIL */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <Fuel className="w-4 h-4 text-[#C99A5B]" />
              Fuel & Bunkering Status
            </h3>
            {fuel && (
              <span className="text-xs font-mono font-bold bg-[#E7F4EB] text-[#0A7A3D] px-2 py-0.5 rounded">
                {fuel.status}
              </span>
            )}
          </div>

          {fuel ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                  <span className="text-[10px] text-[#3F4A47] uppercase font-bold block">Fuel Product & Qty</span>
                  <span className="text-sm font-bold text-[#14181A] mt-0.5">{fuel.quantity}T {fuel.fuelType}</span>
                  <span className="text-[10px] text-[#3F4A47] block mt-0.5">{fuel.supplierName}</span>
                </div>
                <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4]">
                  <span className="text-[10px] text-[#3F4A47] uppercase font-bold block">Estimated Cost</span>
                  <span className="text-sm font-mono font-bold text-[#14181A] mt-0.5">
                    {formatCurrency(fuel.estimatedCost)}
                  </span>
                  <span className="text-[10px] text-[#0A7A3D] block mt-0.5">Invoice: {fuel.invoiceNumber}</span>
                </div>
              </div>

              <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-1">
                <div className="flex justify-between font-mono">
                  <span className="text-[#3F4A47]">Bunkering Window:</span>
                  <span className="font-semibold text-[#14181A]">
                    {formatTime(fuel.scheduledStart)} – {formatTime(fuel.scheduledEnd)}
                  </span>
                </div>
                <div className="text-[11px] text-[#3F4A47]">
                  Delivery mode: Alongside Berth B01 via barge prior to departure clearance.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#F7F5F0] rounded-lg text-xs text-[#3F4A47]">
              No bunkering operations required for this voyage cycle. Vessel fuel reserves sufficient.
            </div>
          )}
        </div>

        {/* SECTION 5: MANUFACTURER PAYMENT & QUEUE ELIGIBILITY */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#C99A5B]" />
              Manufacturer Payment & Eligibility Gate
            </h3>
            {mfrPayment && !mfrPayment.isEligible && (
              <button
                onClick={() => setIsPaymentModalOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-[#14181A] hover:bg-[#3F4A47] text-white flex items-center gap-1 transition shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Payment Tranche
              </button>
            )}
          </div>

          {mfrPayment && pmtTotals ? (
            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[#3F4A47]">Counterparty:</span>
                  <span className="font-bold text-[#14181A]">{mfrPayment.counterpartyName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#3F4A47]">Invoice Amount:</span>
                  <span className="font-mono font-semibold text-[#14181A]">
                    {formatCurrency(mfrPayment.requiredAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#3F4A47]">Amount Paid:</span>
                  <span className="font-mono font-semibold text-[#0A7A3D]">
                    {formatCurrency(pmtTotals.totalPaid)} ({pmtTotals.progressPercent}%)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#3F4A47]">Remaining Balance:</span>
                  <span className="font-mono font-bold text-[#AE3B2E]">
                    {formatCurrency(pmtTotals.remaining)}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#E1DED4]">
                  <ProgressBar
                    label="Payment Progress"
                    value={pmtTotals.progressPercent}
                    color={pmtTotals.isEligible ? 'green' : 'amber'}
                  />
                </div>

                <div className="flex justify-between items-center pt-2 text-xs">
                  <span className="text-[#3F4A47]">Deadline Countdown:</span>
                  <PaymentCountdownBadge
                    state={pmtTotals.countdownState}
                    hoursRemaining={pmtTotals.hoursRemaining}
                  />
                </div>
              </div>

              {/* Eligibility Gate Result */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  pmtTotals.isEligible
                    ? 'bg-[#E7F4EB] border-[#0C9349]/40 text-[#0A7A3D]'
                    : 'bg-[#F8E7E3] border-[#AE3B2E]/40 text-[#AE3B2E]'
                }`}
              >
                <div>
                  <div className="font-bold text-xs uppercase tracking-wide">
                    {pmtTotals.isEligible ? 'Scheduling Eligible' : 'Eligibility Withheld'}
                  </div>
                  <div className="text-[11px] text-[#14181A] mt-0.5">
                    {pmtTotals.isEligible
                      ? '100% threshold achieved. Vessel eligible for official queue assignment.'
                      : 'Requires full invoice clearance prior to manufacturer loading slot lock.'}
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 bg-white rounded border">
                  {pmtTotals.isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#F7F5F0] rounded-lg text-xs text-[#3F4A47]">
              No manufacturer invoices linked to this rotation.
            </div>
          )}
        </div>

        {/* SECTION 6: MANUFACTURER QUEUE & LOADING */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <Factory className="w-4 h-4 text-[#B5760F]" />
              Manufacturer Queue & Loading Slot
            </h3>
            {mfrQueue && (
              <button
                onClick={() => setIsConfirmSlotModalOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-[#14181A] hover:bg-[#3F4A47] text-white flex items-center gap-1 transition shadow-xs"
              >
                Record Confirmation
              </button>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[#3F4A47]">Terminal:</span>
                <span className="font-bold text-[#14181A]">Tanga Cement PLC (Mamba Wharf)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#3F4A47]">Predicted Queue Position:</span>
                <span className="font-mono font-bold text-[#14181A]">
                  #{mfrQueue?.predictedQueuePosition || '4'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#3F4A47]">Predicted Loading Slot:</span>
                <span className="font-mono font-semibold text-[#14181A]">
                  {formatDateTime(voyage?.manufacturerSlotForecast)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#3F4A47]">Manufacturer Confirmed Slot:</span>
                <span className="font-mono font-bold text-[#0A7A3D]">
                  {voyage?.manufacturerSlotConfirmed
                    ? formatDateTime(voyage.manufacturerSlotConfirmed)
                    : 'Pending Confirmation'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 7: VOYAGE SCHEDULE & ROTATION */}
        <div className="bg-white border border-[#E1DED4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <Route className="w-4 h-4 text-[#0E7C86]" />
              Voyage Schedule & Rotation
            </h3>
            {voyage && <ScheduleSourceBadge source={voyage.scheduleSource} />}
          </div>

          {voyage ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
                <div className="flex justify-between font-mono">
                  <span className="text-[#3F4A47]">Rotation Route:</span>
                  <span className="font-bold text-[#14181A]">
                    {voyage.origin} → {voyage.destination}
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-[#3F4A47]">Return ETA Forecast:</span>
                  <span className="font-bold text-[#14181A]">
                    {formatDateTime(voyage.returnEtaForecast)}
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-[#3F4A47]">Expected Berth Release:</span>
                  <span className="font-bold text-[#0E7C86]">
                    {formatDateTime(voyage.expectedBerthRelease)}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[11px] pt-1 border-t border-[#E1DED4]">
                  <span className="text-[#3F4A47]">Cycle Stage:</span>
                  <span className="text-[#14181A] font-semibold">{voyage.currentStage}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#F7F5F0] rounded-lg text-xs text-[#3F4A47]">
              No active voyage cycle recorded for this vessel.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 8: OPERATIONAL DELAYS & EVENTS */}
      <div className="bg-white border border-[#E1DED4] rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4] mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#AE3B2E]" />
              Confirmed Operational Delays & Incidents ({vesselDelays.length})
            </h3>
            <p className="text-xs text-[#3F4A47]">
              Human-confirmed delay logs that feed directly into downstream schedule recalculations.
            </p>
          </div>
          <button
            onClick={() => setIsDelayModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-[#AE3B2E] hover:bg-[#8E2F24] text-white flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Record Delay Event
          </button>
        </div>

        {vesselDelays.length > 0 ? (
          <div className="border border-[#E1DED4] rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F0] text-[#3F4A47] border-b border-[#E1DED4]">
                <tr>
                  <th className="py-2.5 px-3">Start Time</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Area</th>
                  <th className="py-2.5 px-3">Impact</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1DED4]">
                {vesselDelays.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F7F5F0]/50 text-[11px]">
                    <td className="py-2.5 px-3 font-mono text-[#14181A]">{formatDateTime(d.start)}</td>
                    <td className="py-2.5 px-3 font-bold text-[#AE3B2E]">{d.category}</td>
                    <td className="py-2.5 px-3 font-medium text-[#14181A]">{d.area}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#14181A]">{d.impactHours}h</td>
                    <td className="py-2.5 px-3 text-[#3F4A47] max-w-xs">{d.description}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${d.resolved ? 'bg-[#E7F4EB] text-[#0A7A3D]' : 'bg-[#F8E7E3] text-[#AE3B2E]'}`}>
                        {d.resolved ? 'RESOLVED' : 'ACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 bg-[#F7F5F0] rounded-lg text-xs text-[#3F4A47] text-center">
            No active or historical delay events logged for this voyage cycle.
          </div>
        )}
      </div>

      {/* MODAL: ADD OPERATIONAL READING */}
      <Modal
        isOpen={isReadingModalOpen}
        onClose={() => setIsReadingModalOpen(false)}
        title="Add Sounding / Operational Reading"
        subtitle="New discharge readings immediately recalculate remaining tonnes and expected berth release."
      >
        <form onSubmit={handleAddReading} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#14181A] mb-1">
              Current Unloaded Tonnes (T) *
            </label>
            <input
              type="number"
              required
              value={readingUnloaded}
              onChange={(e) => setReadingUnloaded(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
            />
            <p className="text-[11px] text-[#3F4A47] mt-1">
              Total cargo: {(voyage?.actualCargoT || 9600).toLocaleString()} T
            </p>
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">
              Observed Unloading Rate (tonnes/hour) *
            </label>
            <input
              type="number"
              required
              value={readingRate}
              onChange={(e) => setReadingRate(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">Observation Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Silo line 2 active, compressor pressure 2.4 bar..."
              value={readingNotes}
              onChange={(e) => setReadingNotes(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
            />
          </div>

          <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsReadingModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white border border-[#E1DED4] text-[#3F4A47] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] text-white font-semibold shadow-xs"
            >
              Save & Recalculate Forecast
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: RECORD PAYMENT TRANCHE */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Manufacturer Payment Tranche"
        subtitle="Individual wire transaction for Tanga Cement invoice #TC-INV-2026-0941."
      >
        <form onSubmit={handleAddPayment} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#14181A] mb-1">
              Tranche Amount (TZS) *
            </label>
            <input
              type="number"
              required
              step="1000000"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono font-bold"
            />
            <p className="text-[11px] text-[#3F4A47] mt-1">
              Current remaining balance: {formatCurrency(pmtTotals?.remaining || 200000000)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
              >
                <option>Bank Wire (CRDB Bank)</option>
                <option>Bank Wire (NMB Bank)</option>
                <option>Bank Wire (Stanbic Bank)</option>
                <option>Direct Transfer</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Reference / Swift Ref</label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">Notes</label>
            <input
              type="text"
              placeholder="e.g. Cleared via treasury desk..."
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
            />
          </div>

          <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white border border-[#E1DED4] text-[#3F4A47] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] text-white font-semibold shadow-xs"
            >
              Submit Wire & Unlock Eligibility
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: RECORD DELAY EVENT */}
      <Modal
        isOpen={isDelayModalOpen}
        onClose={() => setIsDelayModalOpen(false)}
        title="Record Operational Delay Event"
        subtitle="Confirmed human delays immediately flag downstream berths and schedule warnings."
      >
        <form onSubmit={handleAddDelay} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Category *</label>
              <select
                value={delayCategory}
                onChange={(e) => setDelayCategory(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
              >
                <option>Equipment</option>
                <option>Weather</option>
                <option>Labour</option>
                <option>Berth</option>
                <option>Fuel</option>
                <option>Payment</option>
                <option>Manufacturer</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#14181A] mb-1">Impact (Hours) *</label>
              <input
                type="number"
                step="0.5"
                value={delayImpact}
                onChange={(e) => setDelayImpact(e.target.value)}
                className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">Location / Equipment Area</label>
            <input
              type="text"
              value={delayArea}
              onChange={(e) => setDelayArea(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">Description *</label>
            <textarea
              rows={3}
              required
              placeholder="Describe the operational cause and immediate remediation..."
              value={delayDesc}
              onChange={(e) => setDelayDesc(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349]"
            />
          </div>

          <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDelayModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white border border-[#E1DED4] text-[#3F4A47] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#AE3B2E] hover:bg-[#8E2F24] text-white font-semibold shadow-xs"
            >
              Confirm Delay Event
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: CONFIRM MANUFACTURER SLOT */}
      <Modal
        isOpen={isConfirmSlotModalOpen}
        onClose={() => setIsConfirmSlotModalOpen(false)}
        title="Record Manufacturer Confirmed Slot"
        subtitle="Formal berthing window communicated by Tanga Cement terminal."
      >
        <form onSubmit={handleConfirmSlot} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#14181A] mb-1">
              Confirmed Loading Slot Start *
            </label>
            <input
              type="datetime-local"
              required
              value={confirmedSlotTime}
              onChange={(e) => setConfirmedSlotTime(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#14181A] mb-1">
              Confirmed Queue Position
            </label>
            <input
              type="number"
              value={confirmedPos}
              onChange={(e) => setConfirmedPos(e.target.value)}
              className="w-full p-2 bg-[#F7F5F0] border border-[#E1DED4] rounded-lg focus:outline-none focus:border-[#0C9349] font-mono"
            />
          </div>

          <div className="pt-3 border-t border-[#E1DED4] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsConfirmSlotModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white border border-[#E1DED4] text-[#3F4A47] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] text-white font-semibold shadow-xs"
            >
              Save Confirmation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
