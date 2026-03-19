import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://mznlwouvgbnexmirwofd.supabase.co', 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL');

await supabase.auth.signInWithPassword({ email: 'cookers', password: 'frysmart!' });

// Count first
const { count } = await supabase
  .from('tpm_readings')
  .select('*', { count: 'exact', head: true })
  .is('trial_id', null);

console.log(`Venue staff readings to delete: ${count}`);

// Delete all venue staff readings (trial_id IS NULL = not a BDM trial reading)
const { error } = await supabase
  .from('tpm_readings')
  .delete()
  .is('trial_id', null);

if (error) {
  console.error('Error:', error.message);
} else {
  console.log('✓ All venue staff readings deleted');
}

// Confirm
const { count: remaining } = await supabase
  .from('tpm_readings')
  .select('*', { count: 'exact', head: true })
  .is('trial_id', null);

console.log(`Remaining venue staff readings: ${remaining}`);
