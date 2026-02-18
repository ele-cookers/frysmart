import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { mapProfile } from './lib/mappers';
import Login from './screens/Login';
import FrysmartAdminPanel from './screens/FrysmartAdminPanel';

function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = no session
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      setCurrentUser(mapProfile(data));
      // Update last_active
      supabase.from('profiles').update({ last_active: new Date().toISOString().split('T')[0] }).eq('id', userId);
    }
  };

  // Loading state
  if (session === undefined) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', color: '#94a3b8', fontSize: '14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        Loading...
      </div>
    );
  }

  // No session → login
  if (!session) {
    return <Login />;
  }

  // Authenticated → admin panel
  return <FrysmartAdminPanel currentUser={currentUser} />;
}

export default App;
