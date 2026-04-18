/**
 * Voice ID -> friendly display name mapping.
 *
 * Used across the app wherever a voice is displayed (AI Agents list,
 * Agent configure page, Agent builder, etc.) so raw ElevenLabs and
 * Deepgram Aura voice IDs never leak into the UI.
 */

export interface VoiceMeta {
  id: string;
  name: string;
  provider: "elevenlabs" | "deepgram" | "openai" | "other";
  gender?: "female" | "male" | "neutral";
  accent?: string;
  description?: string;
}

// ElevenLabs pre-made library voices. IDs from ElevenLabs voice library.
const ELEVENLABS_VOICES: VoiceMeta[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  provider: "elevenlabs", gender: "female", accent: "American", description: "Calm, conversational" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    provider: "elevenlabs", gender: "female", accent: "American", description: "Strong, confident" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   provider: "elevenlabs", gender: "female", accent: "American", description: "Soft, young" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  provider: "elevenlabs", gender: "male",   accent: "American", description: "Well-rounded, warm" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    provider: "elevenlabs", gender: "female", accent: "American", description: "Emotional, young" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    provider: "elevenlabs", gender: "male",   accent: "American", description: "Deep, serious" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  provider: "elevenlabs", gender: "male",   accent: "American", description: "Crisp, authoritative" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    provider: "elevenlabs", gender: "male",   accent: "American", description: "Deep, narration" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     provider: "elevenlabs", gender: "male",   accent: "American", description: "Raspy, casual" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris",   provider: "elevenlabs", gender: "male",   accent: "American", description: "Friendly, conversational" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", provider: "elevenlabs", gender: "female", accent: "British",  description: "Professional" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", provider: "elevenlabs", gender: "female", accent: "American", description: "Warm, friendly" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",  provider: "elevenlabs", gender: "male",   accent: "British",  description: "Deep, newsreader" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will",    provider: "elevenlabs", gender: "male",   accent: "American", description: "Young, optimistic" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", provider: "elevenlabs", gender: "female", accent: "American", description: "Young, casual" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", provider: "elevenlabs", gender: "female", accent: "Swedish-English" },
  { id: "CYw3kZ02Hs0563khs1Fj", name: "Dave",    provider: "elevenlabs", gender: "male",   accent: "British",  description: "Conversational" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin",     provider: "elevenlabs", gender: "male",   accent: "Irish",    description: "Sailor" },
  { id: "EiNlNiXeDU1pqqOPrYMO", name: "John",    provider: "elevenlabs", gender: "male",   accent: "American" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", provider: "elevenlabs", gender: "male",   accent: "Australian", description: "Casual" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",  provider: "elevenlabs", gender: "male",   accent: "British",  description: "Warm, mature" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily",   provider: "elevenlabs", gender: "female", accent: "American", description: "Calm, meditative" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum",  provider: "elevenlabs", gender: "male",   accent: "American", description: "Hoarse, intense" },
  { id: "ODq5zmih8GrVes37Dizd", name: "Patrick", provider: "elevenlabs", gender: "male",   accent: "American", description: "Shouty" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River",   provider: "elevenlabs", gender: "neutral", accent: "American" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry",   provider: "elevenlabs", gender: "male",   accent: "American", description: "Anxious" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam",    provider: "elevenlabs", gender: "male",   accent: "American", description: "Neutral" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", provider: "elevenlabs", gender: "female", accent: "British",  description: "Pleasant, story" },
  { id: "ZQe5CZNOzWyzPSCn5a3c", name: "James",   provider: "elevenlabs", gender: "male",   accent: "Australian", description: "Calm, mature" },
  { id: "Zlb1dXrM653N07WRdFW3", name: "Joseph",  provider: "elevenlabs", gender: "male",   accent: "British",  description: "Upbeat" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", provider: "elevenlabs", gender: "male",   accent: "American", description: "Orator" },
  { id: "g5CIjZEefAph4nQFvHAz", name: "Ethan",   provider: "elevenlabs", gender: "male",   accent: "American", description: "Soft, ASMR" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi",    provider: "elevenlabs", gender: "female", accent: "American", description: "Childlish" },
  { id: "jsCqWAovK2LkecY7zXl4", name: "Freya",   provider: "elevenlabs", gender: "female", accent: "American" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",   provider: "elevenlabs", gender: "male",   accent: "American", description: "Deep, resonant" },
  { id: "oWAxZDx7w5VEj9dCyTzz", name: "Grace",   provider: "elevenlabs", gender: "female", accent: "Southern American" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",    provider: "elevenlabs", gender: "female", accent: "British" },
  { id: "piTKgcLEGmPE4e6mEKli", name: "Nicole",  provider: "elevenlabs", gender: "female", accent: "American", description: "Whispery" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill",    provider: "elevenlabs", gender: "male",   accent: "American", description: "Strong, gentle" },
  { id: "t0jbNlBVZ17f02VDIeMI", name: "Jeremy",  provider: "elevenlabs", gender: "male",   accent: "Irish" },
  { id: "yjJ45q8TVCrtMhEKurxY", name: "Dylan",   provider: "elevenlabs", gender: "male",   accent: "American" },
  { id: "z9fAnlkpzviPz146aGWa", name: "Glinda",  provider: "elevenlabs", gender: "female", accent: "American", description: "Witch" },
  { id: "zcAOhNBS3c14rBihAFp1", name: "Giovanni", provider: "elevenlabs", gender: "male",  accent: "Italian-English" },
  { id: "zrHiDhphv9ZnVXBqCLjz", name: "Mimi",    provider: "elevenlabs", gender: "female", accent: "Swedish-English" },
];

// Deepgram Aura v2 voices (used in some places as the `voice_id`).
const DEEPGRAM_AURA_VOICES: VoiceMeta[] = [
  { id: "aura-2-luna-en",    name: "Luna",    provider: "deepgram", gender: "female", accent: "American" },
  { id: "aura-2-orion-en",   name: "Orion",   provider: "deepgram", gender: "male",   accent: "American" },
  { id: "aura-2-stella-en",  name: "Stella",  provider: "deepgram", gender: "female", accent: "American" },
  { id: "aura-2-asteria-en", name: "Asteria", provider: "deepgram", gender: "female", accent: "American" },
  { id: "aura-2-athena-en",  name: "Athena",  provider: "deepgram", gender: "female", accent: "American" },
  { id: "aura-2-helios-en",  name: "Helios",  provider: "deepgram", gender: "male",   accent: "American" },
  { id: "aura-2-hera-en",    name: "Hera",    provider: "deepgram", gender: "female", accent: "American" },
  { id: "aura-2-zeus-en",    name: "Zeus",    provider: "deepgram", gender: "male",   accent: "American" },
];

export const ALL_VOICES: VoiceMeta[] = [
  ...ELEVENLABS_VOICES,
  ...DEEPGRAM_AURA_VOICES,
];

const VOICE_BY_ID = new Map<string, VoiceMeta>(ALL_VOICES.map(v => [v.id, v]));

/** Return a friendly name for a voice id. Falls back to "Custom" if unknown. */
export function getVoiceName(voiceId: string | null | undefined): string {
  if (!voiceId) return "Default";
  const meta = VOICE_BY_ID.get(voiceId);
  if (meta) return meta.name;
  // Deepgram ids look like aura-2-xxx-en — derive a name from the slug as
  // a defensive fallback so we don't leak raw "aura-2-foo-en".
  const auraMatch = voiceId.match(/^aura(?:-\d+)?-([^-]+)-/);
  if (auraMatch) {
    const slug = auraMatch[1];
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
  return "Custom";
}

/** Return full voice metadata or undefined if unknown. */
export function getVoiceMeta(voiceId: string | null | undefined): VoiceMeta | undefined {
  if (!voiceId) return undefined;
  return VOICE_BY_ID.get(voiceId);
}

/** Quick "Rachel (Female, American)" style label for detail views. */
export function getVoiceDisplayLabel(voiceId: string | null | undefined): string {
  const meta = getVoiceMeta(voiceId);
  if (!meta) return getVoiceName(voiceId);
  const parts: string[] = [meta.name];
  const sub: string[] = [];
  if (meta.gender) sub.push(meta.gender.charAt(0).toUpperCase() + meta.gender.slice(1));
  if (meta.accent) sub.push(meta.accent);
  if (sub.length) parts.push(`(${sub.join(", ")})`);
  return parts.join(" ");
}
