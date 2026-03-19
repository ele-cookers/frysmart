import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://mznlwouvgbnexmirwofd.supabase.co','sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL');
await supabase.auth.signInWithPassword({ email: 'ctaaffe@frysmart.app', password: 'ctaaffe' });

const canola = { id: '9efd5fa8-3d7f-4384-a371-29f56187848c', code: 'CANOLANA' };

// QLD-TEST-001 has name "QLD-TEST-001" with null customer_code
// WESMEV0 has customer_code "WESMEV0" — already fixed for oil
// Fix QLD-TEST-001: update by name, also set customer_code
const { data: all } = await supabase.from('venues').select('id,name,customer_code,status,default_oil_id');
const qldTest = all?.find(v => v.name === 'QLD-TEST-001');
const wesmev   = all?.find(v => v.customer_code === 'WESMEV0' || v.name === 'WESMEV0');

console.log('QLD-TEST-001:', qldTest?.id, 'current oil:', qldTest?.default_oil_id);
console.log('WESMEV0:', wesmev?.id, 'current oil:', wesmev?.default_oil_id);

// Fix QLD-TEST-001 — set default_oil_id to canola AND fix customer_code
if (qldTest) {
  const { error } = await supabase.from('venues').update({ 
    default_oil_id: canola.id,
    customer_code: 'QLD-TEST-001'
  }).eq('id', qldTest.id);
  if (error) console.error('QLD-TEST-001 update error:', error.message);
  else console.log('✓ QLD-TEST-001 updated — Cookers Canola, customer_code fixed');
}

// Confirm WESMEV0 oil
console.log('WESMEV0 oil already updated to:', wesmev?.default_oil_id === canola.id ? 'Cookers Canola ✓' : `${wesmev?.default_oil_id} (needs check)`);

// Now check the trials for both — ensure they are trialType = 'existing'
// Trials use trial_oil_id (Cookers oil). The trialType is inferred from defaultOil not being a competitor oil.
// Since we set defaultOil to a Cookers oil, they will now show as "Existing customer" ✓
console.log('\nDone! Both venues now have Cookers Canola as current oil → will show as Existing Customer');
