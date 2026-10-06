import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn, ChildProcess } from 'node:child_process';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

if (!['localhost','127.0.0.1'].includes(process.env.DB_HOST || '')) throw new Error('Tests require an explicit localhost DB_HOST.');
const database = 'vigor_test_' + Date.now();
const admin = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true});
let child: ChildProcess | undefined;
let logs = '';
const port = 3107;
const base = `http://127.0.0.1:${port}/api/v1`;
let token = '';
const request = async (path:string, method='GET', body?:any, authorized=true) => {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authorized&&token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json() as any};
};
async function stop() {
  if (child && child.exitCode === null) { const done=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill();await done; }
}
async function start() {
  logs='';
  child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,DB_NAME:database,PORT:String(port),AUTH_SECRET:'isolated-test-secret',NODE_ENV:'production',DISABLE_HMR:'true',VERCEL:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout!.on('data',d=>logs+=d);child.stderr!.on('data',d=>logs+=d);
  for(let i=0;i<240;i++) { try{if((await request('/health')).status===200)return;}catch{} if(child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,250)); }
  throw Error('Server did not start: '+logs);
}
try {
  await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE ${database}`);
  await admin.query(await fs.readFile('database/schema.sql','utf8'));
  process.env.DB_NAME=database;
  const { withOperationalState }=await import('../server/operationalRepository');
  const { dbManager }=await import('../server/database');
  const { getInitialDemoData }=await import('../src/mock/mockData');
  await withOperationalState(async(state,_revision,c)=>{
    Object.assign(state,getInitialDemoData());
    await c.query('INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES (?,?,?,?,?,?)',['test-admin','admin@turkysgroup.co.tz',await bcrypt.hash('Test-Database-2026',10),'Test Admin','Admin','Active']);
    await c.query('INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES (?,?,?,?,?,?)',['test-viewer','viewer@turkysgroup.co.tz',await bcrypt.hash('Test-Database-2026',10),'Test Viewer','Viewer','Active']);
  },true);
  await dbManager.getPool()!.end();
  await start();
  assert.equal((await request('/operations/state','GET',undefined,false)).status,401);
  assert.equal((await request('/auth/login','POST',{email:'ceo@turkysgroup.co.tz',password:'Turkys@2025'},false)).status,401,'No built-in fallback account in database mode');
  const login=await request('/auth/login','POST',{email:'admin@turkysgroup.co.tz',password:'Test-Database-2026'},false);
  assert.equal(login.status,200,JSON.stringify(login.body));token=login.body.token;
  for(let i=1;i<=3;i++) {
    const added=await request('/berths','POST',{id:'custom-'+i,name:'Custom Berth '+i,lengthM:180,defaultUnloadingRate:600,status:i===1?'ACTIVE':'PLANNED'});
    assert.equal(added.status,201,JSON.stringify(added.body));assert.equal(added.body.id,'custom-'+i);
  }
  assert.equal((await request('/berths','POST',{id:'CUSTOM-1',name:'Duplicate',lengthM:180,defaultUnloadingRate:600})).status,409);
  assert.equal((await request('/berths','POST',{id:'invalid',name:'Invalid',lengthM:-1,defaultUnloadingRate:600})).status,422);
  assert.equal((await request('/berths/B01','DELETE')).status,409,'Linked berth deletion must be blocked');
  await stop();await start();
  const persistedBerth=await request('/berths/custom-1');assert.equal(persistedBerth.body.lifecycle_status,'ACTIVE');
  for(let i=1;i<=3;i++)assert.equal((await request('/berths/custom-'+i,'DELETE')).status,200);
  assert.equal((await request('/berths/custom-1')).status,404);
  const [removedBerths]:any=await admin.query("SELECT id FROM berths WHERE id LIKE 'custom-%'");assert.equal(removedBerths.length,0);
  let current=(await request('/operations/state')).body;
  assert.equal(current.state.vessels.length,3);
  // SQL imports bypass API writes: they must still advance the revision and reject stale state.
  const beforeImport=structuredClone(current);
  await admin.query('UPDATE vessels SET name=? WHERE id=?',['Imported SQL vessel',current.state.vessels[0].id]);
  const staleImport=await request('/operations/state','PUT',{state:beforeImport.state,expected_revision:beforeImport.revision});
  assert.equal(staleImport.status,409,'Direct SQL changes must not be overwritten by an old browser');
  current=(await request('/operations/state')).body;
  assert.equal(current.state.vessels[0].name,'Imported SQL vessel');
  assert.ok(current.revision>beforeImport.revision);
  assert.equal((await request('/operations/state')).body.revision,current.revision,'Read-only polls must not advance revision');
  const template=structuredClone(current.state.voyages[0]);
  const invalidVoyage=await request('/voyages','POST',{...template,voyageNumber:'INVALID-LINK',vesselId:'missing'});
  assert.equal(invalidVoyage.status,422);
  const linked=await request('/voyages','POST',{...template,voyageNumber:'LINKED-WORKFLOW',status:'PLANNED',currentStage:'PLANNED'});
  assert.equal(linked.status,201,JSON.stringify(linked.body));
  const [linkedVisit]:any=await admin.query('SELECT berth_id,vessel_id FROM vessel_visits WHERE voyage_id=?',[linked.body.id]);
  assert.equal(linkedVisit[0].berth_id,template.assignedBerthId);assert.equal(linkedVisit[0].vessel_id,template.vesselId);
  assert.equal((await request('/voyages','POST',{...template,voyageNumber:'LINKED-WORKFLOW',status:'PLANNED'})).status,422);
  const [beforeBadFuel]:any=await admin.query('SELECT COUNT(*) AS n FROM payment_accounts');
  assert.equal((await request('/fuel-operations','POST',{fuel:{voyageId:'missing'},account:{}})).status,422);
  const [afterBadFuel]:any=await admin.query('SELECT COUNT(*) AS n FROM payment_accounts');assert.equal(afterBadFuel[0].n,beforeBadFuel[0].n);
  current=(await request('/operations/state')).body;
  const originalRevision=current.revision;
  current.state.vessels[0].name='Database persistence test';
  current.state.systemSettings.defaultUnloadingRateTph=712;
  let saved=await request('/operations/state','PUT',{state:current.state,expected_revision:current.revision});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal((await request('/operations/state','PUT',{state:current.state,expected_revision:originalRevision})).status,409);
  let [rows]:any=await admin.query('SELECT name FROM vessels WHERE id=?',[current.state.vessels[0].id]);assert.equal(rows[0].name,'Database persistence test');
  current=(await request('/operations/state')).body;
  const invalid=structuredClone(current.state);invalid.vessels[0].name='Must roll back';invalid.vessels[0].capacityT=-1;
  assert.equal((await request('/operations/state','PUT',{state:invalid,expected_revision:current.revision})).status,422);
  [rows]=await admin.query('SELECT name FROM vessels WHERE id=?',[current.state.vessels[0].id]);assert.equal(rows[0].name,'Database persistence test','Constraint failure must roll back');
  current=(await request('/operations/state')).body;
  const account=current.state.paymentAccounts[0];
  const payment={id:'test-payment',paymentAccountId:account.id,vesselId:account.vesselId,voyageId:account.voyageId,category:account.category,amount:1,currency:account.currency,transactionDate:new Date().toISOString(),paymentMethod:'Bank',referenceNumber:'DB-TEST',enteredBy:'Test Admin',createdAt:new Date().toISOString()};
  current.state.paymentTransactions.push(payment);
  current.state.fuelOperations[0].notes='Fuel schedule saved in SQL';
  current.state.manufacturerQueue[0].confirmedQueuePosition=2;
  const firstPaymentSave=await request('/operations/state','PUT',{state:current.state,expected_revision:current.revision});
  assert.equal(firstPaymentSave.status,200,JSON.stringify(firstPaymentSave.body));
  // The same browser state still carries milliseconds; a subsequent save must not treat it as a payment edit.
  const secondPaymentSave=await request('/operations/state','PUT',{state:current.state,expected_revision:firstPaymentSave.body.revision});
  assert.equal(secondPaymentSave.status,200,JSON.stringify(secondPaymentSave.body));
  [rows]=await admin.query('SELECT amount FROM payment_transactions WHERE id=?',['test-payment']);assert.equal(Number(rows[0].amount),1);
  [rows]=await admin.query('SELECT notes FROM fuel_operations WHERE id=?',[current.state.fuelOperations[0].id]);assert.equal(rows[0].notes,'Fuel schedule saved in SQL');
  current=(await request('/operations/state')).body;
  const badPayment=structuredClone(current.state);badPayment.paymentTransactions.find((p:any)=>p.id==='test-payment').amount=2;
  assert.equal((await request('/operations/state','PUT',{state:badPayment,expected_revision:current.revision})).status,422);
  const created=await request('/activities','POST',{id:'test-activity',vesselId:'v-01',voyageId:'voy-01',activityType:'CUSTOM',title:'Persisted activity',executionMode:'SUPPORT'});
  assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.id,'test-activity');
  for(const [action,body,status] of [['start',{},'IN_PROGRESS'],['stop',{reason:'Test pause'},'STOPPED'],['resume',{},'IN_PROGRESS'],['complete',{completion_notes:'Test finished'},'COMPLETED']] as const) {
    const response=await request('/activities/test-activity/'+action,'POST',body);
    assert.equal(response.status,200,JSON.stringify(response.body));
    [rows]=await admin.query('SELECT status FROM vessel_activities WHERE id=?',['test-activity']);assert.equal(rows[0].status,status);
  }
  [rows]=await admin.query('SELECT COUNT(*) AS n FROM vessel_activity_events WHERE activity_id=?',['test-activity']);assert.ok(rows[0].n>=5);
  const register=await request('/auth/register','POST',{email:'new.staff@turkysgroup.co.tz',password:'Test-New-Staff',fullName:'New Staff',department:'Operations',requestedRole:'Viewer'},false);
  assert.equal(register.status,201,JSON.stringify(register.body));
  [rows]=await admin.query('SELECT id FROM users WHERE email=?',['new.staff@turkysgroup.co.tz']);assert.equal(rows.length,1);
  assert.equal((await request('/users/'+rows[0].id+'/status','PUT',{status:'Active'})).status,200);
  const viewer=await request('/auth/login','POST',{email:'viewer@turkysgroup.co.tz',password:'Test-Database-2026'},false);
  const adminToken=token;token=viewer.body.token;
  current=(await request('/operations/state')).body;
  assert.equal((await request('/operations/state','PUT',{state:current.state,expected_revision:current.revision})).status,403);token=adminToken;
  await stop();await start();
  current=(await request('/operations/state')).body;
  assert.equal(current.state.vessels[0].name,'Database persistence test');assert.equal(current.state.systemSettings.defaultUnloadingRateTph,712);
  const activity=await request('/activities/test-activity');assert.equal(activity.body.status,'COMPLETED');assert.ok(activity.body.events.length>=5);
  // Two simultaneous clients cannot both commit the same revision.
  const concurrent=await Promise.all([request('/operations/state','PUT',{state:current.state,expected_revision:current.revision}),request('/operations/state','PUT',{state:current.state,expected_revision:current.revision})]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  console.log('PASS: SQL persistence, restart recovery, activity lifecycle/events, rollback, stale/concurrent writes, database-only authentication, registration/admin updates, viewer permissions.');
} finally {
  await stop();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
}
