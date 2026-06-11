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
import { TENANT_SLUG } from '../lib/env';

// Stages of the passwordless OTP flow:
//   email    — collecting the address
//   sending  — invoking send-magic-link
//   code     — collecting the 6-digit code from the email
//   verifying — calling auth.verifyOtp
type Stage = 'email' | 'sending' | 'code' | 'verifying';

// The email OTP length is a server-side Supabase setting (mailer_otp_length), not a
// client constant — so don't hardcode a single length. Accept anything in this range
// and let auth.verifyOtp do the real validation; the gate just needs a sane minimum.
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;

// Passwordless sign-in via a 6-digit email code. Routes through the send-magic-link
// edge function (generateLink + Resend) — the SAME path production Vechelon uses —
// NOT Supabase's built-in mailer (see the PoC-stays-aligned-to-production principle).
// generateLink also yields a 6-digit email_otp; the email shows that code, the user
// types it here, and auth.verifyOtp establishes the session. This sidesteps D48 —
// Android dropping the https→rail3:// magic-link redirect — because there is no
// browser→app hop at all. redirectTo (rail3://auth) is sent only to satisfy
// generateLink's allow-list validation; the user never follows it.
const SignInScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('email');
  const [errorMsg, setErrorMsg] = useState('');

  const trimmedEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    if (!trimmedEmail) return;

    setStage('sending');
    setErrorMsg('');

    const { error } = await supabase.functions.invoke('send-magic-link', {
      body: { email: trimmedEmail, redirectTo: authRedirectUrl, slug: TENANT_SLUG },
    });

    if (error) {
      // The function returns 400 with { error: "<reason>" }; supabase-js surfaces
      // the body only on error.context, not in `data`.
      let msg = error.message;
      try {
        const body = await (
          error as { context?: { json?: () => Promise<{ error?: string }> } }
        ).context?.json?.();
        if (body?.error) msg = body.error;
      } catch {
        // keep the generic message
      }
      setStage('email');
      setErrorMsg(msg);
    } else {
      setCode('');
      setStage('code');
    }
  };

  const verifyCode = async () => {
    const token = code.trim();
    if (token.length < MIN_CODE_LENGTH) return;

    setStage('verifying');
    setErrorMsg('');

    // type: 'email' verifies the email OTP from generateLink. On success supabase-js
    // sets the session and AuthContext's onAuthStateChange flips the gate — no
    // navigation needed here.
    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token,
      type: 'email',
    });

    if (error) {
      setStage('code');
      setErrorMsg(error.message);
    }
  };

  if (stage === 'code' || stage === 'verifying') {
    const verifying = stage === 'verifying';
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.brand}>VECHELON</Text>
        <Text style={styles.subtitle}>Enter your code</Text>

        <Text style={styles.body}>
          We sent a code to {trimmedEmail}. Enter it below to sign in.
        </Text>

        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) =>
            setCode(t.replace(/[^0-9]/g, '').slice(0, MAX_CODE_LENGTH))
          }
          placeholder="••••••"
          placeholderTextColor="#7A7A7A"
          keyboardType="number-pad"
          autoFocus
          maxLength={MAX_CODE_LENGTH}
          editable={!verifying}
        />

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <TouchableOpacity
          style={[
            styles.button,
            (verifying || code.trim().length < MIN_CODE_LENGTH) && styles.buttonDisabled,
          ]}
          onPress={verifyCode}
          disabled={verifying || code.trim().length < MIN_CODE_LENGTH}
        >
          {verifying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Verify & Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setErrorMsg('');
            setStage('email');
          }}
          disabled={verifying}
        >
          <Text style={styles.link}>Use a different email</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  const sending = stage === 'sending';
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
        editable={!sending}
      />

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <TouchableOpacity
        style={[styles.button, sending && styles.buttonDisabled]}
        onPress={sendCode}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Send Code</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.fine}>
        Passwordless sign-in · code expires in 60 minutes
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
  codeInput: {
    textAlign: 'center',
    fontSize: 26,
    letterSpacing: 6,
    fontWeight: '700',
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
  link: { color: '#E11D2A', fontSize: 13, marginTop: 20 },
  fine: {
    color: '#5A5A5A',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 24,
  },
});

export default SignInScreen;
