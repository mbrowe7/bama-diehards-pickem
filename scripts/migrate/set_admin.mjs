import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const name = process.argv[2];
const { data, error } = await sb.from('players').update({ role: 'admin' }).eq('display_name', name).select().single();
console.log(error ? `ERROR: ${error.message}` : `${data.display_name} is now admin.`);
