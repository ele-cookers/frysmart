import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://mznlwouvgbnexmirwofd.supabase.co', 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL');
await supabase.auth.signInWithPassword({ email: 'dangelko@frysmart.app', password: 'dangelko' });
const { data: bdm } = await supabase.from('profiles').select('id').eq('username','dangelko').single();
console.log('BDM id:', bdm.id);

const { data: venues } = await supabase.from('venues').select('id,name').eq('status','trial-only').eq('bdm_id', bdm.id).ilike('name', '%(TEST)%');
console.log('TEST venues to delete:', venues?.length);

for (const v of (venues || [])) {
  const r1 = await supabase.from('tpm_readings').delete().eq('venue_id', v.id);
  const r2 = await supabase.from('trials').delete().eq('venue_id', v.id);
  const r3 = await supabase.from('venues').delete().eq('id', v.id);
  const { data: check } = await supabase.from('venues').select('id').eq('id', v.id).maybeSingle();
  const stillExists = check !== null;
  console.log(v.name);
  console.log('  readings:', r1.error ? r1.error.message : 'ok');
  console.log('  trials:  ', r2.error ? r2.error.message : 'ok');
  console.log('  venue:   ', r3.error ? r3.error.message : 'ok');
  console.log('  still exists:', stillExists);
}

const { data: remaining } = await supabase.from('venues').select('name,status').eq('bdm_id', bdm.id);
console.log('\nRemaining venues:');
remaining?.forEach(v => console.log(' -', v.name, '|', v.status));
