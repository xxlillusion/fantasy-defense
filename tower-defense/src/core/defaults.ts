// Default settings shared by audio/save/UI. FROZEN during parallel work.
import type { AudioSettings, UserSettings } from './interfaces';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
export const DEFAULT_USER_SETTINGS: UserSettings = { audio: { ...DEFAULT_AUDIO_SETTINGS }, showDamageNumbers: true };
