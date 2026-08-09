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
