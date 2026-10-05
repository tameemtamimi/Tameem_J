// Isolated TEST transport. Production files use only the real Supabase SDK/API.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const settings={version:1,sell_min:'90',sell_max:'98',buy_price:'82',sell_usd:'1.41',sell_ils:'5.2',buy_usd:'1.4',buy_ils:'5.1'};
const C=require('../calculator.js');
(async()=>{ fs.mkdirSync('tests/artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext(),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4180');await page.getByText('المتجر غير متصل بعد').waitFor();
 assert(await page.locator('#workspace').isHidden());assert.equal(await page.locator('input[type=email]').count(),0);
 let role='employee',active=true,serverError=false,authDelay=0,saved=[],saveCalls=0,failSave=false,refreshCalls=0;
 const user={id:'22222222-2222-4222-8222-222222222222',aud:'authenticated',role:'authenticated',email:'employee@users.wj.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const token=()=>{const now=Math.floor(Date.now()/1000);return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:now+3600,iat:now,session_id:'33333333-3333-4333-8333-333333333333'})).toString('base64url'),'testsignature'].join('.');};
 const session=()=>({access_token:token(),refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user});
 await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.STORE_CONFIG={supabaseUrl:'https://wj-test.supabase.co',supabasePublishableKey:'sb_publishable_testonly'};"}));
 await context.route('https://wj-test.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();
   const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname.includes('/auth/v1/token')){
     if(url.searchParams.get('grant_type')==='refresh_token')refreshCalls++;
     if(body?.password==='wrong'||(url.searchParams.get('grant_type')==='password'&&body.email!=='employee@users.wj.invalid'))return respond({msg:'Invalid login credentials',code:'invalid_credentials'},400);
     return respond(session());
   }
   if(url.pathname==='/functions/v1/create-staff'){
     if(role!=='admin')return respond({code:'STAFF_ADMIN_REQUIRED'},403);
     if(body.username==='duplicate')return respond({code:'ACCOUNT_NOT_CREATED'},409);
     return respond({username:body.username,displayName:body.displayName,role:body.role},201);
   }
   if(url.pathname==='/auth/v1/user'){if(authDelay)await new Promise(r=>setTimeout(r,authDelay));return respond(user);}
   if(url.pathname==='/auth/v1/logout')return respond({});
   if(serverError)return respond({message:'Database unavailable'},503);
   if(url.pathname.includes('/staff_profiles'))return respond(active?[{user_id:user.id,display_name:'تميم',role,active}]:[]);
   if(url.pathname.endsWith('get_store_settings'))return respond(settings);
   if(url.pathname.endsWith('latest_calculations'))return respond(saved.slice(0,10));
   if(url.pathname.endsWith('update_store_settings')){
     if(role!=='admin')return respond({message:'STAFF_ADMIN_REQUIRED',code:'42501'},403);
     if(body.p_expected_version!==settings.version)return respond({message:'SETTINGS_CHANGED'},400);
     for(const key of Object.keys(settings))if(key!=='version')settings[key]=body['p_'+key];settings.version++;return respond(settings);
   }
   if(url.pathname.endsWith('save_calculation')){
     saveCalls++;if(failSave){failSave=false;return respond({message:'Database unavailable'},503);}
     if(body.p_settings_version!==settings.version)return respond({message:'SETTINGS_CHANGED'},400);
     const result=C.calculate({weight:body.p_weight,price:body.p_price,usd:settings[body.p_mode+'_usd'],ils:settings[body.p_mode+'_ils']}).results;
     const record={id:crypto.randomUUID(),request_id:body.p_request_id,user_id:user.id,user_name:'تميم',mode:body.p_mode,weight:body.p_weight,price:body.p_price,usd_rate:settings[body.p_mode+'_usd'],ils_rate:settings[body.p_mode+'_ils'],total_jod:result.jod.replaceAll(',',''),total_usd:result.usd.replaceAll(',',''),total_ils:result.ils.replaceAll(',',''),created_at:new Date().toISOString()};
     saved.unshift(record);return respond(record);
   }
   return respond({message:'Unknown test endpoint'},404);
 });
 await page.reload();await page.locator('#login-form').waitFor({state:'visible'});
 await page.locator('#username').fill(' EmPloyee ');await page.locator('#password').fill('wrong');await page.locator('#login-submit').click();await page.getByText('اسم المستخدم أو كلمة المرور غير صحيح.').waitFor();
 await page.locator('#username').fill('unknown');await page.locator('#password').fill('test-password-not-a-real-account');await page.locator('#login-submit').click();await page.getByText('اسم المستخدم أو كلمة المرور غير صحيح.').waitFor();
 await page.locator('#username').fill(' EmPloyee ');await page.locator('#password').fill('test-password-not-a-real-account');await page.locator('#login-submit').click();await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#greeting').textContent(),'أهلاً تميم');assert(await page.locator('#settings-open').isHidden());
 await page.locator('#weight').fill('12.35');assert.equal(await page.locator('#total-jod').textContent(),'1,111.500');
 await page.locator('#price').fill('99');assert(await page.locator('#save-quote').isDisabled());assert.equal(await page.locator('#total-jod').textContent(),'—');
 await page.locator('#price').fill('98');assert(await page.locator('#price-up').isDisabled());await page.locator('#price-down').click();assert.equal(await page.locator('#price').inputValue(),'97');
 await page.locator('#price').fill('90');assert(await page.locator('#price-down').isDisabled());
 assert.equal(saveCalls,0);await page.locator('#save-quote').click();await page.getByText('حُفظت القطعة في سجل المتجر.').waitFor();assert.equal(saveCalls,1);assert(await page.locator('#save-quote').isDisabled());
 await page.locator('#mode-buy').click();assert.equal(await page.locator('#price').inputValue(),'82');assert(await page.locator('#price').getAttribute('readonly')!==null);assert.equal(await page.locator('#usd').inputValue(),'1.4');assert.equal(await page.locator('#ils').inputValue(),'5.1');
 await page.locator('#weight').fill('٣٫٧٥');assert.equal(await page.locator('#total-jod').textContent(),'307.500');assert.equal(await page.locator('#total-usd').textContent(),'430.50');
 failSave=true;await page.locator('#save-quote').click();await page.locator('#save-status').filter({hasText:'تعذّر'}).waitFor();assert(!(await page.locator('#save-quote').isDisabled()));await page.locator('#save-quote').click();await page.getByText('حُفظت القطعة في سجل المتجر.').waitFor();
 for(let i=0;i<11;i++)saved.unshift({...saved[0],id:crypto.randomUUID()});
 await page.locator('#history-open').click();await page.locator('.history-card').first().waitFor();assert.equal(await page.locator('.history-card').count(),10);await page.locator('[data-close="history-dialog"]').click();
 authDelay=350;await page.reload();assert(await page.locator('#login-form').isHidden());await page.locator('#workspace').waitFor({state:'visible'});authDelay=0;
 // A new page restores the SDK-managed session from the same browser storage.
 const reopened=await context.newPage();await reopened.goto('http://localhost:4180');await reopened.locator('#workspace').waitFor({state:'visible'});await reopened.close();
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));const session=JSON.parse(localStorage.getItem(key));session.expires_at=Math.floor(Date.now()/1000)-60;localStorage.setItem(key,JSON.stringify(session));});
 await page.reload();await page.locator('#workspace').waitFor({state:'visible'});assert(refreshCalls>0,'SDK refreshes an expired session');
 role='admin';await page.reload();await page.locator('#settings-open').waitFor({state:'visible'});
 await page.locator('#settings-open').click();
 await page.locator('#staff-username').fill('new_employee');await page.locator('#staff-display-name').fill('موظف جديد');await page.locator('#staff-password').fill('test-only-new-account-password');await page.locator('#create-staff-form button[type=submit]').click();await page.locator('#create-staff-status').filter({hasText:'تم إنشاء'}).waitFor();assert.equal(await page.locator('#staff-password').inputValue(),'');
 await page.locator('#staff-username').fill('duplicate');await page.locator('#staff-display-name').fill('اسم آخر');await page.locator('#staff-password').fill('test-only-new-account-password');await page.locator('#create-staff-form button[type=submit]').click();await page.locator('#create-staff-status').filter({hasText:'لم يُنشأ'}).waitFor();assert.equal(await page.locator('#staff-password').inputValue(),'');
 await page.locator('#setting-sell_max').fill('89');await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-status').filter({hasText:'أدخل أرقاماً'}).waitFor();
 await page.locator('#setting-sell_max').fill('99');await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-status').filter({hasText:'تم الحفظ'}).waitFor();assert.equal(settings.sell_max,'99');await page.locator('[data-close="settings-dialog"]').click();
 await page.locator('#settings-open').click();settings.version++;await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-status').filter({hasText:'تغيّرت'}).waitFor();await page.locator('#settings-reload').click();await page.waitForFunction(()=>document.querySelector('#settings-status').textContent==='');await page.locator('[data-close="settings-dialog"]').click();
 await page.locator('#weight').fill('2.5');settings.version++;await page.locator('#save-quote').click();await page.locator('#save-status').filter({hasText:'تغيّرت'}).waitFor();await page.waitForFunction(()=>!document.querySelector('#save-quote').disabled);
 await page.locator('#weight').fill('12.35');
 for(const [name,width,height]of [['iphone',390,844],['small-phone',320,667],['tablet',768,1024],['desktop',1440,1000]]){
   await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');await page.screenshot({path:'tests/artifacts/upgrade-'+name+'.png',fullPage:true});
 }
 serverError=true;await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert(await page.locator('#save-quote').isDisabled());await page.locator('#sync-retry').click();await page.locator('#sync-notice').filter({hasText:'تعذّر'}).waitFor();serverError=false;await page.locator('#sync-retry').click();await page.waitForFunction(()=>!document.querySelector('#pricing-fields').disabled);
 active=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('الحساب غير مفعّل').waitFor();assert(await page.locator('#workspace').isHidden());active=true;await page.locator('#retry-access').click();await page.locator('#workspace').waitFor({state:'visible'});
 await page.locator('#logout').click();await page.locator('#login-form').waitFor({state:'visible'});await page.reload();await page.locator('#login-form').waitFor({state:'visible'});
 await page.locator('#username').fill(' EmPloyee ');await page.locator('#password').fill('test-password-not-a-real-account');await page.locator('#login-submit').click();await page.locator('#workspace').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: real Supabase SDK with isolated test responses; login/errors, session restore/reopen, no login flash, roles, modes, bounds, four rates, save/retry, history limit, settings, offline, revocation, logout, four viewports.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

