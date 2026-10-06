export type OperationalStage =
  | 'PLANNED'
  | 'SAILING_TO_VIGOR'
  | 'APPROACHING_VIGOR'
  | 'WAITING_FOR_VIGOR_BERTH'
  | 'BERTHED_AT_VIGOR'
  | 'UNLOADING'
  | 'UNLOADING_DELAYED'
  | 'UNLOADING_COMPLETE'
  | 'WAITING_FOR_FUEL'
  | 'FUEL_PAYMENT_PENDING'
  | 'FUEL_PARTIALLY_PAID'
  | 'FUEL_PAID'
  | 'FUEL_SCHEDULED'
  | 'FUEL_IN_PROGRESS'
  | 'FUEL_COMPLETE'
  | 'READY_TO_DEPART'
  | 'SAILING_TO_MANUFACTURER'
  | 'MANUFACTURER_PAYMENT_PENDING'
  | 'MANUFACTURER_PARTIALLY_PAID'
  | 'MANUFACTURER_PAYMENT_COMPLETE'
  | 'ELIGIBLE_FOR_MANUFACTURER_QUEUE'
  | 'WAITING_AT_MANUFACTURER'
  | 'MANUFACTURER_BERTH_ASSIGNED'
  | 'LOADING'
  | 'LOADING_DELAYED'
  | 'LOADING_COMPLETE'
  | 'DEPARTING_MANUFACTURER'
  | 'RETURNING_TO_VIGOR'
  | 'MAINTENANCE'
  | 'OUT_OF_SERVICE'
  | 'COMPLETED';

export type OperationsHealth = 'READY' | 'AT_RISK' | 'BLOCKED' | 'DELAYED';

export type OperationalRisk = 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'ARRIVAL_OVERDUE' | 'UNKNOWN';

export type CurrentBlocker =
  | 'NONE'
  | 'VIGOR_BERTH'
  | 'UNLOADING'
  | 'FUEL_SCHEDULE'
  | 'FUEL_PAYMENT'
  | 'MANUFACTURER_PAYMENT'
  | 'MANUFACTURER_QUEUE'
  | 'MANUFACTURER_BERTH'
  | 'LOADING'
  | 'MAINTENANCE';

export type DataQuality = 'CURRENT' | 'STALE' | 'INSUFFICIENT' | 'UNAVAILABLE';

export type ScheduleSource = 'FORECAST' | 'PLANNED' | 'CONFIRMED' | 'ACTUAL' | 'SIMULATED';

export type DelayCategory =
  | 'Equipment'
  | 'Weather'
  | 'Labour'
  | 'Berth'
  | 'Vessel'
  | 'Material'
  | 'Fuel'
  | 'Payment'
  | 'Manufacturer'
  | 'Other';

export type BerthStatus = 'ACTIVE' | 'PLANNED' | 'UNDER_CONSTRUCTION' | 'MAINTENANCE' | 'INACTIVE';

export type PaymentCategory = 'MANUFACTURER' | 'FUEL' | 'PORT' | 'OTHER';

export type PaymentCountdownState =
  | 'MORE_THAN_7_DAYS'
  | 'DUE_WITHIN_7_DAYS'
  | 'DUE_WITHIN_3_DAYS'
  | 'DUE_WITHIN_48_HOURS'
  | 'DUE_WITHIN_24_HOURS'
  | 'DUE_TODAY'
  | 'OVERDUE';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Vessel {
  id: string;
  name: string;
  imo?: string;
  mmsi?: string;
  reference: string;
  active: boolean;
  capacityT: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Berth {
  id: string;
  name: string;
  location: string;
  type: string;
  lengthM: number;
  maxDraftM?: number;
  maximumVesselSize?: number;
  operationalHours: string;
  defaultUnloadingRate: number; // t/h
  status: BerthStatus;
  availableFrom?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalReading {
  id: string;
  voyageId: string;
  vesselId: string;
  timestamp: string;
  source: 'Manual' | 'Spreadsheet Import' | 'Calculated';
  unloadedTonnes: number;
  remainingTonnes: number;
  observedRateTph: number;
  dataQuality: DataQuality;
  notes?: string;
  enteredBy?: string;
}

export interface DelayEvent {
  id: string;
  voyageId: string;
  vesselId: string;
  start: string;
  end?: string;
  category: DelayCategory;
  area: string;
  description: string;
  impactHours?: number;
  resolved: boolean;
  recordedBy: string;
  createdAt: string;
}

export interface FuelOperation {
  id: string;
  voyageId: string;
  vesselId: string;
  supplierId: string;
  supplierName: string;
  fuelType: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  currency: string;
  paymentAccountId: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status:
    | 'NOT_REQUIRED'
    | 'REQUESTED'
    | 'PAYMENT_PENDING'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'SCHEDULED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'DELAYED'
    | 'CANCELLED';
  invoiceNumber: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAccount {
  id: string;
  vesselId: string;
  voyageId: string;
  category: PaymentCategory;
  counterpartyId: string;
  counterpartyName: string;
  invoiceNumber: string;
  requiredAmount: number;
  currency: string;
  eligibilityThresholdType: 'FULL' | 'PERCENTAGE' | 'AMOUNT' | 'MANUAL';
  eligibilityThresholdValue: number; // e.g., 100 for 100%, or amount in currency
  deadline: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  isEligible: boolean;
  eligibleAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  paymentAccountId: string;
  vesselId: string;
  voyageId: string;
  category: PaymentCategory;
  amount: number;
  currency: string;
  transactionDate: string;
  paymentMethod: string;
  referenceNumber: string;
  enteredBy: string;
  notes?: string;
  createdAt: string;
}

export interface ManufacturerQueueEntry {
  id: string;
  position: number;
  vesselId?: string;
  vesselName: string;
  voyageId?: string;
  isExternal: boolean;
  manufacturerName: string;
  eta: string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' | 'NOT_REQUIRED';
  isEligible: boolean;
  eligibleSince?: string;
  predictedQueuePosition: number;
  confirmedQueuePosition?: number;
  predictedSlot: string;
  confirmedSlot?: string;
  berthName: string;
  queueSource: 'AUTOMATIC_PREDICTION' | 'MANUAL_OVERRIDE' | 'MANUFACTURER_CONFIRMED';
  status: 'WAITING' | 'BERTHED' | 'LOADING' | 'COMPLETED';
}

export interface VoyageCycleStage {
  stage: OperationalStage;
  label: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'AT_RISK' | 'BLOCKED' | 'DELAYED';
  plannedTime?: string;
  forecastTime?: string;
  actualTime?: string;
  source: ScheduleSource;
  notes?: string;
}

export interface Voyage {
  id: string;
  vesselId: string;
  vesselName: string;
  voyageNumber: string;
  status: 'ACTIVE' | 'PLANNED' | 'COMPLETED';
  origin: string;
  destination: string;
  cycleStart: string;
  cycleEnd?: string;

  // Unloading at VIGOR
  assignedBerthId: string;
  cargoType: string;
  plannedCargoT: number;
  actualCargoT: number;
  unloadedTonnes: number;
  unloadingRateTph: number;
  plannedUnloadStart: string;
  plannedUnloadEnd: string;
  actualUnloadStart?: string;
  actualUnloadEnd?: string;
  forecastUnloadEnd: string;
  expectedBerthRelease: string;
  postUnloadBufferHours: number;

  // Fueling
  fuelRequired: boolean;
  fuelOperationId?: string;

  // Outbound
  outboundDeparturePlanned: string;
  outboundDepartureForecast: string;
  outboundDepartureActual?: string;

  // Manufacturer Loading
  manufacturerId: string;
  manufacturerName: string;
  manufacturerEtaPlanned: string;
  manufacturerEtaForecast: string;
  manufacturerActualArrival?: string;
  manufacturerQueuePosition?: number;
  manufacturerSlotPlanned: string;
  manufacturerSlotForecast: string;
  manufacturerSlotConfirmed?: string;
  manufacturerLoadingStartActual?: string;
  manufacturerLoadingEndForecast: string;
  manufacturerLoadingEndActual?: string;
  manufacturerDeparturePlanned: string;
  manufacturerDepartureForecast: string;
  manufacturerDepartureActual?: string;

  // Return to VIGOR
  returnEtaPlanned: string;
  returnEtaForecast: string;
  returnEtaConfirmed?: string;
  returnActualArrival?: string;

  // Dynamic state
  currentStage: OperationalStage;
  health: OperationsHealth;
  risk: OperationalRisk;
  currentBlocker: CurrentBlocker;
  blockerDescription: string;

  // Berth conflict & waiting
  berthConflict: boolean;
  predictedAnchorageWaitHours: number;
  conflictNotes?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  vesselId?: string;
  vesselName?: string;
  voyageId?: string;
  type:
    | 'ARRIVAL'
    | 'ARRIVAL_OVERDUE'
    | 'COMPLETION_SHIFT'
    | 'RATE_DROP'
    | 'BERTH_AVAILABLE'
    | 'BERTH_CONFLICT'
    | 'PAYMENT_DUE'
    | 'PAYMENT_OVERDUE'
    | 'PAYMENT_BLOCKING_QUEUE'
    | 'FUEL_PAYMENT_DUE'
    | 'FUEL_DELAY'
    | 'MANUFACTURER_QUEUE_RISK'
    | 'MANUFACTURER_SLOT_CHANGED'
    | 'ETA_SHIFT'
    | 'ANCHORAGE_WAIT_RISK'
    | 'LOADING_DELAY'
    | 'MAINTENANCE';
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  linkTo?: {
    page: string;
    vesselId?: string;
    voyageId?: string;
  };
}

export interface SystemSettings {
  acknowledgedAlertIds?: string[];
  postUnloadBerthBufferHours: number;
  arrivalOverdueGraceMinutes: number;
  paymentWarningThresholdHours: number;
  manufacturerEligibilityPercent: number; // 100
  defaultSailingSpeedKnots: number;
  defaultLoadingRateTph: number;
  defaultUnloadingRateTph: number;
  unloadingRateUnitPreference: 'TPH' | 'TPM'; // Tonnes/hr or Tonnes/min
}

export interface WhatIfScenario {
  id: string;
  name: string;
  description: string;
  unloadingDelayHours: number;
  manufacturerPaymentDelayDays: number;
  vessel03ArrivalShiftHours: number;
  fuelDelayHours: number;
  twoBerthsActive: boolean;
  manufacturerLoadingDelayHours: number;
}

export * from './activity';
