// Repoints an existing auth user at a new email address -- used to swap a
// migration placeholder (e.g. lumia@bamadiehards.placeholder) for a real
// address once the player hands it over. All of that player's history
// (picks, bonus picks, standings, preseason projections) stays attached
// because the underlying auth.users / players id never changes.
//
// Optionally also renames the players.display_name in the same run.
//
// Usage: node set_email.mjs <old-email> <new-email> [display-name]
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const oldEmail = process.argv[2];
const newEmail = process.argv[3];
const displayName = process.argv[4];
if (!oldEmail || !newEmail) {
  console.error('Usage: node set_email.mjs <old-email> <new-email> [display-name]');
  process.exit(1);
}

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}
const user = list.users.find((u) => u.email?.toLowerCase() === oldEmail.toLowerCase());
if (!user) {
  console.error(`No user found for ${oldEmail}`);
  process.exit(1);
}
if (list.users.some((u) => u.email?.toLowerCase() === newEmail.toLowerCase())) {
  console.error(`Another user already has ${newEmail}`);
  process.exit(1);
}

const { error: emailErr } = await sb.auth.admin.updateUserById(user.id, {
  email: newEmail,
  email_confirm: true,
});
if (emailErr) {
  console.error(emailErr.message);
  process.exit(1);
}
console.log(`${oldEmail} -> ${newEmail} (id ${user.id})`);

if (displayName) {
  const { error: nameErr } = await sb.from('players')
    .update({ display_name: displayName })
    .eq('id', user.id);
  if (nameErr) {
    console.error(nameErr.message);
    process.exit(1);
  }
  console.log(`display_name set to "${displayName}"`);
}

console.log('Done. Have the player sign in with the new email via magic link / password reset.');
