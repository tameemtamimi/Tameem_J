/* Only provider session tokens persist. Shared settings/history always come from Supabase. */
(function(root){
  'use strict';
  function create(config) {
    if(!config||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl||'')) throw new Error('CONFIG_REQUIRED');
    const key=config.supabasePublishableKey||'';
    let publicKey=key.startsWith('sb_publishable_');
    if(key.startsWith('eyJ')) {
      try { publicKey=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon'; } catch { publicKey=false; }
    }
    if(!publicKey) throw new Error('PUBLIC_KEY_REQUIRED');
    // Fail explicitly when durable browser storage is unavailable; never pretend to persist.
    try { localStorage.setItem('wj-storage-check','1');localStorage.removeItem('wj-storage-check'); }
    catch { throw new Error('STORAGE_UNAVAILABLE'); }
    const client=root.supabase.createClient(config.supabaseUrl,key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
      global:{fetch:async(input,options={})=>{
        const controller=new AbortController();
        const abort=()=>controller.abort();
        if(options.signal?.aborted)controller.abort();
        else options.signal?.addEventListener('abort',abort,{once:true});
        const timeout=setTimeout(abort,15000);
        try{return await fetch(input,{...options,signal:controller.signal});}
        finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
      }}
    });
    async function unwrap(query){const {data,error}=await query;if(error)throw error;return data;}
    return {
      auth:client.auth,
      signIn:(username,password)=>client.auth.signInWithPassword({email:StoreUsername.accountIdentifier(username),password}),
      createStaff:async values=>{
        const {data,error}=await client.functions.invoke('create-staff',{body:values});
        if(error){
          let code='SERVICE_UNAVAILABLE';
          try{code=(await error.context.json()).code||code;}catch{}
          throw new Error(code);
        }
        return data;
      },
      profile:async id=>unwrap(client.from('staff_profiles').select('user_id,display_name,role,active').eq('user_id',id).maybeSingle()),
      settings:()=>unwrap(client.rpc('get_store_settings')),
      history:()=>unwrap(client.rpc('latest_calculations')),
      save:args=>unwrap(client.rpc('save_calculation',args)),
      updateSettings:(values,version)=>unwrap(client.rpc('update_store_settings',{
        p_expected_version:version,...Object.fromEntries(StorePricing.settingKeys.map(k=>['p_'+k,GoldCalculator.normalize(values[k])]))
      }))
    };
  }
  root.StoreAPI={create};
})(window);
