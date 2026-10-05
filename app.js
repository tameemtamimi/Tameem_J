'use strict';
const $=id=>document.getElementById(id);
const C=GoldCalculator,P=StorePricing;
const state={api:null,user:null,profile:null,settings:null,mode:'sell',sellPrice:'',fresh:false,
  saving:false,savedFingerprint:null,request:null,settingsVersion:0,epoch:0,restoring:false};
let announceTimer,syncPromise,syncEpoch;
const text=(id,value)=>{$(id).textContent=value;};
const show=(id,visible)=>{$(id).hidden=!visible;};
const decimal=(value,digits)=>{
  const raw=C.normalize(value);
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return '—';
  const [whole,fraction='']=raw.split('.');
  return C.format({integer:BigInt(whole+fraction),scale:fraction.length},digits??fraction.length);
};
function message(error){
  const value=String(error?.message||error||'');
  if(value.includes('SETTINGS_CHANGED'))return 'تغيّرت أسعار المتجر. حدّث الأسعار وراجع القيمة قبل الحفظ.';
  if(value.includes('STAFF_')||error?.code==='42501')return 'لا يملك هذا الحساب صلاحية لهذه العملية. تواصل مع المدير.';
  if(value.includes('Invalid login')||error?.code==='invalid_credentials')return 'اسم المستخدم أو كلمة المرور غير صحيح.';
  if(value.includes('Email not confirmed'))return 'الحساب غير مفعّل. تواصل مع مدير المتجر.';
  if(value.includes('INVALID_USERNAME'))return 'أدخل اسم مستخدم صحيحاً من 3 إلى 32 حرفاً إنجليزياً أو رقماً، يبدأ بحرف.';
  if(value.includes('ACCOUNT_NOT_CREATED'))return 'لم يُنشأ الحساب. قد يكون اسم المستخدم مستخدماً أو كلمة المرور غير مقبولة. راجع البيانات.';
  if(value.includes('PROVISIONING_NEEDS_OWNER'))return 'لم يكتمل إنشاء الحساب. تواصل مع مالك المشروع لفحص الحساب غير المرتبط قبل إعادة المحاولة.';
  if(value.includes('INVALID_INPUT'))return 'راجع اسم المستخدم والاسم والصلاحية وكلمة المرور (12 حرفاً على الأقل).';
  if(value.includes('rate limit')||error?.status===429)return 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.';
  if(value.includes('OUT_OF_RANGE')||value.includes('FIXED')||value.includes('INVALID_CALCULATION'))return 'راجع الوزن وسعر الغرام ضمن حدود المتجر.';
  if(error?.code==='23514'||error?.code==='23502')return 'راجع الأسعار: يجب أن تكون موجبة والحد الأعلى لا يقل عن الأدنى.';
  if(value.includes('password'))return 'تعذّر تغيير كلمة المرور. استخدم كلمة قوية من 12 حرفاً على الأقل أو تواصل مع المدير.';
  return 'تعذّر الاتصال أو إتمام العملية. تحقق من الإنترنت وإعدادات الخدمة ثم أعد المحاولة.';
}
function notice(value){text('sync-notice',value);show('sync-notice',Boolean(value));}
function closeDialogs(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
function access(title,detail,{login=false,retry=false,logout=false}={}){
  closeDialogs();show('workspace',false);show('access-screen',true);
  text('access-title',title);text('access-message',detail);show('login-form',login);
  show('retry-access',retry);show('access-logout',logout);
  document.body.classList.remove('authenticated');
}
function clearPrivateState(){
  state.epoch++;state.user=null;state.profile=null;state.settings=null;state.fresh=false;
  state.mode='sell';state.sellPrice='';state.request=null;state.savedFingerprint=null;
  $('weight').value='';$('price').value='';$('usd').value='';$('ils').value='';
  $('history-list').replaceChildren();text('save-status','');text('greeting','');
  $('create-staff-form').reset();text('create-staff-status','');
  for(const key of P.settingKeys)$('setting-'+key).value='';render();
}
function loginScreen(){access('أهلاً بك','سجّل دخولك للوصول إلى حاسبة المتجر.',{login:true});}
function fingerprint(){return JSON.stringify([state.mode,C.normalize($('weight').value),C.normalize($('price').value),state.settings?.version]);}
function currentQuote(){
  const allowed=state.fresh&&P.priceAllowed(state.mode,state.settings,$('price').value);
  const values=P.modeValues(state.mode,state.settings,$('price').value);
  const quote=C.calculate({weight:$('weight').value,...(values||{})});
  if(!allowed)quote.results={jod:null,usd:null,ils:null};
  return {...quote,allowed};
}
function render(){
  const {fields,results,allowed}=currentQuote();
  const weightInvalid=fields.weight.state==='invalid';
  $('weight').setAttribute('aria-invalid',String(weightInvalid));text('weight-error',weightInvalid?fields.weight.message:'');
  const priceInvalid=Boolean(state.settings&&$('price').value&&!P.priceAllowed(state.mode,state.settings,$('price').value));
  $('price').setAttribute('aria-invalid',String(priceInvalid));
  text('price-error',priceInvalid?'أدخل سعراً ضمن الحدود المعتمدة.':'');
  for(const key of ['weight','price'])text('summary-'+key,fields[key].state==='valid'?decimal(fields[key].text):'—');
  for(const key of ['jod','usd','ils']){text('total-'+key,results[key]??'—');text('mobile-'+key,results[key]??'—');}
  const valid=allowed&&fields.weight.state==='valid'&&fields.weight.integer>0n;
  const saved=state.savedFingerprint===fingerprint();
  $('save-quote').disabled=!valid||state.saving||saved;
  text('save-quote',state.saving?'جارٍ الحفظ…':saved?'تم حفظ القطعة':'حفظ القطعة في السجل');
  text('result-status',!state.fresh?'الأسعار غير متاحة حتى اكتمال المزامنة':results.jod===null?'أدخل الوزن وسعر الغرام المعتمد':state.mode==='sell'?'قيمة بيع القطعة للعميل':'قيمة شراء القطعة من العميل');
  $('pricing-fields').disabled=!state.fresh||state.saving;
  for(const mode of ['sell','buy']){$('mode-'+mode).disabled=!state.fresh||state.saving;$('mode-'+mode).setAttribute('aria-pressed',String(state.mode===mode));}
  const current=C.parse($('price').value);
  $('price-down').disabled=!state.fresh||state.saving||current.state!=='valid'||P.compare($('price').value,state.settings.sell_min)<=0;
  $('price-up').disabled=!state.fresh||state.saving||current.state!=='valid'||P.compare($('price').value,state.settings.sell_max)>=0;
  clearTimeout(announceTimer);announceTimer=setTimeout(()=>text('announcement',results.jod===null?'':`الإجمالي ${results.jod} دينار أردني`),500);
  return results;
}
function applyMode(){
  const s=state.settings;
  $('price').readOnly=state.mode==='buy';show('price-controls',state.mode==='sell');
  if(s){
    if(!P.priceAllowed('sell',s,state.sellPrice))state.sellPrice=s.sell_min;
    $('price').value=state.mode==='sell'?state.sellPrice:s.buy_price;
    $('usd').value=s[state.mode+'_usd'];$('ils').value=s[state.mode+'_ils'];
    text('price-range',state.mode==='sell'?`من ${decimal(s.sell_min)} إلى ${decimal(s.sell_max)} دينار / غرام`:'سعر شراء ثابت معتمد من الإدارة');
  }
  text('quote-title',state.mode==='sell'?'قيمة البيع':'قيمة الشراء');render();
}
async function sync(){
  if(syncPromise&&syncEpoch===state.epoch)return syncPromise;
  if(!state.user)return;
  const epoch=state.epoch,userId=state.user.id;syncEpoch=epoch;
  syncPromise=(async()=>{
    try{
      const profile=await state.api.profile(userId);
      if(epoch!==state.epoch)return;
      if(!profile?.active){clearPrivateState();access('الحساب غير مفعّل','تواصل مع المدير للتحقق من صلاحيات حسابك.',{logout:true,retry:true});return;}
      let settings=await state.api.settings();
      if(epoch!==state.epoch)return;
      if(settings&&!P.validateSettings(settings))throw new Error('INVALID_SETTINGS');
      if(state.settings&&settings&&settings.version<state.settings.version)settings=state.settings;
      const firstLoad=!state.settings;
      const changed=state.settings&&settings&&state.settings.version!==settings.version;
      state.profile=profile;state.settings=settings;state.fresh=Boolean(settings);
      text('greeting','أهلاً '+profile.display_name);show('settings-open',profile.role==='admin');
      if(profile.role!=='admin'){ $('staff-password').value=''; if($('settings-dialog').open)$('settings-dialog').close(); }
      show('sync-retry',false);if(firstLoad||changed)applyMode();else render();
      notice(!settings?(profile.role==='admin'?'أدخل أسعار المتجر من الإعدادات لبدء العمل.':'بانتظار المدير لإعداد أسعار المتجر.'):
        changed?'تم تحديث أسعار المتجر. راجع القيمة قبل حفظ القطعة.':'');
    }catch(error){
      if(epoch!==state.epoch)return;
      state.fresh=false;notice(message(error));show('sync-retry',true);render();throw error;
    }finally{if(epoch===state.epoch)syncPromise=null;}
  })();
  return syncPromise;
}
async function restore(){
  if(state.restoring)return;
  if(localStorage.getItem('wj-logout-pending')){await logout();return;}
  state.restoring=true;const epoch=state.epoch;
  access('أهلاً بك','جارٍ استعادة جلستك بأمان…');text('auth-error','');
  try{
    const session=await state.api.auth.getSession();if(session.error)throw session.error;
    if(epoch!==state.epoch)return;
    if(!session.data.session){clearPrivateState();loginScreen();return;}
    const user=await state.api.auth.getUser();if(user.error)throw user.error;
    if(epoch!==state.epoch)return;
    state.user=user.data.user;
    await sync();
    if(!state.profile||epoch!==state.epoch)return;
    show('access-screen',false);show('workspace',true);document.body.classList.add('authenticated');
  }catch(error){
    if(epoch!==state.epoch)return;
    state.fresh=false;
    if([400,401,403].includes(error?.status)){clearPrivateState();loginScreen();text('auth-error','انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجدداً.');}
    else access('تعذّر استعادة الجلسة',message(error),{retry:true,logout:true});
  }finally{state.restoring=false;}
}
async function logout(){
  localStorage.setItem('wj-logout-pending','1');
  clearPrivateState();access('تسجيل خروج','جارٍ إنهاء الجلسة…');
  try{const {error}=await state.api.auth.signOut({scope:'local'});if(error)throw error;localStorage.removeItem('wj-logout-pending');loginScreen();}
  catch(error){access('لم يكتمل تسجيل الخروج','تعذّر إنهاء الجلسة لدى الخدمة. اتصل بالإنترنت واضغط تسجيل خروج مجدداً.',{logout:true});}
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login-submit').disabled=true;text('auth-error','');
  try{
    const {error}=await state.api.signIn($('username').value,$('password').value);
    $('password').value='';if(error)throw error;await restore();
  }catch(error){text('auth-error',message(error));}finally{$('password').value='';$('login-submit').disabled=false;}
});
for(const id of ['logout','access-logout'])$(id).addEventListener('click',logout);
$('retry-access').addEventListener('click',restore);
$('sync-retry').addEventListener('click',()=>sync().catch(()=>{}));
for(const mode of ['sell','buy'])$('mode-'+mode).addEventListener('click',()=>{
  if(state.mode==='sell')state.sellPrice=$('price').value;state.mode=mode;text('save-status','');applyMode();
});
for(const id of ['weight','price'])$(id).addEventListener('input',()=>{
  if(id==='price'&&state.mode==='sell')state.sellPrice=$('price').value;text('save-status','');render();
});
for(const [id,direction]of [['price-down',-1],['price-up',1]])$(id).addEventListener('click',()=>{
  state.sellPrice=P.stepPrice($('price').value,direction,state.settings);text('save-status','');applyMode();
});
$('reset').addEventListener('click',()=>{
  $('weight').value='';state.request=null;state.savedFingerprint=null;text('save-status','');render();$('weight').focus();
});
$('save-quote').addEventListener('click',async()=>{
  if($('save-quote').disabled)return;
  const fp=fingerprint(),epoch=state.epoch;
  if(state.request?.fingerprint!==fp)state.request={fingerprint:fp,id:crypto.randomUUID()};
  const args={p_mode:state.mode,p_weight:C.normalize($('weight').value),p_price:C.normalize($('price').value),
    p_settings_version:state.settings.version,p_request_id:state.request.id};
  state.saving=true;text('save-status','');render();
  try{await state.api.save(args);if(epoch!==state.epoch)return;state.savedFingerprint=fp;text('save-status','حُفظت القطعة في سجل المتجر.');}
  catch(error){if(epoch!==state.epoch)return;text('save-status',message(error));
    if(String(error?.message).includes('SETTINGS_CHANGED'))await sync().catch(()=>{});
  }finally{state.saving=false;render();}
});
function element(tag,value,className){const node=document.createElement(tag);if(value!==undefined)node.textContent=value;if(className)node.className=className;return node;}
async function history(){
  const epoch=state.epoch;$('history-list').replaceChildren();text('history-status','جارٍ تحميل السجل…');
  try{
    const records=await state.api.history();if(epoch!==state.epoch)return;
    text('history-status',records.length?'':'لا توجد قطع محفوظة بعد.');
    for(const r of records){
      const card=element('article',undefined,'history-card');
      const heading=element('div',undefined,'history-heading');heading.append(element('strong',r.mode==='sell'?'بيع':'شراء'),element('span',r.user_name));
      const date=element('time',new Intl.DateTimeFormat('ar-JO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at)));date.dateTime=r.created_at;
      const detail=element('p',`${decimal(r.weight)} غرام × ${decimal(r.price)} JOD / غرام`);detail.dir='rtl';
      const totals=element('div',undefined,'history-totals');for(const key of ['jod','usd','ils']){const amount=element('b',decimal(r['total_'+key],key==='jod'?3:2)+' '+key.toUpperCase());amount.dir='ltr';totals.append(amount);}
      const rates=element('p',`1 JOD = ${decimal(r.usd_rate)} USD  ·  ${decimal(r.ils_rate)} ILS`,'history-rates');rates.dir='ltr';
      card.append(heading,date,detail,totals,rates);$('history-list').append(card);
    }
  }catch(error){if(epoch===state.epoch)text('history-status',message(error));}
}
$('history-open').addEventListener('click',()=>{$('history-dialog').showModal();history();});
$('history-refresh').addEventListener('click',history);
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
function fillSettings(){
  state.settingsVersion=state.settings?.version||0;
  for(const key of P.settingKeys)$('setting-'+key).value=state.settings?.[key]||'';
  text('settings-status','');
}
$('settings-open').addEventListener('click',()=>{if(state.profile?.role!=='admin')return;fillSettings();$('settings-dialog').showModal();});
$('settings-reload').addEventListener('click',async()=>{try{await sync();fillSettings();}catch(error){text('settings-status',message(error));}});
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();const values=Object.fromEntries(P.settingKeys.map(k=>[k,$('setting-'+k).value]));
  if(!P.validateSettings(values)){text('settings-status','أدخل أرقاماً موجبة حتى 6 منازل عشرية، وتأكد أن الحد الأعلى لا يقل عن الأدنى.');return;}
  const epoch=state.epoch;$('settings-fields').disabled=true;text('settings-status','جارٍ حفظ الإعدادات…');
  try{
    const settings=await state.api.updateSettings(values,state.settingsVersion);if(epoch!==state.epoch)return;
    state.settings=settings;state.settingsVersion=settings.version;state.fresh=true;applyMode();notice('تم اعتماد أسعار المتجر الجديدة.');
    text('settings-status','تم الحفظ. تصل الإعدادات إلى الأجهزة الأخرى خلال 30 ثانية أو عند إعادة فتح الموقع.');
  }catch(error){if(epoch===state.epoch)text('settings-status',message(error));}
  finally{$('settings-fields').disabled=false;}
});
window.addEventListener('offline',()=>{state.fresh=false;notice('الاتصال بالإنترنت غير متاح. أعد الاتصال لتحديث الأسعار والحفظ.');show('sync-retry',true);render();});
window.addEventListener('online',()=>{if(state.user)sync().catch(()=>{});else if(state.api)restore();});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state.api){if(state.user){state.fresh=false;render();sync().catch(()=>{});}else restore();}
});
window.addEventListener('pageshow',event=>{if(event.persisted&&state.api)restore();});
setInterval(()=>{if(!document.hidden&&state.user&&!state.saving)sync().catch(()=>{});},30000);
try{
  state.api=StoreAPI.create(window.STORE_CONFIG);
  state.api.auth.onAuthStateChange((event)=>{
    // Defer asynchronous work outside Supabase's auth callback lock.
    if(event==='SIGNED_OUT'){clearPrivateState();loginScreen();}

    if(event==='SIGNED_IN'&&!state.restoring&&!state.profile)setTimeout(()=>restore(),0);
  });
  restore();
}catch(error){
  const storage=error.message==='STORAGE_UNAVAILABLE';
  access(storage?'التخزين غير متاح':'المتجر غير متصل بعد',storage?'اسمح بتخزين بيانات الموقع في المتصفح للاحتفاظ بجلسة الدخول.':'يلزم إكمال ربط Supabase وفق ملف SETUP.md. لا يمكن تسجيل الدخول قبل إعداد الخدمة.');
}

// Account creation is authorized again by the Edge Function and database.
$('settings-dialog').addEventListener('close',()=>{$('staff-password').value='';});
$('create-staff-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(state.profile?.role!=='admin')return;
  if(!StoreUsername.valid($('staff-username').value)){text('create-staff-status',message('INVALID_USERNAME'));return;}
  const epoch=state.epoch;
  const values={username:StoreUsername.normalize($('staff-username').value),password:$('staff-password').value,
    role:$('staff-role').value,displayName:$('staff-display-name').value.trim()};
  $('create-staff-fields').disabled=true;text('create-staff-status','جارٍ إنشاء الحساب…');
  try{const result=await state.api.createStaff(values);if(epoch!==state.epoch)return;
    $('create-staff-form').reset();text('create-staff-status','تم إنشاء حساب '+result.username+' بنجاح.');
  }catch(error){if(epoch===state.epoch)text('create-staff-status',message(error));}
  finally{values.password='';$('staff-password').value='';$('create-staff-fields').disabled=false;}
});
