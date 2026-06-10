import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../lib/supabase';
import { authRedirectUrl } from '../lib/deepLinkAuth';

type Stage = 'idle' | 'sending' | 'sent' | 'error';

// Passwordless magic-link sign-in. Sends Supabase's default (platform-branded)
// auth email via signInWithOtp. New riders are auto-created on first sign-in
// (shouldCreateUser defaults to true), matching the web portal's behaviour.
// emailRedirectTo points at the app's deep link so the link returns to the app.
const SignInScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStage('sending');
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: authRedirectUrl },
    });

    if (error) {
      setStage('error');
      setErrorMsg(error.message);
    } else {
      setStage('sent');
    }
  };

  if (stage === 'sent') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Magic link sent</Text>
        <Text style={styles.body}>
          A sign-in link was sent to {email.trim().toLowerCase()}. Open it on this
          device to sign in.
        </Text>
        <TouchableOpacity onPress={() => setStage('idle')}>
          <Text style={styles.link}>Use a different email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.brand}>VECHELON</Text>
      <Text style={styles.subtitle}>Rail 3 — Mobile Tactical</Text>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="rider@example.com"
        placeholderTextColor="#7A7A7A"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        editable={stage !== 'sending'}
      />

      {stage === 'error' ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <TouchableOpacity
        style={[styles.button, stage === 'sending' && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={stage === 'sending'}
      >
        {stage === 'sending' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Send Magic Link</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.fine}>
        Passwordless sign-in · link expires in 60 minutes
      </Text>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E10',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 40,
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  body: {
    color: '#B8B8B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    backgroundColor: '#1A1A1D',
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  button: {
    width: '100%',
    backgroundColor: '#E11D2A',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontSize: 14,
  },
  error: { color: '#FF6B6B', fontSize: 12, marginTop: 12, textAlign: 'center' },
  link: { color: '#E11D2A', fontSize: 13, marginTop: 8 },
  fine: {
    color: '#5A5A5A',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 24,
  },
});

export default SignInScreen;
