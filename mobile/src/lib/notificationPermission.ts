// D101 — Android 13+ (API 33) makes POST_NOTIFICATIONS a runtime permission that defaults
// to DENIED on a fresh install. Without it the tracking foreground service still runs, but
// its persistent "Vechelon — sharing your position" notification is hidden from the shade,
// so a rider can't see that background location is on. The Play listing, the W225
// background-location declaration and the "Keep your ride visible" explainer all promise
// that notification, so the ride-join flow asks for it once.
//
// Pure and dependency-injected (no react-native import) so `node --test` can pin the
// gating. The caller wires in Platform + PermissionsAndroid. Advisory only: it NEVER
// throws and never blocks the join — a denied or failed request just leaves the
// notification hidden, exactly as before this fix.

export const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
export const POST_NOTIFICATIONS_MIN_API = 33;

export type NotificationPermissionDeps = {
  os: string;
  apiLevel: number | string;
  request: (permission: string) => Promise<string>;
};

export type NotificationPermissionOutcome = 'not_required' | 'granted' | 'denied' | 'error';

export async function ensureNotificationPermission(
  deps: NotificationPermissionDeps,
): Promise<NotificationPermissionOutcome> {
  const api = typeof deps.apiLevel === 'number' ? deps.apiLevel : Number(deps.apiLevel);
  if (deps.os !== 'android' || !Number.isFinite(api) || api < POST_NOTIFICATIONS_MIN_API) {
    return 'not_required';
  }
  try {
    // PermissionsAndroid resolves 'granted' | 'denied' | 'never_ask_again'; when the
    // permission is already granted it resolves 'granted' without showing a dialog.
    const result = await deps.request(POST_NOTIFICATIONS);
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}
