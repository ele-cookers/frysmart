import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { mapProfile, mapReading, mapSystemSettings, unMapReading } from './lib/mappers';

const Login = lazy(() => import('./screens/Login'));
const FrysmartAdminPanel = lazy(() => import('./screens/FrysmartAdminPanel'));
const VenueStaffView = lazy(() => import('./screens/VenueStaffView'));
const GroupManagerView = lazy(() => import('./screens/GroupManagerView'));
const BDMTrialsView = lazy(() => import('./screens/BDMTrialsView'));

// Cookers drop pulsing loader with sequential dot animation
const LoadingScreen = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '24px',
    paddingBottom: '20vh',
    background: '#1a428a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }}>
    <style>{`
      @keyframes cookersPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.06); opacity: 0.92; }
      }
      @keyframes dotFlash {
        0%, 20% { opacity: 0; }
        40%, 100% { opacity: 1; }
      }
    `}</style>
    <img
      src="/images/Cookers drop icon.png"
      alt="Loading"
      style={{
        width: '100px', height: '100px', objectFit: 'contain',
        animation: 'cookersPulse 1.6s ease-in-out infinite',
      }}
    />
    <div style={{ color: '#cbd5e1', fontSize: '16px', fontWeight: '500', letterSpacing: '0.5px' }}>
      Loading
      <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0s', opacity: 0 }}>.</span>
      <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0.3s', opacity: 0 }}>.</span>
      <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0.6s', opacity: 0 }}>.</span>
    </div>
  </div>
);

function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = no session
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true); // prevents flash while profile loads

  // Venue staff state
  const [staffVenue, setStaffVenue] = useState(null);
  const [staffReadings, setStaffReadings] = useState([]);
  const [staffSettings, setStaffSettings] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);

  // Venue/group login (no profile row — matched by auth email)
  const [venueLogin, setVenueLogin] = useState(null); // { venueId, name }

  // Admin preview mode — lets admin view VenueStaffView for any venue
  const [previewVenueId, setPreviewVenueId] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user);
      } else {
        setUserLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setUserLoading(true);
        loadProfile(s.user);
      } else {
        setCurrentUser(null);
        setVenueLogin(null);
        setStaffVenue(null);
        setStaffReadings([]);
        setStaffSettings(null);
        setPreviewVenueId(null);
        setUserLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUser) => {
    const userId = authUser.id;
    const authEmail = authUser.email || '';
    const emailPrefix = authEmail.replace('@frysmart.app', '');

    // 1. Check profile FIRST — admin/bdm/nam users always have a profiles row
    let profileData = null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      profileData = data;
    } else if (emailPrefix) {
      // Fallback: match by username (handles cases where auth ID ≠ profile ID)
      const { data: byUsername } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.eq.${emailPrefix},username.eq.${emailPrefix.toUpperCase()}`)
        .limit(1)
        .single();
      if (byUsername) profileData = byUsername;
    }

    if (profileData) {
      const profile = mapProfile(profileData);
      const merged = { ...profile, id: userId };
      setCurrentUser(merged);
      supabase.from('profiles').update({ last_active: new Date().toISOString().split('T')[0] }).eq('id', profileData.id).then(({ error }) => {
        if (error) console.error('Failed to update last_active:', error);
      });
      if (merged.venueId) {
        await loadStaffData(merged.venueId);
      }
      setUserLoading(false);
      return;
    }

    // 2. No profile row — check venue match by customer code
    if (emailPrefix) {
      const prefixUpper = emailPrefix.toUpperCase();
      const { data: venueData } = await supabase
        .from('venues')
        .select('id, name, fryer_count, state, customer_code')
        .eq('customer_code', prefixUpper)
        .single();

      if (venueData) {
        setCurrentUser({ id: userId, name: venueData.name, role: 'venue_staff', venueId: venueData.id });
        setVenueLogin({ venueId: venueData.id, name: venueData.name });
        await loadStaffData(venueData.id);
        setUserLoading(false);
        return;
      }

      // Check groups by username
      const { data: groupData } = await supabase
        .from('groups')
        .select('id, name, username')
        .or(`username.eq.${emailPrefix},username.eq.${prefixUpper}`)
        .limit(1)
        .single();

      if (groupData) {
        setCurrentUser({ id: userId, name: groupData.name, role: 'group_viewer', groupId: groupData.id });
        setUserLoading(false);
        return;
      }
    }

    // 3. No match at all — fallback
    console.warn('No profile or venue/group match for user:', userId, authEmail);
    setCurrentUser({ id: userId, name: authEmail, role: 'unknown' });
    setUserLoading(false);
  };

  const loadStaffData = async (venueId) => {
    setStaffLoading(true);
    try {
      const [venueRes, readingsRes, settingsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', venueId).single(),
        supabase.from('tpm_readings').select('*').eq('venue_id', venueId),
        supabase.from('system_settings').select('*').single(),
      ]);
      if (venueRes.error) console.error('Venue fetch error:', venueRes.error);
      if (readingsRes.error) console.error('Readings fetch error:', readingsRes.error);
      if (settingsRes.error) console.error('Settings fetch error:', settingsRes.error);

      if (venueRes.data) {
        const v = venueRes.data;
        setStaffVenue({
          id: v.id,
          name: v.name,
          fryerCount: v.fryer_count,
          state: v.state,
          customerCode: v.customer_code,
        });
      } else {
        console.error('Could not load venue', venueId, '— check RLS policies');
        setStaffVenue({ id: venueId, name: 'Unknown Venue', fryerCount: 4, state: '', customerCode: '' });
      }
      if (readingsRes.data) {
        setStaffReadings(readingsRes.data.map(mapReading));
      }
      if (settingsRes.data) {
        setStaffSettings(mapSystemSettings(settingsRes.data));
      }
    } catch (err) {
      console.error('loadStaffData failed:', err);
      setStaffVenue({ id: venueId, name: 'Unknown Venue', fryerCount: 4, state: '', customerCode: '' });
    }
    setStaffLoading(false);
  };

  const handlePreviewVenue = (venueId) => {
    setPreviewVenueId(venueId);
    loadStaffData(venueId);
  };

  const handleExitPreview = () => {
    setPreviewVenueId(null);
    setStaffVenue(null);
    setStaffReadings([]);
  };

  const handleSaveReadings = async (camelReadings) => {
    const isOilChange = camelReadings.some(r => r.isOilChange);
    const rows = camelReadings.map(r => {
      const mapped = unMapReading(r);
      return mapped;
    });
    let error;
    if (isOilChange) {
      // Oil change → always INSERT as additional record (reading_number > 1)
      // Find the next reading_number for each fryer/date combo
      for (const row of rows) {
        const { data: existing } = await supabase.from('tpm_readings')
          .select('reading_number')
          .eq('venue_id', row.venue_id)
          .eq('fryer_number', row.fryer_number)
          .eq('reading_date', row.reading_date)
          .order('reading_number', { ascending: false })
          .limit(1);
        row.reading_number = (existing?.[0]?.reading_number || 0) + 1;
      }
      const result = await supabase.from('tpm_readings').insert(rows);
      error = result.error;
    } else {
      // Normal save → upsert (overwrite existing reading_number=1)
      rows.forEach(r => { r.reading_number = 1; });
      const result = await supabase.from('tpm_readings').upsert(rows, { onConflict: 'venue_id,fryer_number,reading_date,reading_number' });
      error = result.error;
    }
    if (error) {
      console.error('Save readings error:', error);
      alert('Failed to save readings: ' + error.message);
      return;
    }
    // Update venue last_tpm_date
    if (rows.length > 0 && rows[0].venue_id) {
      const { error: updateErr } = await supabase.from('venues').update({ last_tpm_date: rows[0].reading_date }).eq('id', rows[0].venue_id);
      if (updateErr) console.error('Update last_tpm_date error:', updateErr);
    }
    // Reload readings for the active venue
    const activeVenueId = previewVenueId || venueLogin?.venueId || currentUser?.venueId;
    if (activeVenueId) {
      const { data, error: readErr } = await supabase.from('tpm_readings').select('*').eq('venue_id', activeVenueId);
      if (readErr) console.error('Reload readings error:', readErr);
      if (data) setStaffReadings(data.map(mapReading));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Loading state (session loading OR user/profile loading)
  if (session === undefined || (session && userLoading)) {
    return <LoadingScreen />;
  }

  // No session → login
  if (!session) {
    return <Suspense fallback={<LoadingScreen />}><Login /></Suspense>;
  }

  // Admin previewing a venue's staff view
  if (previewVenueId && currentUser?.role === 'admin') {
    if (staffLoading || !staffVenue) {
      return <LoadingScreen />;
    }
    return (
      <Suspense fallback={<LoadingScreen />}>
        <VenueStaffView
          currentUser={currentUser}
          venue={staffVenue}
          readings={staffReadings}
          systemSettings={staffSettings}
          onSaveReadings={handleSaveReadings}
          onLogout={handleExitPreview}
        />
      </Suspense>
    );
  }

  // Venue staff login (via profile.venueId OR venue login match)
  if (currentUser?.venueId || venueLogin) {
    if (staffLoading || !staffVenue) {
      return <LoadingScreen />;
    }
    return (
      <Suspense fallback={<LoadingScreen />}>
        <VenueStaffView
          currentUser={currentUser}
          venue={staffVenue}
          readings={staffReadings}
          systemSettings={staffSettings}
          onSaveReadings={handleSaveReadings}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  // Group manager view
  if (currentUser?.role === 'group_viewer') {
    return <Suspense fallback={<LoadingScreen />}><GroupManagerView currentUser={currentUser} onLogout={handleLogout} /></Suspense>;
  }

  // BDM view — dedicated oil trials screen
  if (currentUser?.role === 'bdm') {
    return <Suspense fallback={<LoadingScreen />}><BDMTrialsView currentUser={currentUser} onLogout={handleLogout} /></Suspense>;
  }

  // Authenticated → admin panel
  return <Suspense fallback={<LoadingScreen />}><FrysmartAdminPanel currentUser={currentUser} onPreviewVenue={handlePreviewVenue} /></Suspense>;
}

export default App;
