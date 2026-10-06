import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { dbManager } from './database';
import { getOperationalState, putOperationalState, withOperationalState, readRows } from './operationalRepository';

export const databaseRouter = Router();
databaseRouter.use((req, res, next) => {
  if (!dbManager.isUsingMySQL()) return next('router');
  res.setHeader('Cache-Control','no-store');
  next();
});
function authorize(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) { res.status(401).json({error:'Please sign in.'}); return; }
  if (req.method !== 'GET' && !['Admin','Management','Operations'].includes(user.role)) {
    res.status(403).json({error:'Your role cannot change operational data.'}); return;
  }
  next();
}
const run = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request,res: Response,next: NextFunction) => {
  Promise.resolve(fn(req,res)).catch(next);
};
databaseRouter.use(['/operations','/vessels','/berths','/visits','/vessel-visits','/dashboard','/activities','/voyages','/upcoming-calls','/fuel-operations'], authorize);
databaseRouter.get('/operations/state',run(async (_req,res)=>res.json(await getOperationalState())));
databaseRouter.put('/operations/state',run(async (req,res)=>{
  if (!req.body.state || !Number.isInteger(req.body.expected_revision) || req.body.expected_revision < 0) {
    res.status(422).json({error:'A state object and its expected_revision are required.'}); return;
  }
  // Activities have their own transactional action API; stale browser copies must not rewrite their history.
  const input = {...req.body.state}; delete input.activities;
  res.json(await putOperationalState(input,req.body.expected_revision));
}));
databaseRouter.post('/voyages',run(async(req,res)=>{
  const result=await withOperationalState(async(state)=>{
    const row={...req.body,id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const vessel=state.vessels.find((v:any)=>v.id===row.vesselId);
    const berth=state.berths.find((b:any)=>b.id===row.assignedBerthId);
    if(!vessel || !berth) throw new Error('Select an existing vessel and berth.');
    if(!row.voyageNumber?.trim()) throw new Error('Enter a voyage number.');
    if(state.voyages.some((v:any)=>v.voyageNumber.toLowerCase()===row.voyageNumber.trim().toLowerCase()))throw new Error('Voyage number already exists.');
    if(!Number.isFinite(row.plannedCargoT)||row.plannedCargoT<=0||row.plannedCargoT>vessel.capacityT)throw new Error('Cargo must be positive and within vessel capacity.');
    if(!Number.isFinite(row.unloadingRateTph)||row.unloadingRateTph<=0)throw new Error('Enter a positive unloading rate.');
    if(!Number.isFinite(Date.parse(row.plannedUnloadStart)))throw new Error('Enter a valid planned arrival.');
    if(state.voyages.some((v:any)=>v.vesselId===row.vesselId&&v.status==='ACTIVE') && row.status==='ACTIVE')throw new Error('This vessel already has an active voyage.');
    row.vesselName=vessel.name;row.voyageNumber=row.voyageNumber.trim();state.voyages.push(row);return row;
  },true);res.status(201).json(result);
}));
databaseRouter.post('/fuel-operations',run(async(req,res)=>{
  const result=await withOperationalState(async(state)=>{
    const {fuel,account}=req.body;
    const voyage=state.voyages.find((v:any)=>v.id===fuel?.voyageId&&v.vesselId===fuel?.vesselId&&v.status==='ACTIVE');
    if(!voyage)throw new Error('Select a vessel with an active voyage.');
    if(!Number.isFinite(fuel.quantity)||fuel.quantity<=0||!Number.isFinite(fuel.estimatedCost)||fuel.estimatedCost<0)throw new Error('Enter a positive quantity and non-negative cost.');
    if(!fuel.supplierName?.trim())throw new Error('Enter a fuel supplier.');
    if(!account||account.id!==fuel.paymentAccountId||account.voyageId!==voyage.id||account.vesselId!==voyage.vesselId)throw new Error('Invalid payment account linkage.');
    if(state.fuelOperations.some((f:any)=>f.id===fuel.id))throw new Error('Fuel order already exists.');
    state.paymentAccounts.push({...account,requiredAmount:fuel.estimatedCost,currency:fuel.currency,category:'FUEL'});
    state.fuelOperations.push(fuel);voyage.fuelRequired=true;voyage.fuelOperationId=fuel.id;return fuel;
  },true);res.status(201).json(result);
}));
const vesselWire = (v:any) => ({id:v.id,name:v.name,imo_reference:v.imo,capacity_t:v.capacityT,agent_name:v.agentName,agent_phone:v.agentPhone,created_at:v.createdAt,updated_at:v.updatedAt});
const berthWire = (v:any) => ({...v,status:v.operationalStatus || 'AVAILABLE',lifecycle_status:v.status,default_unloading_rate_tph:v.defaultUnloadingRate});
for (const kind of ['vessels','berths']) {
  databaseRouter.get('/'+kind,run(async(req,res)=>{
    const {state}=await getOperationalState();
    const offset=Math.max(0,Number(req.query.offset)||0),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
    res.json(state[kind].slice(offset,offset+limit).map(kind==='vessels'?vesselWire:berthWire));
  }));
  databaseRouter.get('/'+kind+'/:id',run(async(req,res)=>{
    const {state}=await getOperationalState(); const item=state[kind].find((r:any)=>r.id===req.params.id);
    if(!item){res.status(404).json({error:'Record not found'});return;}
    res.json(kind==='vessels'?vesselWire(item):berthWire(item));
  }));
  for (const method of ['post','patch'] as const) databaseRouter[method]('/'+kind+(method==='patch'?'/:id':''),run(async(req,res)=>{
    const result=await withOperationalState(async(state)=>{
      let row=state[kind].find((r:any)=>r.id===req.params.id);
      if(method==='patch'&&!row) throw Object.assign(new Error('Record not found'),{status:404});
      if(!row){ row={id:randomUUID(),active:true,capacityT:10000,reference:'',createdAt:new Date().toISOString(),status:'ACTIVE',location:'Zanzibar',type:'Bulk',lengthM:0,operationalHours:'24/7',defaultUnloadingRate:600}; state[kind].push(row); }
      const body=req.body;
      if(kind==='berths') {
        if(method==='post' && body.id !== undefined) {
          const id=String(body.id).trim();
          if(!id || id.length>36) throw new Error('Berth ID must contain 1 to 36 characters.');
          if(state.berths.some((b:any)=>b!==row && b.id.toLowerCase()===id.toLowerCase())) throw Object.assign(new Error('A berth with this ID already exists.'),{status:409});
          row.id=id;
        }
        if(body.status!==undefined) {
          if(!['ACTIVE','PLANNED','UNDER_CONSTRUCTION','MAINTENANCE','INACTIVE'].includes(body.status)) throw new Error('Invalid berth status');
          row.status=body.status;
        }
        for(const field of ['lengthM','defaultUnloadingRate']) if(body[field]!==undefined && (!Number.isFinite(body[field]) || body[field]<=0)) throw new Error('Length and unloading rate must be positive numbers.');
        if(body.name!==undefined && !String(body.name).trim()) throw new Error('Name is required');
      }
      const allowed=['name','notes','reference','mmsi','active','location','type','lengthM','maxDraftM','maximumVesselSize','operationalHours','defaultUnloadingRate','availableFrom'];
      for(const key of allowed) if(body[key]!==undefined) row[key]=body[key];
      const aliases:Record<string,string>={imo_reference:'imo',capacity_t:'capacityT',agent_name:'agentName',agent_phone:'agentPhone'};
      for(const [key,target] of Object.entries(aliases)) if(body[key]!==undefined) row[target]=body[key];
      if(!row.name) throw new Error('Name is required');
      row.updatedAt=new Date().toISOString(); return kind==='vessels'?vesselWire(row):berthWire(row);
    },true);
    res.status(method==='post'?201:200).json(result);
  }));
}
databaseRouter.delete('/berths/:id',run(async(req,res)=>{
  await withOperationalState(async(state)=>{
    if(!state.berths.some((b:any)=>b.id===req.params.id)) throw Object.assign(new Error('Berth not found'),{status:404});
    if(state.voyages.some((v:any)=>v.assignedBerthId===req.params.id) || state.activities.some((a:any)=>a.berthId===req.params.id)) throw Object.assign(new Error('This berth is linked to operational records and cannot be removed. Reassign it or mark it inactive to preserve history.'),{status:409});
    state.berths=state.berths.filter((b:any)=>b.id!==req.params.id);
  },true);
  res.json({deleted:true});
}));
const snake = (row:any) => Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),v]));
for(const path of ['/visits','/vessel-visits']) databaseRouter.get(path,run(async(_req,res)=>{
  res.json(await withOperationalState(async(_s,_r,c)=>(await readRows(c,'vessel_visits')).map(snake)));
}));
databaseRouter.get('/visits/:id',run(async(req,res)=>{
  const rows=await withOperationalState(async(_s,_r,c)=>readRows(c,'vessel_visits'));
  const row=rows.find(v=>v.id===req.params.id);
  res.status(row?200:404).json(row?snake(row):{error:'Visit not found'});
}));
for(const kind of ['readings','delays']) {
  databaseRouter.get('/visits/:id/'+kind,run(async(req,res)=>{
    const {state}=await getOperationalState();
    const rows=state[kind==='readings'?'operationalReadings':'delayEvents'].filter((r:any)=>r.visitId===req.params.id);
    res.json(rows.map((r:any)=>kind==='readings'?{...snake(r),recorded_at:r.timestamp,unloaded_t:r.unloadedTonnes}:{...snake(r),start_time:r.start,end_time:r.end,responsible_area:r.area}));
  }));
  databaseRouter.post('/visits/:id/'+kind,run(async(req,res)=>{
    const item=await withOperationalState(async(state,_revision,c)=>{
      const visit=(await readRows(c,'vessel_visits')).find(v=>v.id===req.params.id);
      if(!visit) throw Object.assign(new Error('Visit not found'),{status:404});
      const b=req.body;
      const row:any={id:randomUUID(),visitId:visit.id,voyageId:visit.voyageId,vesselId:visit.vesselId,createdAt:new Date().toISOString()};
      if(kind==='readings') Object.assign(row,{timestamp:b.recorded_at||new Date().toISOString(),source:'Manual',unloadedTonnes:Number(b.unloaded_t),observedRateTph:Number(b.observed_rate_tph),notes:b.notes,dataQuality:'CURRENT',remainingTonnes:Math.max(0,visit.cargoTotalT-Number(b.unloaded_t))});
      else Object.assign(row,{start:b.start_time||new Date().toISOString(),end:b.end_time,category:b.category||'Other',area:b.responsible_area||'Operations',description:b.description||b.cause||'Delay',resolved:false,recordedBy:(req as any).user.email});
      state[kind==='readings'?'operationalReadings':'delayEvents'].push(row);
      return row;
    },true);
    res.status(201).json(kind==='readings'?{reading:{...snake(item),recorded_at:item.timestamp,unloaded_t:item.unloadedTonnes},warnings:[]}:snake(item));
  }));
}
databaseRouter.get('/upcoming-calls',run(async(_req,res)=>res.json(await withOperationalState(async(_s,_r,c)=>(await readRows(c,'upcoming_vessel_calls')).map(snake)))));
databaseRouter.get('/dashboard/active',run(async(_req,res)=>{
  const {state}=await getOperationalState();
  const v=state.voyages.find((v:any)=>v.currentStage==='UNLOADING')||state.voyages.find((v:any)=>v.status==='ACTIVE');
  if(!v){res.json(null);return;}
  const remaining=Math.max(0,(v.actualCargoT||v.plannedCargoT||0)-(v.unloadedTonnes||0));
  res.json({visit_id:v.visitId,voyage_id:v.id,vessel_name:v.vesselName,berth_name:state.berths.find((b:any)=>b.id===v.assignedBerthId)?.name,cargo_total_t:v.actualCargoT||v.plannedCargoT,unloaded_t:v.unloadedTonnes||0,remaining_t:remaining,unloading_rate_tph:v.unloadingRateTph,estimated_unload_finish:v.forecastUnloadEnd,expected_berth_release:v.expectedBerthRelease,berth_conflict:v.berthConflict,progress_pct:v.actualCargoT?100*(v.unloadedTonnes||0)/v.actualCargoT:0});
}));
databaseRouter.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
  console.error('[Database operation]',err.code||err.message);
  const unavailable=/ECONN|ETIMEDOUT|PROTOCOL|POOL/.test(err.code||'');
  res.status(err.status|| (unavailable?503:422)).json({error:unavailable?'Database unavailable. No changes were saved.':err.code==='ER_ROW_IS_REFERENCED_2'?'This berth is linked to operational records and cannot be removed.':err.message,current_revision:err.revision});
});
