const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../database/001_store.sql'),'utf8'));
 const admin=crypto.randomUUID(),employee=crypto.randomUUID(),other=crypto.randomUUID(),stranger=crypto.randomUUID();
 const sessions=Object.fromEntries([admin,employee,other,stranger].map(id=>[id,crypto.randomUUID()]));
 for(const id of [admin,employee,other,stranger]){
   await db.query('insert into auth.users(id) values($1)',[id]);
   await db.query('insert into auth.sessions values($1,$2)',[sessions[id],id]);
 }
 for(const [id,name,role] of [[admin,'تميم','admin'],[employee,'موظف','employee'],[other,'موظف ثان','employee']])
   await db.query('insert into public.staff_profiles(user_id,display_name,role) values($1,$2,$3)',[id,name,role]);
 async function as(id,role='authenticated'){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sessions[id]})]);await db.exec('set role '+role);
 }
 async function rpc(sql,args=[]){return (await db.query(sql,args)).rows[0]?.value;}
 let checks=0;
 async function deny(sql,args=[]){await assert.rejects(()=>db.query(sql,args));checks++;}
 const update='select public.update_store_settings($1,90,98,82,1.41,5.2,1.4,5.1) as value';
 await as(admin);const initial=await rpc(update,[0]);assert.equal(initial.version,1);checks++;
 await as(employee);
 await deny(update,[1]);
 const changed=await db.query('update public.store_settings set sell_min=1 where id=1 returning id');assert.equal(changed.rows.length,0);checks++;
 await deny("insert into public.store_settings(sell_min,sell_max,buy_price,sell_usd,sell_ils,buy_usd,buy_ils) values(1,2,1,1,1,1,1)");
 await deny("update public.staff_profiles set role='admin' where user_id=$1",[employee]);
 await deny("insert into public.staff_profiles(user_id,display_name,role) values($1,'x','admin')",[stranger]);
 await deny("insert into public.calculation_history(request_id,user_name,mode,weight,price,usd_rate,ils_rate,total_jod,total_usd,total_ils,settings_version) values($1,'x','sell',1,1,1,1,1,1,1,1)",[crypto.randomUUID()]);
 await deny('delete from public.calculation_history');
 const save='select public.save_calculation($1,$2,$3,$4,$5) as value';
 async function saveQuote(mode,weight,price,version=1,id=crypto.randomUUID()){return rpc(save,[mode,weight,price,version,id]);}
 const request=crypto.randomUUID(),sell=await saveQuote('sell','12.35','90',1,request);
 assert.equal(sell.total_jod,'1111.500');assert.equal(sell.total_usd,'1567.22');assert.equal(sell.total_ils,'5779.80');assert.equal(sell.user_id,employee);checks++;
 assert.equal((await saveQuote('sell','12.35','90',1,request)).id,sell.id);checks++;
 await deny(save,['sell',12.35,91,1,request]);
 const buy=await saveQuote('buy','3.75','82');assert.equal(buy.total_jod,'307.500');assert.equal(buy.total_usd,'430.50');assert.equal(buy.total_ils,'1568.25');checks++;
 for(const [mode,weight,price,version]of [['sell',1,89,1],['sell',1,99,1],['buy',1,83,1],['sell',0,90,1],['sell',-1,90,1],['sell','0.0000001',90,1],['sell','NaN',90,1],['sell','Infinity',90,1],['sell',1,90,0],['bad',1,90,1],['sell',1,'NaN',1]])await deny(save,[mode,weight,price,version,crypto.randomUUID()]);
 await saveQuote('sell',1,98);checks++;
 await as(other);await saveQuote('buy',1,82);assert.equal((await rpc('select public.latest_calculations() as value')).length,4);checks++;
 for(let i=1;i<=12;i++)await saveQuote('sell',i,95);
 const history=await rpc('select public.latest_calculations() as value');assert.equal(history.length,10);assert(history.every(r=>r.user_id===other));checks++;
 await as(admin);const next=await rpc(update,[1]);assert.equal(next.version,2);checks++;
 await deny(update,[1]);
 await deny('select public.update_store_settings(2,99,90,82,1,1,1,1)');
 await deny('select public.update_store_settings(2,90,98,82,0,1,1,1)');
 await as(employee);await deny(save,['sell',1,95,1,crypto.randomUUID()]);
 await as(stranger);assert.equal(await rpc('select public.get_store_settings() as value'),null);assert.deepEqual(await rpc('select public.latest_calculations() as value'),[]);await deny(save,['sell',1,95,2,crypto.randomUUID()]);
 await as(employee,'anon');await deny('select public.get_store_settings()');await deny(save,['sell',1,95,2,crypto.randomUUID()]);
 await db.exec('reset role');await db.query('update public.staff_profiles set active=false where user_id=$1',[employee]);
 await as(employee);assert.equal(await rpc('select public.get_store_settings() as value'),null);await deny(save,['sell',1,95,2,crypto.randomUUID()]);
 await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[other]);
 await as(other);assert.deepEqual(await rpc('select public.latest_calculations() as value'),[]);await deny(save,['buy',1,82,2,crypto.randomUUID()]);
 await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[admin]);
 await as(admin);await deny(update,[2]);assert.equal(await rpc('select public.get_store_settings() as value'),null);checks++;
 console.log('Database checks passed:',checks,'assertion groups; actual PostgreSQL RLS, roles, RPCs and decimal arithmetic via PGlite. Auth tables are local stubs.');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});

