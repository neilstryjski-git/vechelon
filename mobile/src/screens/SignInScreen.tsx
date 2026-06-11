import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { useTheme } from '../theme/ThemeProvider';

type Stage = 'idle' | 'sending' | 'sent' | 'error';

// Passwordless magic-link sign-in. Routes through the send-magic-link edge
// function (generateLink + Resend) — the SAME path production Vechelon uses —
// NOT Supabase's built-in mailer (see the PoC-stays-aligned-to-production
// principle). redirectTo is the app deep link so the link returns to the app;
// slug brands the email for the right club. On a non-2xx the function's { error }
// body is reachable only via error.context (supabase-js leaves `data` null), so we
// read it from there — mirroring the web AuthPage error handling.
const SignInScreen: React.FC = () => {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Fall back to the club wordmark if the branded logo URL fails to load.
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!theme.logoUrl && !logoFailed;

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStage('sending');
    setErrorMsg('');

    const { error } = await supabase.functions.invoke('send-magic-link', {
      body: { email: trimmed, redirectTo: authRedirectUrl, slug: TENANT_SLUG },
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
      setStage('error');
      setErrorMsg(msg);
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
          <Text style={[styles.link, { color: theme.primaryColor }]}>
            Use a different email
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {showLogo ? (
        <Image
          source={{ uri: theme.logoUrl as string }}
          style={styles.logo}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <Text style={styles.brand}>{theme.clubName.toUpperCase()}</Text>
      )}
      <Text style={[styles.subtitle, { color: theme.accentColor }]}>
        Rail 3 — Mobile Tactical
      </Text>

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
        style={[
          styles.button,
          { backgroundColor: theme.primaryColor },
          stage === 'sending' && styles.buttonDisabled,
        ]}
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
  logo: {
    width: 220,
    height: 56,
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
