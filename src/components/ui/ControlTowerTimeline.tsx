import React, { useState } from 'react';
import { Vessel, Voyage, PaymentAccount, FuelOperation } from '../../types';
import { formatDateTime, formatDate, formatTime } from '../../lib/format';
import { Ship, Anchor, Fuel, CreditCard, Factory, AlertTriangle, CheckCircle } from 'lucide-react';

interface ControlTowerTimelineProps {
  vessels: Vessel[];
  voyages: Voyage[];
  payments: PaymentAccount[];
  fuelOperations: FuelOperation[];
  onSelectVessel?: (vesselId: string) => void;
}

export function ControlTowerTimeline({
  vessels,
  voyages,
  payments,
  fuelOperations,
  onSelectVessel,
}: ControlTowerTimelineProps) {
  const [horizonDays, setHorizonDays] = useState<7 | 14 | 30>(7);
  const now = new Date();
  const nowMs = now.getTime();
  const totalDurationMs = horizonDays * 24 * 3600 * 1000;

  // Generate day tick marks
  const dayTicks = Array.from({ length: horizonDays + 1 }).map((_, i) => {
    const tickDate = new Date(nowMs + i * 24 * 3600 * 1000);
    return {
      index: i,
      label: i === 0 ? 'Today' : formatDate(tickDate.toISOString()).slice(0, 6),
      weekday: tickDate.toLocaleDateString('en-GB', { weekday: 'narrow' }),
      dateIso: tickDate.toISOString(),
      leftPercent: (i / horizonDays) * 100,
    };
  });

  // Calculate position and width percentage for time ranges
  const getBlockStyle = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return { display: 'none' };
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();

    const leftPercent = Math.max(0, Math.min(100, ((start - nowMs) / totalDurationMs) * 100));
    const rightPercent = Math.max(0, Math.min(100, ((end - nowMs) / totalDurationMs) * 100));
    const widthPercent = Math.max(1.5, rightPercent - leftPercent);

    if (end < nowMs && start < nowMs) {
      // Historical block in the past
      return { display: 'none' };
    }

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  return (
    <div className="bg-white border border-[#E1DED4] rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E1DED4] mb-4">
        <div>
          <h2 className="text-base font-bold text-[#14181A] uppercase tracking-wide flex items-center gap-2">
            <Anchor className="w-4 h-4 text-[#0C9349]" />
            Multi-Vessel Operational Horizon & Dependency Timeline
          </h2>
          <p className="text-xs text-[#3F4A47] mt-0.5">
            Interconnected scheduling across VIGOR berth, fuel bunkering, manufacturer loading, and return voyages.
          </p>
        </div>

        {/* Horizon Filter Buttons */}
        <div className="flex items-center gap-1 bg-[#F7F5F0] p-1 rounded-lg border border-[#E1DED4] shrink-0">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              onClick={() => setHorizonDays(days)}
              className={`px-3 py-1 text-xs font-mono font-semibold rounded transition ${
                horizonDays === days
                  ? 'bg-[#14181A] text-white'
                  : 'text-[#3F4A47] hover:text-[#14181A]'
              }`}
            >
              {days} DAYS
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs mb-4 pb-3 border-b border-[#E1DED4] text-[#3F4A47]">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-[#14181A]">Block Types:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#0C9349]" /> Unloading (Berth B01)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#C99A5B]" /> Fuel Bunkering
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#0E7C86]" /> Transit / Sailing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#B5760F]" /> Manufacturer Queue / Loading
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#AE3B2E]" /> Anchorage Wait / Berth Conflict
        </span>
      </div>

      {/* Gantt Area */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header Time Grid */}
          <div className="grid grid-cols-[180px_1fr] border-b border-[#E1DED4] pb-2 text-xs font-mono text-[#3F4A47]">
            <span className="font-sans font-semibold uppercase text-[11px] text-[#14181A]">Vessel & Voyage</span>
            <div className="relative h-6">
              {dayTicks.map((tick) => (
                <div
                  key={tick.index}
                  className="absolute -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${tick.leftPercent}%` }}
                >
                  <span className="font-semibold text-[#14181A] text-[11px]">{tick.label}</span>
                  <span className="text-[9px] text-[#3F4A47]">{tick.weekday}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rows for each vessel */}
          <div className="divide-y divide-[#E1DED4]">
            {vessels.map((vessel) => {
              const voyage = voyages.find((v) => v.vesselId === vessel.id && v.status === 'ACTIVE');
              const pmt = payments.find((p) => p.vesselId === vessel.id && p.category === 'MANUFACTURER');
              const fuel = fuelOperations.find((f) => f.vesselId === vessel.id);

              return (
                <div key={vessel.id} className="grid grid-cols-[180px_1fr] py-3 items-center hover:bg-[#F7F5F0]/60 transition">
                  {/* Vessel info */}
                  <div
                    onClick={() => onSelectVessel && onSelectVessel(vessel.id)}
                    className="pr-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5">
                      <Ship className="w-3.5 h-3.5 text-[#0C9349]" />
                      <span className="text-xs font-bold text-[#14181A] group-hover:text-[#0A7A3D] transition">
                        {vessel.name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#3F4A47] mt-0.5">
                      {voyage?.voyageNumber || vessel.reference}
                    </div>
                    {voyage?.berthConflict && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-[#AE3B2E] mt-1">
                        <AlertTriangle className="w-3 h-3" />
                        Conflict: {voyage.predictedAnchorageWaitHours}h wait
                      </div>
                    )}
                  </div>

                  {/* Horizontal Timeline Track */}
                  <div className="relative h-12 bg-[#F7F5F0] rounded-lg border border-[#E1DED4] overflow-hidden">
                    {/* Background Day vertical guide lines */}
                    {dayTicks.map((tick) => (
                      <div
                        key={tick.index}
                        className="absolute top-0 bottom-0 border-r border-[#E1DED4]/60 pointer-events-none"
                        style={{ left: `${tick.leftPercent}%` }}
                      />
                    ))}

                    {/* Operational Blocks */}
                    {voyage && (
                      <>
                        {/* 1. Unload block if V1 */}
                        {voyage.currentStage === 'UNLOADING' && (
                          <div
                            className="absolute top-1.5 bottom-1.5 bg-[#0C9349] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(voyage.actualUnloadStart || voyage.plannedUnloadStart, voyage.forecastUnloadEnd)}
                            title={`Unloading bulk cement: Forecast finish ${formatDateTime(voyage.forecastUnloadEnd)}`}
                          >
                            UNLOAD {voyage.actualCargoT > 0 ? Math.round(100 * voyage.unloadedTonnes / voyage.actualCargoT) + '%' : '?'} ({formatTime(voyage.forecastUnloadEnd)})
                          </div>
                        )}

                        {/* 2. Fuel block if scheduled */}
                        {fuel && fuel.scheduledStart && (
                          <div
                            className="absolute top-2 bottom-2 bg-[#C99A5B] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(fuel.scheduledStart, fuel.scheduledEnd)}
                            title={`Fuel bunkering: ${fuel.quantity}T MGO`}
                          >
                            FUEL ({fuel.status})
                          </div>
                        )}

                        {/* 3. Outbound transit */}
                        {voyage.outboundDepartureForecast && (
                          <div
                            className="absolute top-2 bottom-2 bg-[#0E7C86] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(
                              voyage.outboundDepartureActual || voyage.outboundDepartureForecast,
                              voyage.manufacturerEtaForecast
                            )}
                            title={`Outbound transit to Tanga. ETA ${formatDateTime(voyage.manufacturerEtaForecast)}`}
                          >
                            SAIL TO MFR
                          </div>
                        )}

                        {/* 4. Manufacturer Loading Slot */}
                        {voyage.manufacturerSlotForecast && (
                          <div
                            className="absolute top-1.5 bottom-1.5 bg-[#B5760F] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(
                              voyage.manufacturerSlotForecast,
                              voyage.manufacturerLoadingEndForecast
                            )}
                            title={`Manufacturer loading slot: ${formatDateTime(voyage.manufacturerSlotForecast)}`}
                          >
                            MFR LOAD ({voyage.manufacturerSlotConfirmed ? 'CONFIRMED' : 'PREDICTED'})
                          </div>
                        )}

                        {/* 5. Return transit */}
                        {voyage.manufacturerDepartureForecast && (
                          <div
                            className="absolute top-2 bottom-2 bg-[#0E7C86] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(
                              voyage.manufacturerDepartureActual || voyage.manufacturerDepartureForecast,
                              voyage.returnEtaForecast
                            )}
                            title={`Return transit to VIGOR. ETA ${formatDateTime(voyage.returnEtaForecast)}`}
                          >
                            RETURN TO VIGOR
                          </div>
                        )}

                        {/* 6. Berth Conflict Anchorage Wait Block */}
                        {voyage.berthConflict && voyage.predictedAnchorageWaitHours > 0 && (
                          <div
                            className="absolute top-1.5 bottom-1.5 bg-[#AE3B2E] text-white rounded text-[10px] font-mono font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap shadow-xs animate-pulse hover:brightness-110 cursor-pointer"
                            style={getBlockStyle(
                              voyage.returnEtaForecast,
                              new Date(new Date(voyage.returnEtaForecast).getTime() + voyage.predictedAnchorageWaitHours * 3600000).toISOString()
                            )}
                            title={`Berth B01 conflict: ${voyage.predictedAnchorageWaitHours}h anchorage waiting`}
                          >
                            ANCHOR WAIT ({voyage.predictedAnchorageWaitHours}h)
                          </div>
                        )}

                        {/* Milestone Marker: Payment Deadline */}
                        {pmt && !pmt.isEligible && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-[#AE3B2E] z-10"
                            style={getBlockStyle(pmt.deadline, new Date(new Date(pmt.deadline).getTime() + 1800000).toISOString())}
                            title={`Payment Deadline: ${formatDateTime(pmt.deadline)} (TZS 200M remaining)`}
                          >
                            <div className="absolute -top-1 -left-2 text-[9px] font-bold bg-[#AE3B2E] text-white px-1 rounded">
                              DUE
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
