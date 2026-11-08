import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../lib/supabase';
import { clearActiveRide, readPersistedActiveRide } from '../lib/activeRide';
import { clearRosterCache } from '../lib/rosterCache';
import {
  DELETE_CONFIRM_WORD,
  DELETION_EXPLANATION,
  DELETION_RETAINED,
  isDeleteConfirmed,
  runAccountDeletion,
  type DeleteResponse,
} from '../lib/accountDeletion';

// W300 — in-app account deletion. Two deliberate confirmations: (1) read what is deleted and
// tap Continue; (2) type DELETE and tap Delete my account. Cancel at either step deletes nothing.
// On success the sign-out lands the app on SignInScreen via the auth state change.

type Stage = 'explain' | 'confirm' | 'working' | 'done_unsigned';

// After a failed call: does the server still know this user? getUser validates the JWT against
// the auth server, so a deleted user comes back as an error with no user.
async function isAccountGone(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (data?.user) return false;
  const status = (error as { status?: number } | null)?.status;
  // 401/403/404 = the server rejects this user; anything else (offline) proves nothing.
  return status === 401 || status === 403 || status === 404;
}

async function invokeDelete(): Promise<DeleteResponse> {
  // No body: the server acts ONLY on the session JWT's verified uid.
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (!error) return { ok: true };
  // supabase-js puts the function's JSON body on error.context, not in `data`.
  try {
    const ctx = (error as { context?: { status?: number; json?: () => Promise<{ error?: string; message?: string }> } }).context;
    const body = await ctx?.json?.();
    return { ok: false, status: ctx?.status, error: body?.error, message: body?.message };
  } catch {
    return { ok: false };
  }
}

const DeleteAccountModal: React.FC<{ visible: boolean; onClose: () => void; accent: string }> = ({
  visible,
  onClose,
  accent,
}) => {
  const [stage, setStage] = useState<Stage>('explain');
  const [typed, setTyped] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Every opening starts from the first confirmation.
  useEffect(() => {
    if (visible) {
      setStage('explain');
      setTyped('');
      setErrorMsg('');
    }
  }, [visible]);

  const cancel = () => {
    if (stage !== 'working') onClose();
  };

  const confirmDelete = async () => {
    if (!isDeleteConfirmed(typed)) return;
    setStage('working');
    setErrorMsg('');
    const { outcome } = await runAccountDeletion({
      // The DURABLE holder (W286): set while tracking a ride, cleared by Leave Ride, and
      // restored on a cold start mid-ride. The in-memory holder deliberately outlives Leave
      // Ride (D87), so it would block riders who already left.
      hasActiveRide: async () => (await readPersistedActiveRide()) !== null,
      invokeDelete,
      isAccountGone,
      clearActive: clearActiveRide,
      clearRosterCache: () => clearRosterCache('auth_transition'),
      // Default scope ('global') — supabase-patterns Pattern 4. The local fallback runs only
      // after the server has deleted the user (and with it every session).
      signOut: () => supabase.auth.signOut(),
      signOutLocal: () => supabase.auth.signOut({ scope: 'local' }),
    });
    if (outcome.ok) {
      if (!outcome.signedOut) {
        setStage('done_unsigned');
        return;
      }
      // SIGNED_OUT unmounts the signed-in stack; closing is just tidy-up.
      onClose();
      return;
    }
    setErrorMsg(outcome.message);
    setStage(outcome.reason === 'failed' ? 'confirm' : 'explain');
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Delete your account?</Text>

            {stage === 'done_unsigned' ? (
              <Text style={styles.body}>
                Your account is deleted. Close and reopen the app to finish signing out.
              </Text>
            ) : stage === 'explain' ? (
              <>
                <Text style={styles.section}>This permanently deletes</Text>
                {DELETION_EXPLANATION.map((line) => (
                  <Text key={line} style={styles.bullet}>•  {line}</Text>
                ))}
                <Text style={styles.section}>What stays</Text>
                {DELETION_RETAINED.map((line) => (
                  <Text key={line} style={styles.bullet}>•  {line}</Text>
                ))}
                <Text style={styles.warning}>This can’t be undone.</Text>
                {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
                <TouchableOpacity
                  style={[styles.primary, { backgroundColor: '#C0392B' }]}
                  onPress={() => { setErrorMsg(''); setStage('confirm'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to delete account"
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.body}>
                  Type {DELETE_CONFIRM_WORD} to confirm. Your account is deleted straight away.
                </Text>
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  editable={stage !== 'working'}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={DELETE_CONFIRM_WORD}
                  placeholderTextColor="#5A5A5E"
                  style={styles.input}
                  accessibilityLabel={`Type ${DELETE_CONFIRM_WORD} to confirm`}
                />
                {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
                <TouchableOpacity
                  style={[
                    styles.primary,
                    { backgroundColor: isDeleteConfirmed(typed) && stage !== 'working' ? '#C0392B' : '#3A3A3E' },
                  ]}
                  onPress={() => void confirmDelete()}
                  disabled={!isDeleteConfirmed(typed) || stage === 'working'}
                  accessibilityRole="button"
                  accessibilityLabel="Delete my account"
                >
                  {stage === 'working' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>Delete my account</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.secondary}
              onPress={cancel}
              disabled={stage === 'working'}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.secondaryText, { color: accent }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#16161A', borderRadius: 16, maxHeight: '90%' },
  content: { padding: 22 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 14 },
  section: { color: '#9A9A9A', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  bullet: { color: '#E6E6E6', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  body: { color: '#E6E6E6', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  warning: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 12 },
  error: { color: '#FF6B5E', fontSize: 13, lineHeight: 18, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#3A3A3E',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 16,
    letterSpacing: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  secondary: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  secondaryText: { fontWeight: '700', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
});

export default DeleteAccountModal;
