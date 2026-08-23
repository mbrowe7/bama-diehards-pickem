import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = process.argv[2];
const { data, error } = await sb.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: 'http://localhost:5173' },
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(data.properties.action_link);
