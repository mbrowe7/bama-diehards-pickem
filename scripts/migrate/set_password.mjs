// Sets (or resets) a player's login password directly, without emailing
// them a link. Useful for handing out initial passwords in one batch
// instead of relying on the magic-link/reset-email flow.
//
// Usage: node set_password.mjs <email> <password>
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error('Usage: node set_password.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const { error } = await sb.auth.admin.updateUserById(user.id, { password });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Password set for ${email}.`);
