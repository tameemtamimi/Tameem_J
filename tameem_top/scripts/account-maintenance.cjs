// Trusted project-owner tool, run locally. Secrets are hidden interactive input,
// used in memory only, never written to disk or passed as command-line arguments.
const {createInterface}=require('node:readline/promises');
const {Writable}=require('node:stream');
const U=require('../username.js');
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:true});
async function ask(prompt,secret=false){
  if(secret){process.stdout.write(prompt);muted=true;}
  try{return await rl.question(secret?'':prompt);}finally{muted=false;if(secret)process.stdout.write('\n');}
}
(async()=>{
 if(!process.stdin.isTTY)throw new Error('Use an interactive terminal. Do not pipe credentials.');
 const mode=(await ask('Action: link-existing or reset-password: ')).trim();
 if(!['link-existing','reset-password'].includes(mode))throw new Error('Unknown action.');
 const url=(await ask('Supabase Project URL: ')).trim().replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw new Error('Invalid project URL.');
 let key=await ask('Legacy service_role key (hidden; owner only): ',true);
 const username=U.normalize(await ask('Username: '));if(!U.valid(username))throw new Error('Invalid username.');
 async function api(route,method='GET',body){
   const response=await fetch(url+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
   if(!response.ok)throw new Error('Operation failed (HTTP '+response.status+'). Check the dashboard; no provider details printed.');
   return response.status===204?null:response.json();
 }
 if(mode==='link-existing'){
   const id=(await ask('Existing Auth user UUID (preserves this account and history): ')).trim();
   if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid UUID.');
   const profiles=await api('/rest/v1/staff_profiles?select=user_id,username&user_id=eq.'+id);
   if(profiles.length!==1)throw new Error('No existing staff profile. Provision the role first through trusted administration.');
   const occupied=await api('/rest/v1/staff_profiles?select=user_id&username=eq.'+encodeURIComponent(username));
   if(occupied.some(p=>p.user_id!==id))throw new Error('Username is already assigned.');
   const existing=await api('/auth/v1/admin/users/'+id);
   await api('/auth/v1/admin/users/'+id,'PUT',{email:U.accountIdentifier(username),email_confirm:true});
   try{await api('/rest/v1/staff_profiles?user_id=eq.'+id,'PATCH',{username});}
   catch(error){
     try{await api('/auth/v1/admin/users/'+id,'PUT',{email:existing.email,email_confirm:true});}
     catch{throw new Error('Mapping failed and rollback failed. Owner must repair the Auth identifier. Do not delete/recreate the account.');}
     throw error;
   }
   console.log('Username linked. User ID, password, role and history are preserved.');
 }else{
   const profiles=await api('/rest/v1/staff_profiles?select=user_id&username=eq.'+encodeURIComponent(username));
   if(profiles.length!==1)throw new Error('Username not found.');
   let password=await ask('New password (12-128 characters, hidden): ',true);
   if(password.length<12||password.length>128)throw new Error('Invalid password length.');
   if(password!==await ask('Confirm password (hidden): ',true))throw new Error('Passwords do not match.');
   await api('/auth/v1/admin/users/'+profiles[0].user_id,'PUT',{password});password='';
   console.log('Password updated by Supabase Auth.');
 }
 key='';
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>rl.close());
