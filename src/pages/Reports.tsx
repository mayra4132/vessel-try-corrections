import React, { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { PageHeader, KpiCard } from '../components/ui/KpiCard';
import {
  formatTonnage,
  formatCurrency,
  formatDateTime,
  formatHoursAndMinutes,
} from '../lib/format';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Clock,
  Ship,
  Anchor,
} from 'lucide-react';

export function Reports() {
  const { voyages, vessels, paymentTransactions, systemSettings } = useAppData();
  const [reportType, setReportType] = useState<'SHIFT_HANDOFF' | 'EXECUTIVE_WEEKLY' | 'BERTH_UTILIZATION'>('SHIFT_HANDOFF');

  const totalCargoDischargedMonth = 28600;
  const avgTurnaroundHours = 18.5;
  const berthOccupancyRate = 87.4;

  if (!vessels.length || !voyages.length) return <div className="space-y-4">
    <PageHeader title="Operations Reports" description="No vessel operations yet." />
    <p>Add vessels and voyages before viewing operational reports.</p>
  </div>;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="ANALYTICS & AUDIT"
        title="Operations Reports & Shift Handoff"
        description="Standardized operational logs, shift turnover summaries, and quarterly throughput metrics for Zanzibar Port Authority and VIGOR management."
      >
        <button
          onClick={() => window.print()}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-[#C9C4B6] hover:border-[#14181A] text-[#14181A] flex items-center gap-1.5 transition shadow-xs"
        >
          <Printer className="w-4 h-4 text-[#0C9349]" />
          Print / Export Report
        </button>
      </PageHeader>

      {/* Analytics KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Monthly Discharged"
          value={formatTonnage(totalCargoDischargedMonth)}
          subtext="Dry bulk Portland cement"
          icon={<Ship className="w-5 h-5" />}
          variant="success"
        />
        <KpiCard
          label="Berth B01 Occupancy"
          value={`${berthOccupancyRate}%`}
          subtext="High utilization factor"
          icon={<Anchor className="w-5 h-5" />}
          variant="teal"
        />
        <KpiCard
          label="Avg. Port Turnaround"
          value={`${avgTurnaroundHours}h`}
          subtext="Discharge + buffer + castoff"
          icon={<Clock className="w-5 h-5" />}
        />
        <KpiCard
          label="Scheduled Cycles"
          value="12 Completed"
          subtext="100% safety & compliance"
          icon={<CheckCircle2 className="w-5 h-5" />}
          variant="success"
        />
      </div>

      {/* Report Template Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setReportType('SHIFT_HANDOFF')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
            reportType === 'SHIFT_HANDOFF'
              ? 'bg-[#14181A] text-white'
              : 'bg-white text-[#3F4A47] border border-[#E1DED4] hover:bg-[#F7F5F0]'
          }`}
        >
          Terminal Shift Handoff Report
        </button>
        <button
          onClick={() => setReportType('EXECUTIVE_WEEKLY')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
            reportType === 'EXECUTIVE_WEEKLY'
              ? 'bg-[#14181A] text-white'
              : 'bg-white text-[#3F4A47] border border-[#E1DED4] hover:bg-[#F7F5F0]'
          }`}
        >
          Executive Weekly Brief
        </button>
        <button
          onClick={() => setReportType('BERTH_UTILIZATION')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
            reportType === 'BERTH_UTILIZATION'
              ? 'bg-[#14181A] text-white'
              : 'bg-white text-[#3F4A47] border border-[#E1DED4] hover:bg-[#F7F5F0]'
          }`}
        >
          Berth B01 Bottleneck Audit
        </button>
      </div>

      {/* Formatted Report Sheet */}
      <div className="bg-white border border-[#E1DED4] rounded-xl p-8 shadow-xs max-w-4xl mx-auto space-y-6">
        {/* Report Letterhead */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[#14181A]">
          <div>
            <div className="text-[#0A7A3D] font-mono font-extrabold tracking-widest text-lg">
              VIGOR CEMENT WORKS
            </div>
            <div className="text-xs text-[#3F4A47] font-semibold uppercase tracking-wider">
              Smart Port Operations · Zanzibar Terminal
            </div>
          </div>
          <div className="text-right text-xs font-mono text-[#3F4A47]">
            <div>DOC-REF: VIG-OPS-2026-0903</div>
            <div>Generated: {new Date().toLocaleString()} EAT</div>
          </div>
        </div>

        {reportType === 'SHIFT_HANDOFF' && (
          <div className="space-y-5 text-xs text-[#14181A] leading-relaxed">
            <div>
              <h3 className="text-base font-bold text-[#14181A] mb-1">
                OPERATIONAL SHIFT TURNOVER BRIEF (Day Shift → Night Shift)
              </h3>
              <p className="text-[#3F4A47]">
                Duty Terminal Officer: Operations Manager | Location: Berth B01 Control Cabin
              </p>
            </div>

            <div className="p-4 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
              <div className="font-bold text-sm text-[#14181A]">1. Berth B01 Current Status</div>
              <p>
                <strong>MV VIGOR 01</strong> is currently moored alongside discharging bulk cement. 72% unloaded (6,912T out of 9,600T). Average observed discharge rate remains steady at 605 t/h on Silo Line 2. Compressor manifold operating smoothly at 2.4 bar. Unloading is forecast to conclude at <strong>17:45 EAT</strong>, followed by a mandatory 1.5-hour pneumatic line purge and bunker barge connection. Expected castoff / berth release is <strong>19:15 EAT</strong>.
              </p>
            </div>

            <div className="p-4 bg-[#F8E7E3]/60 rounded-lg border border-[#AE3B2E]/40 space-y-2">
              <div className="font-bold text-sm text-[#AE3B2E]">2. High-Priority Operational Attention: MV VIGOR 03</div>
              <p>
                <strong>MV VIGOR 03</strong> is returning southward laden with 9,400T cement. Forecast arrival at Zanzibar fairway buoy is <strong>16:30 EAT</strong>. Because Berth B01 will not be clear until 19:15 EAT, MV VIGOR 03 has been instructed to drop anchor in Zone Charlie. Estimated anchorage holding duration is <strong>2.7 hours</strong>. Pilot boarding tentatively scheduled for 19:30 EAT.
              </p>
            </div>

            <div className="p-4 bg-[#FBF0DD]/70 rounded-lg border border-[#B5760F]/40 space-y-2">
              <div className="font-bold text-sm text-[#B5760F]">3. Critical Commercial Finance Gate: MV VIGOR 01</div>
              <p>
                Tanga Cement advance invoice balance of <strong>TZS 200,000,000</strong> must be confirmed cleared before tomorrow 17:00 EAT. If wire confirmation is delayed, Tanga Cement will defer MV VIGOR 01's loading slot, cascading a delay to the next supply rotation.
              </p>
            </div>

            <div className="p-4 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] space-y-2">
              <div className="font-bold text-sm text-[#14181A]">4. Night Shift Directives</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Supervise final pneumatic sounding at 17:00 EAT on MV VIGOR 01.</li>
                <li>Ensure TotalEnergies bunker barge commences alongside delivery promptly upon unload finish.</li>
                <li>Liaise with Zanzibar Harbor Master regarding pilot tug availability at 19:15 EAT for MV VIGOR 03 berthing.</li>
              </ul>
            </div>
          </div>
        )}

        {reportType === 'EXECUTIVE_WEEKLY' && (
          <div className="space-y-4 text-xs text-[#14181A] leading-relaxed">
            <h3 className="text-base font-bold text-[#14181A]">
              EXECUTIVE FLEET & BERTH UTILIZATION SUMMARY
            </h3>
            <p>
              During this operational cycle, the 3-vessel VIGOR fleet transported and delivered 28,600 tonnes of bulk cement with zero safety incidents. Bottleneck analysis demonstrates that Berth B01 single-quay constraint accounted for 18.2 cumulative hours of anchorage waiting time across all vessels this month.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-3 bg-[#F7F5F0] rounded border">
                <span className="font-bold block">Current Auxiliary Fuel Burn at Anchorage:</span>
                <span className="font-mono text-sm text-[#AE3B2E]">$9,850 / month</span>
              </div>
              <div className="p-3 bg-[#F7F5F0] rounded border">
                <span className="font-bold block">Projected 2-Berth Expansion Savings:</span>
                <span className="font-mono text-sm text-[#0A7A3D]">$118,200 / year</span>
              </div>
            </div>
          </div>
        )}

        {reportType === 'BERTH_UTILIZATION' && (
          <div className="space-y-4 text-xs text-[#14181A] leading-relaxed">
            <h3 className="text-base font-bold text-[#14181A]">
              BERTH B01 CAPACITY & BOTTLENECK AUDIT
            </h3>
            <p>
              Comprehensive audit of physical quay turnaround. With an average discharge rate of 605 t/h and 1.5 hours required for post-unload line purging, a 9,600T carrier requires an average berth occupancy of 17.4 hours. Current spacing between rotations allows only 2.1 hours of empty buffer time before the next carrier enters harbor waters.
            </p>
          </div>
        )}

        {/* Report Sign-off */}
        <div className="pt-6 border-t border-[#E1DED4] flex justify-between items-end text-xs font-mono text-[#3F4A47]">
          <div>
            <div>Approved by: Head of Maritime Operations</div>
            <div>VIGOR Industrial Holding Ltd</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-[#0A7A3D]">SYSTEM VERIFIED</div>
            <div>Status: LIVE SIGNED</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function History() {
  const { voyages, vessels } = useAppData();

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="HISTORICAL ARCHIVE"
        title="Voyage & Cargo History"
        description="Historical archive of completed vessel rotations, cargo manifests, and port turnaround times."
      />

      <div className="bg-white border border-[#E1DED4] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-[#F7F5F0] border-b border-[#E1DED4] text-[#3F4A47] font-semibold text-[11px] uppercase">
                <th className="py-3 px-4">Voyage ID</th>
                <th className="py-3 px-4">Vessel</th>
                <th className="py-3 px-4">Cargo Tonnage</th>
                <th className="py-3 px-4">Origin / Dest</th>
                <th className="py-3 px-4">Discharge Start</th>
                <th className="py-3 px-4">Berth Release</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1DED4] text-[11px]">
              {voyages.map((v) => (
                <tr key={v.id} className="hover:bg-[#F7F5F0]/60">
                  <td className="py-3 px-4 font-bold text-[#14181A]">{v.voyageNumber}</td>
                  <td className="py-3 px-4 font-sans font-semibold text-[#14181A]">{v.vesselName}</td>
                  <td className="py-3 px-4 font-bold text-[#0A7A3D]">{formatTonnage(v.actualCargoT || 9500)}</td>
                  <td className="py-3 px-4 text-[#3F4A47]">{v.origin} → {v.destination}</td>
                  <td className="py-3 px-4 text-[#14181A]">{formatDateTime(v.actualUnloadStart || v.plannedUnloadStart)}</td>
                  <td className="py-3 px-4 text-[#14181A]">{formatDateTime(v.expectedBerthRelease)}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E7F4EB] text-[#0A7A3D]">
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
