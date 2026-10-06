import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getInitialDemoData } from '../src/mock/mockData';
import { dbManager } from '../server/database';
import { withOperationalState } from '../server/operationalRepository';

// Explicit opt-in only: never auto-seed a production database or replace existing data.
if (process.env.SEED_LOCAL_DEMO !== 'true' || !['127.0.0.1','localhost'].includes(process.env.DB_HOST || '')) {
  throw new Error('Demo initialization requires SEED_LOCAL_DEMO=true and a localhost database.');
}
const password = process.env.BOOTSTRAP_PASSWORD;
if (!password || password.length < 10) throw new Error('Set BOOTSTRAP_PASSWORD to at least 10 characters.');
try {
  await withOperationalState(async (state,_revision,c) => {
    const [users]:any = await c.query('SELECT COUNT(*) AS count FROM users');
    if (users[0].count || state.vessels.length || state.voyages.length) throw new Error('Refusing to seed a database that already contains users or fleet data.');
    Object.assign(state,getInitialDemoData());
    const hash = await bcrypt.hash(password,12);
    const roles=['Admin','Management','Operations','Viewer'];
    const emails=['admin','ceo','ops.dispatcher','auditor'];
    for(let i=0;i<roles.length;i++) await c.query('INSERT INTO users (id,email,password_hash,full_name,department,role,status) VALUES (?,?,?,?,?,?,?)',[
      'usr-00'+(i+1),emails[i]+'@turkysgroup.co.tz',hash,'Local Demo '+roles[i],'Local Evaluation',roles[i],'Active',
    ]);
  },true);
  console.log('Local demo records and hashed test users committed to the database.');
} finally { await dbManager.getPool()?.end(); }
