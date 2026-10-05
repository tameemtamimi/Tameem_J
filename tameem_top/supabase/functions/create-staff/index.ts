import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { makeHandler } from './handler.ts';

// Supabase supplies these on its servers. Never copy them into frontend files.
const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
Deno.serve(makeHandler({
  admin: createClient(url, serviceKey, options),
  caller: (token: string) => createClient(url, anonKey, {
    ...options, global: { headers: { Authorization: `Bearer ${token}` } }
  })
}));
