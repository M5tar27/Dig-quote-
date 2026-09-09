import OpenAI from "openai";
import { AiEstimate } from "./types";

let _openai: OpenAI | null = null;

/** Lazily instantiated — see lib/stripe.ts for why. */
function getOpenAiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-placeholder" });
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are a 20yr excavation estimator in Ohio. From these site photos, estimate:
{sqft, avg_depth_inches, cubic_yards_to_remove, tons_gravel_needed, tons_sand_needed,
labor_hours_excavator, labor_hours_handwork, equipment_days}.
Rules: Be conservative. If unsure, estimate high. Account for overdig 10%.
Also include a "confidence_1to10" integer (how confident you are in these numbers from the
photos alone) and a short "notes" string (1-2 sentences) calling out anything the contractor
should verify on-site.
Return ONLY JSON, no text, matching exactly this shape:
{"sqft":number,"avg_depth_inches":number,"cubic_yards_to_remove":number,"tons_gravel_needed":number,
"tons_sand_needed":number,"labor_hours_excavator":number,"labor_hours_handwork":number,
"equipment_days":number,"confidence_1to10":number,"notes":string}`;

/**
 * Voice Memo feature — see lib/voice.ts for the paywall/eligibility logic and
 * app/api/voice/process/route.ts for how these two calls chain together.
 * Kept in this file (not a separate client) so both OpenAI call sites share
 * the same lazily-instantiated client and the same "fails closed with a
 * message, never throws past the caller" convention as estimateFromPhotos.
 */

const VOICE_PARSE_SYSTEM_PROMPT = `You are an excavation quote parser for an Ohio contractor speaking a job
description out loud, often in noisy/rushed field conditions and casual phrasing (e.g. "60 by 40, couple feet
deep, clay, tight 8 foot gate, haul it 50 foot, 3 loads"). Extract whatever the contractor actually said —
never invent a number that wasn't stated or clearly implied.
Return ONLY JSON, no other text, matching exactly this shape (use null for anything not mentioned):
{"length":number|null,"width":number|null,"depth_inches":number|null,
"soil_type":"clay"|"loam"|"sand"|"rock"|null,"access_ft":number|null,"haul_ft":number|null,
"loads":number|null,"customer_name":string|null,"address":string|null,"timeline":string|null,
"extra_notes":string|null}
Rules: length/width are in feet. If depth is given in feet, convert to inches. "loads" is a count of truck
loads if mentioned. extra_notes should capture anything said that doesn't fit another field (e.g. "customer
wants a French drain along the back edge").`;

export interface ParsedVoiceFields {
  length: number | null;
  width: number | null;
  depth_inches: number | null;
  soil_type: "clay" | "loam" | "sand" | "rock" | null;
  access_ft: number | null;
  haul_ft: number | null;
  loads: number | null;
  customer_name: string | null;
  address: string | null;
  timeline: string | null;
  extra_notes: string | null;
}

/** Transcribes a recorded voice memo (fetched from its Supabase Storage URL) via Whisper. */
export async function transcribeVoiceMemo(
  audioUrl: string
): Promise<{ transcript: string | null; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { transcript: null, error: "OPENAI_API_KEY is not configured." };
  }
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return { transcript: null, error: `Couldn't fetch the recording (${audioRes.status}).` };
    }
    const blob = await audioRes.blob();
    // Whisper picks the format up from the filename extension — the browser
    // recorder (components/voice-bid-button.tsx) records webm/opus.
    const file = new File([blob], "memo.webm", { type: blob.type || "audio/webm" });

    const transcription = await getOpenAiClient().audio.transcriptions.create({
      file,
      model: "whisper-1",
    });

    return { transcript: transcription.text };
  } catch (err: any) {
    return { transcript: null, error: err?.message || "Transcription failed" };
  }
}

/** Parses a raw transcript into structured job fields via GPT-4o. */
export async function parseVoiceTranscript(
  transcript: string
): Promise<{ fields: ParsedVoiceFields | null; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { fields: null, error: "OPENAI_API_KEY is not configured." };
  }
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VOICE_PARSE_SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const fields: ParsedVoiceFields = {
      length: numOrNull(parsed.length),
      width: numOrNull(parsed.width),
      depth_inches: numOrNull(parsed.depth_inches),
      soil_type: ["clay", "loam", "sand", "rock"].includes(parsed.soil_type) ? parsed.soil_type : null,
      access_ft: numOrNull(parsed.access_ft),
      haul_ft: numOrNull(parsed.haul_ft),
      loads: numOrNull(parsed.loads),
      customer_name: parsed.customer_name || null,
      address: parsed.address || null,
      timeline: parsed.timeline || null,
      extra_notes: parsed.extra_notes || null,
    };

    return { fields };
  } catch (err: any) {
    return { fields: null, error: err?.message || "Couldn't parse that recording" };
  }
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || Number.isNaN(n) ? null : n;
}

export async function estimateFromPhotos(opts: {
  photoUrls: string[];
  jobType: string;
  notes: string;
}): Promise<{ estimate: AiEstimate | null; raw: string; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { estimate: null, raw: "", error: "OPENAI_API_KEY is not configured." };
  }

  const userText = `Job type: ${opts.jobType}. Notes: ${opts.notes || "none provided"}.`;

  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...opts.photoUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);

    const estimate: AiEstimate = {
      sqft: Number(parsed.sqft) || 0,
      avg_depth_inches: Number(parsed.avg_depth_inches) || 0,
      cubic_yards_to_remove: Number(parsed.cubic_yards_to_remove) || 0,
      tons_gravel_needed: Number(parsed.tons_gravel_needed) || 0,
      tons_sand_needed: Number(parsed.tons_sand_needed) || 0,
      labor_hours_excavator: Number(parsed.labor_hours_excavator) || 0,
      labor_hours_handwork: Number(parsed.labor_hours_handwork) || 0,
      equipment_days: Number(parsed.equipment_days) || 1,
      confidence_1to10: Number(parsed.confidence_1to10) || 5,
      notes: String(parsed.notes || ""),
    };

    return { estimate, raw };
  } catch (err: any) {
    return { estimate: null, raw: "", error: err?.message || "OpenAI request failed" };
  }
}
