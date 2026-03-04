// ─────────────────────────────────────────────
// NAM View — National Account Manager
// Full admin panel access now; restrict sections here as needed down the track.
// ─────────────────────────────────────────────
import FrysmartAdminPanel from './FrysmartAdminPanel';

export default function NAMView({ currentUser, onPreviewVenue }) {
  return (
    <FrysmartAdminPanel
      currentUser={currentUser}
      onPreviewVenue={onPreviewVenue}
      viewMode="nam"
    />
  );
}
