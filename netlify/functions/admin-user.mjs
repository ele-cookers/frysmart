import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Verify the caller is an authenticated admin
async function verifyAdmin(authHeader) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;
  // Check profile role
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  try {
    const admin = await verifyAdmin(req.headers.get('authorization'));
    if (!admin) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), { status: 401, headers });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create-user') {
      const { username, password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Username and password are required.' }), { status: 400, headers });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters.' }), { status: 400, headers });
      }
      const authEmail = `${username.toLowerCase()}@frysmart.app`;
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
      }
      return new Response(JSON.stringify({ userId: data.user.id }), { status: 200, headers });
    }

    if (action === 'lookup-user') {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required.' }), { status: 400, headers });
      }
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
      }
      const found = data.users.find(u => u.email === email);
      if (!found) {
        return new Response(JSON.stringify({ error: 'No auth user found with that email.', users: data.users.map(u => ({ id: u.id, email: u.email, confirmed: !!u.email_confirmed_at })) }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ id: found.id, email: found.email, confirmed: !!found.email_confirmed_at, created: found.created_at }), { status: 200, headers });
    }

    if (action === 'fix-user') {
      const { email, password, profileId } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email and password are required.' }), { status: 400, headers });
      }
      const emailLower = email.toLowerCase();
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const found = listData?.users?.find(u => u.email.toLowerCase() === emailLower);
      if (found) {
        // Auth user exists — update password and confirm
        const { error } = await supabaseAdmin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
        }
        // If profile ID doesn't match auth ID, update the profile to use the auth ID
        if (profileId && profileId !== found.id) {
          await supabaseAdmin.from('profiles').update({ id: found.id }).eq('id', profileId);
        }
        return new Response(JSON.stringify({ success: true, userId: found.id, created: false }), { status: 200, headers });
      } else {
        // Auth user missing — create it
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createErr) {
          return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers });
        }
        // Update profile row to use the new auth user ID
        if (profileId) {
          await supabaseAdmin.from('profiles').update({ id: newUser.user.id }).eq('id', profileId);
        }
        return new Response(JSON.stringify({ success: true, userId: newUser.user.id, created: true }), { status: 200, headers });
      }
    }

    if (action === 'update-password') {
      const { userId, password } = body;
      if (!userId || !password) {
        return new Response(JSON.stringify({ error: 'User ID and password are required.' }), { status: 400, headers });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters.' }), { status: 400, headers });
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (action === 'delete-user') {
      const { userId, email } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID is required.' }), { status: 400, headers });
      }
      // Delete profile row first
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      // Delete auth user (look up by email if ID doesn't match)
      let deleted = false;
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (!delErr) {
        deleted = true;
      } else if (email) {
        // Try finding by email
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const found = listData?.users?.find(u => u.email === email);
        if (found) {
          await supabaseAdmin.auth.admin.deleteUser(found.id);
          deleted = true;
        }
      }
      return new Response(JSON.stringify({ success: true, authDeleted: deleted }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
