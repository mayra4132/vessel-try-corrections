import React from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader, KpiCard } from '../components/ui/KpiCard';
import {
  StatusBadge,
  OperationsHealthBadge,
  RiskBadge,
  CurrentBlockerBadge,
  PaymentCountdownBadge,
} from '../components/ui/StatusBadge';
import { ProgressBar, DualProgress } from '../components/ui/DualProgress';
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatTonnage,
  formatHoursAndMinutes,
} from '../lib/format';
import {
  Ship,
  Anchor,
  AlertTriangle,
  CreditCard,
  Fuel,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { calculatePaymentAccountTotals } from '../lib/paymentEngine';

interface DashboardProps {
  onSelectVessel: (vesselId: string) => void;
  onNavigateToPayments: () => void;
  onNavigateToBerths: () => void;
  onNavigateToAlerts: () => void;
}

export function Dashboard({
  onSelectVessel,
  onNavigateToPayments,
  onNavigateToBerths,
  onNavigateToAlerts,
}: DashboardProps) {
  const {
    vessels,
    voyages,
    paymentAccounts,
    paymentTransactions,
    fuelOperations,
    alerts,
    activities,
  } = useAppData();

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? 'Good morning'
      : hour < 17
      ? 'Good afternoon'
      : 'Good evening';

  // Metrics
  const activeVesselsCount = vessels.filter((v) => v.active).length;
  const currentlyUnloadingCount = voyages.filter((v) => v.currentStage === 'UNLOADING').length;
  const berthConflictsCount = voyages.filter((v) => v.berthConflict).length;
  const criticalAlertsCount = alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING').length;

  const sailingCount = voyages.filter((v) => v.currentStage.includes('SAILING') || v.currentStage.includes('RETURNING')).length;
  const atMfrCount = voyages.filter((v) => v.currentStage.includes('MANUFACTURER') || v.currentStage === 'LOADING').length;
  const pmtAtRiskCount = paymentAccounts.filter((p) => !p.isEligible && p.category === 'MANUFACTURER').length;
  const fuelActionsDue = fuelOperations.filter((f) => f.status === 'SCHEDULED' || f.status === 'PAYMENT_PENDING').length;

  // Primary V1 Manufacturer Payment for Today's Finance Action
  const v1MfrPayment = paymentAccounts.find(
    (p) => p.vesselId === 'v-01' && p.category === 'MANUFACTURER'
  );
  const v1PmtTotals = v1MfrPayment
    ? calculatePaymentAccountTotals(v1MfrPayment, paymentTransactions)
    : null;

  // V3 Berth conflict
  const v3Voyage = voyages.find((v) => v.vesselId === 'v-03');

  if (!vessels.length || !voyages.length) return <div className="space-y-4">
    <PageHeader title="Operations Dashboard" description="No vessel operations yet." />
    <p>Add vessels and voyages before viewing operational metrics.</p>
  </div>;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        eyebrow="PORT & VESSEL INTELLIGENCE"
        title="Operations Dashboard"
        description="Real-time vessel cycle coordination for VIGOR Cement Works, monitoring berth availability, pneumatic unloading, bunkering, and manufacturer financial eligibility."
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToBerths}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#C9C4B6] hover:border-[#14181A] transition text-[#14181A] flex items-center gap-1.5"
          >
            <Anchor className="w-3.5 h-3.5 text-[#0C9349]" />
            Berth B01 Status
          </button>
          <button
            onClick={onNavigateToPayments}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0C9349] hover:bg-[#0A7A3D] transition text-white flex items-center gap-1.5 shadow-xs"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Finance Center
          </button>
        </div>
      </PageHeader>

      {/* Row 1: Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active Vessels"
          value={`${activeVesselsCount} / ${vessels.length}`}
          subtext="100% fleet operational"
          icon={<Ship className="w-5 h-5" />}
          variant="success"
        />
        <KpiCard
          label="Currently Unloading"
          value={currentlyUnloadingCount}
          subtext="Berth B01 · MV VIGOR 01"
          icon={<Anchor className="w-5 h-5" />}
          variant="teal"
        />
        <KpiCard
          label="Needs Attention"
          value={criticalAlertsCount}
          subtext="Payment & berth actions"
          icon={<AlertTriangle className="w-5 h-5" />}
          variant={criticalAlertsCount > 0 ? 'warning' : 'default'}
          onClick={onNavigateToAlerts}
        />
        <KpiCard
          label="Berth Conflicts"
          value={berthConflictsCount}
          subtext="MV VIGOR 03 anchorage wait"
          icon={<Clock className="w-5 h-5" />}
          variant={berthConflictsCount > 0 ? 'danger' : 'default'}
          onClick={onNavigateToBerths}
        />
      </div>

      {/* Row 2: Secondary Operational Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1DED4] rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase text-[#3F4A47]">Vessels In Transit</div>
            <div className="text-lg font-mono font-bold text-[#14181A]">{sailingCount} vessels</div>
          </div>
          <span className="text-xs font-mono text-[#0E7C86] bg-[#E4F1F2] px-2 py-0.5 rounded">
            V02 & V03
          </span>
        </div>
        <div className="bg-white border border-[#E1DED4] rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase text-[#3F4A47]">At Manufacturer</div>
            <div className="text-lg font-mono font-bold text-[#14181A]">{atMfrCount} vessel</div>
          </div>
          <span className="text-xs font-mono text-[#B5760F] bg-[#FBF0DD] px-2 py-0.5 rounded">
            Tanga Port
          </span>
        </div>
        <div className="bg-white border border-[#E1DED4] rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase text-[#3F4A47]">Payments At Risk</div>
            <div className="text-lg font-mono font-bold text-[#AE3B2E]">{pmtAtRiskCount} order</div>
          </div>
          <span className="text-xs font-mono text-[#AE3B2E] bg-[#F8E7E3] px-2 py-0.5 rounded">
            MV VIGOR 01
          </span>
        </div>
        <div className="bg-white border border-[#E1DED4] rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase text-[#3F4A47]">Fuel Actions Due</div>
            <div className="text-lg font-mono font-bold text-[#14181A]">{fuelActionsDue} ops</div>
          </div>
          <span className="text-xs font-mono text-[#0A7A3D] bg-[#E7F4EB] px-2 py-0.5 rounded">
            Post-Discharge
          </span>
        </div>
      </div>

      {/* Row 3: Daily Management Brief & Today's Finance Action */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Operations Brief (2 columns) */}
        <div className="lg:col-span-2 bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4] mb-4">
            <div>
              <span className="text-[11px] font-mono text-[#0A7A3D] uppercase font-bold tracking-wider">
                {greeting}, Operations Manager
              </span>
              <h2 className="text-base font-bold text-[#14181A] tracking-tight">
                Today's Operations Brief
              </h2>
            </div>
            <span className="text-xs font-mono text-[#3F4A47] bg-[#F7F5F0] px-2.5 py-1 rounded border border-[#E1DED4]">
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="space-y-3.5">
            {/* V01 Summary */}
            <div
              onClick={() => onSelectVessel('v-01')}
              className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] flex items-start justify-between gap-4 cursor-pointer hover:border-[#3F4A47] transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#14181A]">MV VIGOR 01</span>
                  <StatusBadge stage="UNLOADING" />
                  {activities?.find((a) => a.vesselId === 'v-01' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED')) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E8F5E9] text-[#0C9349] border border-[#A5D6A7]">
                      Task: {activities.find((a) => a.vesselId === 'v-01' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED'))?.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#3F4A47]">
                  Discharging cement at Berth B01 (72% complete, rate 605 t/h). Forecast unload completion at{' '}
                  <strong className="text-[#14181A] font-mono">
                    {formatTime(voyages.find((v) => v.vesselId === 'v-01')?.forecastUnloadEnd)}
                  </strong>
                  . Bunkering scheduled alongside upon release.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#3F4A47] shrink-0 mt-1" />
            </div>

            {/* V02 Summary */}
            <div
              onClick={() => onSelectVessel('v-02')}
              className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] flex items-start justify-between gap-4 cursor-pointer hover:border-[#3F4A47] transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#14181A]">MV VIGOR 02</span>
                  <StatusBadge stage="SAILING_TO_MANUFACTURER" />
                  {activities?.find((a) => a.vesselId === 'v-02' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED')) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E8F5E9] text-[#0C9349] border border-[#A5D6A7]">
                      Task: {activities.find((a) => a.vesselId === 'v-02' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED'))?.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#3F4A47]">
                  Cruising northward in Pemba Channel at 10.8 knots. ETA Tanga Cement Wharf tomorrow{' '}
                  <strong className="text-[#14181A] font-mono">
                    {formatTime(voyages.find((v) => v.vesselId === 'v-02')?.manufacturerEtaForecast)}
                  </strong>
                  . 100% manufacturer payment settled; queue eligibility confirmed.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#3F4A47] shrink-0 mt-1" />
            </div>

            {/* V03 Summary */}
            <div
              onClick={() => onSelectVessel('v-03')}
              className="p-3 bg-[#F8E7E3]/60 rounded-lg border border-[#AE3B2E]/30 flex items-start justify-between gap-4 cursor-pointer hover:border-[#AE3B2E] transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#14181A]">MV VIGOR 03</span>
                  <StatusBadge stage="RETURNING_TO_VIGOR" />
                  <span className="text-[10px] font-bold text-[#AE3B2E] bg-white px-1.5 py-0.5 rounded border border-[#AE3B2E]/30">
                    BERTH CONFLICT
                  </span>
                  {activities?.find((a) => a.vesselId === 'v-03' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED')) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E8F5E9] text-[#0C9349] border border-[#A5D6A7]">
                      Task: {activities.find((a) => a.vesselId === 'v-03' && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED'))?.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#14181A]">
                  Laden with 9,400T bulk cement. Forecast return ETA{' '}
                  <strong className="font-mono">{formatTime(v3Voyage?.returnEtaForecast)}</strong> precedes Berth B01 release.
                  Anticipated anchorage wait:{' '}
                  <strong className="text-[#AE3B2E] font-mono">
                    {formatHoursAndMinutes(v3Voyage?.predictedAnchorageWaitHours || 2.7)}
                  </strong>
                  .
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#AE3B2E] shrink-0 mt-1" />
            </div>
          </div>
        </div>

        {/* Today's Finance Action Card (Part 31) */}
        <div className="bg-white border-2 border-[#C99A5B] rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#B5760F] bg-[#F4EBDB] px-2 py-0.5 rounded">
                CRITICAL FINANCE ACTION
              </span>
              <CreditCard className="w-4 h-4 text-[#C99A5B]" />
            </div>
            <h3 className="text-base font-bold text-[#14181A]">MV VIGOR 01</h3>
            <p className="text-xs text-[#3F4A47] mt-0.5">Tanga Cement Advance Payment</p>

            <div className="mt-4 p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#3F4A47]">Remaining Balance:</span>
                <span className="text-sm font-mono font-bold text-[#AE3B2E]">
                  {formatCurrency(v1PmtTotals?.remaining || 200000000)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#3F4A47]">Invoice Required:</span>
                <span className="font-mono text-[#14181A]">{formatCurrency(v1MfrPayment?.requiredAmount || 500000000)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#3F4A47]">Payment Deadline:</span>
                <span className="font-mono font-semibold text-[#14181A]">
                  {formatDateTime(v1MfrPayment?.deadline)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E1DED4]">
                <span className="text-[#3F4A47]">Scheduling Eligibility:</span>
                <span className="text-xs font-mono font-bold text-[#AE3B2E] bg-[#F8E7E3] px-1.5 py-0.2 rounded">
                  NOT YET ELIGIBLE
                </span>
              </div>
            </div>

            <div className="mt-3 p-2.5 bg-[#FBF0DD] border border-[#B5760F]/30 rounded-lg text-xs text-[#B5760F]">
              <strong>Potential Downstream Impact:</strong> If balance is not wired by deadline, Tanga manufacturer loading slot will be deferred, delaying subsequent return rotation by up to 28 hours.
            </div>
          </div>

          <button
            onClick={onNavigateToPayments}
            className="mt-4 w-full py-2 px-3 text-xs font-semibold rounded-lg bg-[#14181A] hover:bg-[#3F4A47] text-white flex items-center justify-center gap-2 transition"
          >
            <span>Record Wire Transaction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 4: Needs Attention Alerts List */}
      <div className="bg-white border border-[#E1DED4] rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4] mb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#14181A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B5760F]" />
              Operational Attention Items ({alerts.length})
            </h3>
            <p className="text-xs text-[#3F4A47]">
              Real-time conflicts, deadline countdowns, and rate variance warnings.
            </p>
          </div>
          <button
            onClick={onNavigateToAlerts}
            className="text-xs font-semibold text-[#0A7A3D] hover:underline"
          >
            View all alerts ({alerts.length}) →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.slice(0, 4).map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.severity === 'CRITICAL'
                  ? 'bg-[#F8E7E3]/60 border-[#AE3B2E]/40'
                  : alert.severity === 'WARNING'
                  ? 'bg-[#FBF0DD]/60 border-[#B5760F]/40'
                  : 'bg-[#E4F1F2]/60 border-[#0E7C86]/30'
              } flex items-start gap-3`}
            >
              <div className="mt-0.5 shrink-0">
                {alert.severity === 'CRITICAL' ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#AE3B2E] inline-block" />
                ) : alert.severity === 'WARNING' ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#B5760F] inline-block" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0E7C86] inline-block" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-[#14181A] truncate">{alert.title}</h4>
                  <span className="text-[10px] font-mono text-[#3F4A47] shrink-0">
                    {formatTime(alert.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-[#3F4A47] mt-0.5 line-clamp-2 leading-relaxed">
                  {alert.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 5: Active Vessel Cards (Part 33) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold uppercase tracking-wide text-[#14181A]">
              Active Fleet Vessels ({vessels.length})
            </h3>
            <p className="text-xs text-[#3F4A47]">
              Click any vessel card to open the Single-Vessel Control Centre.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {vessels.map((vessel) => {
            const voyage = voyages.find((v) => v.vesselId === vessel.id && v.status === 'ACTIVE');
            const mfrPmt = paymentAccounts.find(
              (p) => p.vesselId === vessel.id && p.category === 'MANUFACTURER'
            );
            const pmtTotals = mfrPmt
              ? calculatePaymentAccountTotals(mfrPmt, paymentTransactions)
              : null;

            return (
              <div
                key={vessel.id}
                onClick={() => onSelectVessel(vessel.id)}
                className="bg-white border border-[#E1DED4] rounded-xl p-5 shadow-xs hover:border-[#3F4A47] transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E1DED4] mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Ship className="w-4 h-4 text-[#0C9349]" />
                        <h4 className="text-sm font-bold text-[#14181A]">{vessel.name}</h4>
                      </div>
                      <span className="text-[10px] font-mono text-[#3F4A47]">
                        Ref: {vessel.reference} · IMO {vessel.imo || 'N/A'}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {voyage && <OperationsHealthBadge health={voyage.health} />}
                      {voyage && <StatusBadge stage={voyage.currentStage} />}
                    </div>
                  </div>

                  {/* Dual Progress / Cargo Metric */}
                  {voyage && (
                    <div className="mb-4">
                      {voyage.currentStage === 'UNLOADING' ? (
                        <DualProgress
                          cargoProgress={(voyage.unloadedTonnes / (voyage.actualCargoT || 9600)) * 100}
                          scheduleProgress={70}
                          unloadedT={voyage.unloadedTonnes}
                          totalCargoT={voyage.actualCargoT || 9600}
                          rateTph={voyage.unloadingRateTph}
                          timeRemainingStr={formatHoursAndMinutes(
                            (voyage.actualCargoT - voyage.unloadedTonnes) / voyage.unloadingRateTph
                          )}
                        />
                      ) : (
                        <div className="p-3 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[#3F4A47]">Cargo:</span>
                            <span className="font-semibold text-[#14181A]">
                              {formatTonnage(voyage.actualCargoT || 9400)} CEM I
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#3F4A47]">Route:</span>
                            <span className="font-mono text-[#14181A]">
                              {voyage.origin} → {voyage.destination}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#3F4A47]">Next Key ETA:</span>
                            <span className="font-mono font-bold text-[#0E7C86]">
                              {voyage.currentStage === 'RETURNING_TO_VIGOR'
                                ? `VIGOR ${formatDateTime(voyage.returnEtaForecast)}`
                                : `MFR ${formatDateTime(voyage.manufacturerEtaForecast)}`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Current Blocker Badge */}
                  {voyage && (
                    <div className="mb-4">
                      <CurrentBlockerBadge
                        blocker={voyage.currentBlocker}
                        description={voyage.blockerDescription}
                      />
                    </div>
                  )}

                  {/* Financial Readiness */}
                  <div className="pt-2 border-t border-[#E1DED4] text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[#3F4A47]">Manufacturer Payment:</span>
                      <span className="font-mono font-bold">
                        {pmtTotals ? (
                          pmtTotals.isEligible ? (
                            <span className="text-[#0A7A3D]">ELIGIBLE (100%)</span>
                          ) : (
                            <span className="text-[#AE3B2E]">
                              {pmtTotals.progressPercent}% ({formatCurrency(pmtTotals.remaining, 'TZS', true)} due)
                            </span>
                          )
                        ) : (
                          'N/A'
                        )}
                      </span>
                    </div>

                    {voyage?.berthConflict && (
                      <div className="flex justify-between items-center text-[#AE3B2E]">
                        <span className="font-semibold">Berth B01 Conflict:</span>
                        <span className="font-mono font-bold">
                          +{voyage.predictedAnchorageWaitHours}h wait
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Button */}
                <div className="mt-4 pt-3 border-t border-[#E1DED4] flex items-center justify-between text-xs text-[#0A7A3D] font-semibold group">
                  <span>Open Vessel Control Center</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
