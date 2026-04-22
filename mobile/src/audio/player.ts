import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

let currentSound: Audio.Sound | null = null;

export async function playBase64Audio(base64Audio: string, mimeType: string): Promise<void> {
  const source = `data:${mimeType};base64,${base64Audio}`;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  if (currentSound) {
    await currentSound.unloadAsync();
    currentSound = null;
  }

  const { sound } = await Audio.Sound.createAsync({ uri: source }, { shouldPlay: true });
  currentSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded || !status.didJustFinish) return;
    void sound.unloadAsync();
    if (currentSound === sound) {
      currentSound = null;
    }
  });
}

export async function stopAudio(): Promise<void> {
  if (!currentSound) return;
  await currentSound.stopAsync();
  await currentSound.unloadAsync();
  currentSound = null;
}
