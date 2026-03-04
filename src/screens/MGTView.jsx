// ─────────────────────────────────────────────
// MGT View — Management / NSM
// Full admin panel access now; restrict sections here as needed down the track.
// ─────────────────────────────────────────────
import FrysmartAdminPanel from './FrysmartAdminPanel';

export default function MGTView({ currentUser, onPreviewVenue }) {
  return (
    <FrysmartAdminPanel
      currentUser={currentUser}
      onPreviewVenue={onPreviewVenue}
      viewMode="mgt"
    />
  );
}
