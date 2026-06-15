import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

// TRIAL aid: a short audible beep on every position ping so the rider can HEAR tracking
// working on a walk. This REPLACES Transistorsoft's built-in `debug: true` chirp, which only
// existed inside the TS engine — the expo-location path is otherwise silent. It fires from
// BOTH the foreground watch (src:'fg') and the headless FGS task (src:'bg'); the audio mode is
// set to stay active in the background so it can ring while the screen is locked. Best-effort:
// Android usually allows audio playback under an active foreground service, but a locked-screen
// chirp from a headless task is not guaranteed — the measurement sink remains the source of
// truth, the chirp is only a live troubleshooting aid. Debug-only; remove before any release.
let sound: Audio.Sound | null = null;
let initing: Promise<void> | null = null;

async function ensure(): Promise<void> {
  if (sound) return;
  if (!initing) {
    initing = (async () => {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });
      const { sound: s } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../assets/chirp.wav'),
        { volume: 1.0 },
      );
      sound = s;
    })();
  }
  await initing;
}

// Fire-and-forget: never let a failed chirp disrupt a ping or tear down the FGS task.
export async function chirp(): Promise<void> {
  try {
    await ensure();
    await sound?.replayAsync();
  } catch (e) {
    console.warn('[Rail3][chirp] failed', e);
  }
}
