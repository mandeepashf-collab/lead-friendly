import { NextResponse } from "next/server";

// Hardcoded fallback voices in case ElevenLabs API key lacks scope
// These are stable ElevenLabs premade voice IDs that work with any key
const FALLBACK_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",    gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Warm & professional — best for sales",        category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",      gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Strong & confident — best for outbound",      category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/69c5373f-0dc9-4df9-bc43-ff7f89f53de9.mp3" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",     gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Soft & gentle — best for customer care",     category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/08e8966f-a8d1-4f2a-9a60-36ba8fb96f65.mp3" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",    gender: "male",   accent: "American", age: "young", use_case: "narration",      description: "Well-rounded — best for general use",        category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38d8f8f1-1f07-4fad-af7e-96f2f01d5f23.mp3" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",      gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Emotional & engaging — best for follow-up",  category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/ded44943-e1c4-46f0-9cc4-a7ad78816c40.mp3" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",      gender: "male",   accent: "American", age: "young", use_case: "narration",      description: "Deep & trustworthy — best for high-value",   category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/db9a4d58-060d-4886-a4e6-2a7a45b2cb3a.mp3" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",    gender: "male",   accent: "American", age: "middle_aged", use_case: "narration", description: "Crisp & authoritative — best for B2B",       category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/f9fd36a4-d6f7-4a44-9e46-8c68cb5c37b8.mp3" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",      gender: "male",   accent: "American", age: "middle_aged", use_case: "narration", description: "Calm & collected — best for sensitive topics", category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d9f49a83-3c00-4c36-8af2-5e51f2a76dcb.mp3" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",       gender: "male",   accent: "American", age: "young", use_case: "narration",      description: "Energetic & upbeat — best for engagement",   category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/yoZ06aMxZJJ28mfd3POQ/e3b77265-0e87-4af2-a28c-d09e4a79defd.mp3" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",    gender: "male",   accent: "British",  age: "middle_aged", use_case: "narration", description: "Authoritative — best for enterprise clients", category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/16d6b294-ab8e-479c-9c7d-8ffe57a43c2c.mp3" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", accent: "British",  age: "young", use_case: "narration",      description: "Confident & clear — best for premium brands", category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/2da3f069-0b1e-41f0-aba4-8e26c4aadb96.mp3" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi",      gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Friendly & approachable — best for casual",  category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCO8z3wKNLl/2067df97-abb8-42e7-bc7b-cb65c28feeca.mp3" },
  { id: "t0jbNlBVZ17f02VDIeMI", name: "Glinda",    gender: "female", accent: "American", age: "middle_aged", use_case: "narration", description: "Warm & expressive — best for storytelling",   category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/t0jbNlBVZ17f02VDIeMI/f9c41f98-2906-4dde-a044-c25e7d4cee24.mp3" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy",   gender: "female", accent: "British",  age: "young", use_case: "children_stories", description: "Gentle & kind — best for warm conversations", category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/981f5a28-a14b-4048-8185-6e0c9a833042.mp3" },
  { id: "GBv7mTt0atIp3Br8iCZE", name: "Thomas",    gender: "male",   accent: "American", age: "young", use_case: "narration",      description: "Calm & clear — best for explanations",       category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/GBv7mTt0atIp3Br8iCZE/bfb23ed0-6ef6-4b02-b5b0-12dd4a1a9f12.mp3" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily",     gender: "female", accent: "American", age: "young", use_case: "narration",      description: "Calm & composed — best for professional calls", category: "premade", preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/LcfcDJNUP1GQjkzn1xUU/e8ee3d38-c940-4c1a-9929-a6a17be8b2ee.mp3" },
];

export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;

  // Try fetching from ElevenLabs API first
  if (key) {
    try {
      // Try v1/voices endpoint (works with basic keys)
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": key },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json() as {
          voices: Array<{
            voice_id: string;
            name: string;
            preview_url: string;
            labels?: { accent?: string; gender?: string; age?: string; use_case?: string; description?: string };
            category: string;
          }>
        };

        if (data.voices && data.voices.length > 0) {
          const voices = data.voices
            .map(v => ({
              id: v.voice_id,
              name: v.name,
              preview_url: v.preview_url || "",
              gender: v.labels?.gender || "unknown",
              accent: v.labels?.accent || "American",
              age: v.labels?.age || "",
              use_case: v.labels?.use_case || "",
              description: v.labels?.description || "",
              category: v.category || "premade",
            }))
            .sort((a, b) => {
              if (a.category === "premade" && b.category !== "premade") return -1;
              if (a.category !== "premade" && b.category === "premade") return 1;
              return a.name.localeCompare(b.name);
            });

          return NextResponse.json({ voices, source: "api" });
        }
      }
    } catch (err) {
      console.error("ElevenLabs API fetch failed, using fallback:", err);
    }
  }

  // Return fallback voices — always works, includes preview URLs
  return NextResponse.json({ voices: FALLBACK_VOICES, source: "fallback" });
}
