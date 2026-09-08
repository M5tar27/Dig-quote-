"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mic, Square, Loader2, FileText, ClipboardList, Lock } from "lucide-react";
import type { CompanyPlan, JobType } from "@/lib/types";
import type { ParsedVoiceFields } from "@/lib/openai";

const JOB_TYPES: JobType[] = ["Patio", "Driveway", "Trench", "Grading", "Pool Dig", "Demolition", "Other"];

type VoiceType = "bid" | "change_order" | "crew_note";
type Stage = "idle" | "recording" | "processing" | "bid_preview" | "co_preview";

interface ProcessResponse {
  voice_memo_id?: string;
  transcript?: string;
  fields?: ParsedVoiceFields;
  missing_fields?: string[];
  estimate?: { total: number } | null;
  remaining?: number | null;
  crew_note_id?: string;
  error?: string;
}

const FIELD_LABELS: Record<keyof ParsedVoiceFields, string> = {
  length: "Length (ft)",
  width: "Width (ft)",
  depth_inches: "Depth (in)",
  soil_type: "Soil type",
  access_ft: "Access width (ft)",
  haul_ft: "Haul distance (ft)",
  loads: "Truck loads",
  customer_name: "Customer name",
  address: "Address",
  timeline: "Timeline",
  extra_notes: "Notes",
};

/**
 * Voice Memo feature — one tap-to-talk mic button that replaces typing a bid for
 * contractors who'd rather speak the job in ("60 by 40, 2 feet deep, clay, tight
 * 8 foot gate, haul 50 foot, 3 loads"). Handles ALL paywall logic internally per
 * plan: Free shows a locked button that always upsells, Starter gets one mic
 * button with a remaining-credits counter, Pro gets three (New Bid / Change
 * Order / Crew Note). See lib/voice.ts for the server-side eligibility rules
 * this mirrors, and app/api/voice/process + /confirm for the two-step
 * transcribe-then-confirm flow.
 */
export function VoiceBidButton({
  tier,
  companyId,
  quoteId,
}: {
  tier: CompanyPlan;
  companyId: string;
  /** When set, a Change Order / Crew Note recorded here gets linked to this quote. */
  quoteId?: string;
  /** Initial "N left this month" count for Starter — refreshed locally after each bid. */
  voiceRemaining?: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("idle");
  const [activeType, setActiveType] = useState<VoiceType>("bid");
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined);

  const [voiceMemoId, setVoiceMemoId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [fields, setFields] = useState<ParsedVoiceFields | null>(null);
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [jobType, setJobType] = useState<JobType>("Other");
  const [coPrice, setCoPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const locked = tier === "free";
  const isPro = tier === "pro";

  function resetPreview() {
    setStage("idle");
    setVoiceMemoId(null);
    setTranscript("");
    setMissing([]);
    setFields(null);
    setClientName("");
    setAddress("");
    setPhone("");
    setCoPrice("");
  }

  async function startRecording(type: VoiceType) {
    if (locked) {
      setUpsellOpen(true);
      return;
    }
    if (type !== "bid" && !isPro) {
      toast.error(
        type === "change_order"
          ? "Voice change orders are a Pro feature. Upgrade to Pro to unlock them."
          : "Voice crew notes are a Pro feature. Upgrade to Pro to unlock them."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void handleRecordingComplete(type, new Blob(chunksRef.current, { type: mimeType }));
      };

      mediaRecorderRef.current = recorder;
      setActiveType(type);
      recorder.start();
      setStage("recording");
    } catch {
      toast.error("Couldn't access the microphone — check your browser's permission for this site.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function handleRecordingComplete(type: VoiceType, blob: Blob) {
    setStage("processing");
    try {
      const path = `${companyId}/voice/${type}_${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("quotes").upload(path, blob, {
        contentType: blob.type,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);

      const res = await fetch("/api/voice/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: publicUrl.publicUrl, type, quote_id: quoteId }),
      });
      const body: ProcessResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          setUpsellOpen(true);
          setStage("idle");
          return;
        }
        throw new Error(body.error || "Couldn't process that recording");
      }

      if (type === "crew_note") {
        toast.success("Crew note saved to Form Vault.");
        resetPreview();
        router.refresh();
        return;
      }

      setVoiceMemoId(body.voice_memo_id || null);
      setTranscript(body.transcript || "");
      setFields(body.fields || null);
      setMissing(body.missing_fields || []);
      if (typeof body.remaining === "number" || body.remaining === null) setRemaining(body.remaining);
      if (body.fields?.customer_name) setClientName(body.fields.customer_name);
      if (body.fields?.address) setAddress(body.fields.address);

      setStage(type === "bid" ? "bid_preview" : "co_preview");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong processing that recording");
      setStage("idle");
    }
  }

  function updateField<K extends keyof ParsedVoiceFields>(key: K, value: ParsedVoiceFields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function confirmBid() {
    if (!fields) return;
    if (!clientName.trim() || !address.trim() || !phone.trim()) {
      toast.error("Client name, address, and phone are required");
      return;
    }
    const stillMissing = (["length", "width", "depth_inches"] as const).filter(
      (k) => fields[k] === null || fields[k] === undefined
    );
    if (stillMissing.length > 0) {
      toast.error(`Fill in: ${stillMissing.map((k) => FIELD_LABELS[k]).join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/voice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "bid",
          voice_memo_id: voiceMemoId,
          client_name: clientName,
          address,
          phone,
          job_type: jobType,
          fields,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't generate the quote");

      if (remaining !== undefined && remaining !== null) setRemaining((r) => (r ?? 1) - 1);
      toast.success("Quote generated");
      resetPreview();
      router.push(`/quotes/${body.quote_id}`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't generate the quote");
    } finally {
      setSaving(false);
    }
  }

  async function confirmChangeOrder() {
    const price = Number(coPrice);
    if (!price || price <= 0) {
      toast.error("Enter a price for this change order");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/voice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "change_order",
          voice_memo_id: voiceMemoId,
          quote_id: quoteId,
          description: transcript,
          price,
          customer_name: clientName || fields?.customer_name || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't create the change order");

      toast.success("Change order created — customer signature link ready.");
      resetPreview();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't create the change order");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Preview screens
  // ---------------------------------------------------------------------
  if (stage === "bid_preview" && fields) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        {missing.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Heard: &ldquo;{transcript}&rdquo;</p>
            <p className="mt-1">
              We missed measurements — tap to add: {missing.join("? ")}
              {missing.length ? "?" : ""}
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Heard: &ldquo;{transcript}&rdquo;</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(["length", "width", "depth_inches", "access_ft", "haul_ft", "loads"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key} className={missing.includes(FIELD_LABELS[key]) ? "text-amber-700" : ""}>
                {FIELD_LABELS[key]}
              </Label>
              <Input
                id={key}
                type="number"
                value={fields[key] ?? ""}
                onChange={(e) => updateField(key, e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="soil_type">Soil type</Label>
            <select
              id="soil_type"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={fields.soil_type ?? ""}
              onChange={(e) => updateField("soil_type", (e.target.value || null) as ParsedVoiceFields["soil_type"])}
            >
              <option value="">—</option>
              <option value="clay">Clay</option>
              <option value="loam">Loam</option>
              <option value="sand">Sand</option>
              <option value="rock">Rock</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="clientName">Client name *</Label>
            <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="address">Address *</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jobType">Job type</Label>
          <select
            id="jobType"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={jobType}
            onChange={(e) => setJobType(e.target.value as JobType)}
          >
            {JOB_TYPES.map((jt) => (
              <option key={jt} value={jt}>
                {jt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={resetPreview} className="flex-1">
            Cancel
          </Button>
          <Button onClick={confirmBid} disabled={saving} className="flex-1 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate Quote
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "co_preview") {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Heard: &ldquo;{transcript}&rdquo;</p>
        <div className="space-y-1">
          <Label htmlFor="coDescription">Change order description</Label>
          <Textarea id="coDescription" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="coCustomer">Customer name</Label>
            <Input id="coCustomer" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coPrice">Additional cost *</Label>
            <Input id="coPrice" type="number" value={coPrice} onChange={(e) => setCoPrice(e.target.value)} placeholder="450" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetPreview} className="flex-1">
            Cancel
          </Button>
          <Button onClick={confirmChangeOrder} disabled={saving} className="flex-1 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Change Order
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Mic button(s)
  // ---------------------------------------------------------------------
  const isRecording = stage === "recording";
  const isProcessing = stage === "processing";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6">
        <MicButton
          label="New Bid"
          locked={locked}
          recording={isRecording && activeType === "bid"}
          processing={isProcessing && activeType === "bid"}
          disabled={(isRecording || isProcessing) && activeType !== "bid"}
          onTap={() => (isRecording && activeType === "bid" ? stopRecording() : startRecording("bid"))}
        />
        {isPro ? (
          <>
            <SmallVoiceButton
              icon={<FileText className="h-5 w-5" />}
              label="Change Order"
              recording={isRecording && activeType === "change_order"}
              processing={isProcessing && activeType === "change_order"}
              disabled={(isRecording || isProcessing) && activeType !== "change_order"}
              onTap={() =>
                isRecording && activeType === "change_order" ? stopRecording() : startRecording("change_order")
              }
            />
            <SmallVoiceButton
              icon={<ClipboardList className="h-5 w-5" />}
              label="Crew Note"
              recording={isRecording && activeType === "crew_note"}
              processing={isProcessing && activeType === "crew_note"}
              disabled={(isRecording || isProcessing) && activeType !== "crew_note"}
              onTap={() => (isRecording && activeType === "crew_note" ? stopRecording() : startRecording("crew_note"))}
            />
          </>
        ) : null}
      </div>

      {locked ? (
        <p className="text-xs font-medium text-muted-foreground">Talk your bids — no typing (Starter+)</p>
      ) : tier === "starter" ? (
        <p className="text-xs font-medium text-muted-foreground">
          {remaining === undefined ? "Voice bids included this month" : `${remaining}/30 voice bids left`}
        </p>
      ) : null}

      {isProcessing ? <p className="text-sm font-medium text-primary">Building your quote...</p> : null}

      <Dialog open={upsellOpen} onOpenChange={setUpsellOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Talk your bids — no typing</DialogTitle>
            <DialogDescription>
              Upgrade to Starter $49/mo to unlock voice bids — tap the mic, say the job, get a priced
              quote in under a minute.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpsellOpen(false)}>
              Not now
            </Button>
            <Button onClick={() => router.push("/pricing?paywall=voice")}>Upgrade to Starter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MicButton({
  label,
  locked,
  recording,
  processing,
  disabled,
  onTap,
}: {
  label: string;
  locked: boolean;
  recording: boolean;
  processing: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={locked ? `${label} (locked, Starter plan required)` : recording ? "Stop recording" : label}
        disabled={disabled || processing}
        onClick={onTap}
        className={[
          "flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-lg transition-transform active:scale-95 disabled:opacity-50",
          locked
            ? "border-muted-foreground/30 bg-muted text-muted-foreground"
            : recording
              ? "animate-pulse border-red-700 bg-red-600 text-white"
              : "border-yellow-600 bg-yellow-400 text-black hover:bg-yellow-300",
        ].join(" ")}
      >
        {processing ? (
          <Loader2 className="h-9 w-9 animate-spin" />
        ) : locked ? (
          <Lock className="h-9 w-9" />
        ) : recording ? (
          <Square className="h-8 w-8" fill="currentColor" />
        ) : (
          <Mic className="h-9 w-9" />
        )}
      </button>
      <span className="text-xs font-semibold">{recording ? "Tap to stop" : label}</span>
    </div>
  );
}

function SmallVoiceButton({
  icon,
  label,
  recording,
  processing,
  disabled,
  onTap,
}: {
  icon: React.ReactNode;
  label: string;
  recording: boolean;
  processing: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={recording ? `Stop ${label} recording` : label}
        disabled={disabled || processing}
        onClick={onTap}
        className={[
          "flex h-14 w-14 items-center justify-center rounded-full border-2 shadow transition-transform active:scale-95 disabled:opacity-50",
          recording ? "animate-pulse border-red-700 bg-red-600 text-white" : "border-neutral-400 bg-white text-neutral-700 hover:bg-neutral-50",
        ].join(" ")}
      >
        {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : recording ? <Square className="h-4 w-4" fill="currentColor" /> : icon}
      </button>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
