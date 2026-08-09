"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoUploader, type PendingPhoto } from "@/components/photo-uploader";
import { compressImages } from "@/lib/image";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import type { CompanyRates, JobType } from "@/lib/types";

const JOB_TYPES: JobType[] = ["Patio", "Driveway", "Trench", "Grading", "Pool Dig", "Demolition", "Other"];

const GENERATE_STEPS = [
  "Compressing photos...",
  "Uploading photos...",
  "Analyzing photos...",
  "Calculating materials...",
  "Building your quote...",
];

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

export function QuoteWizard({ companyId, rates }: { companyId: string; rates: CompanyRates }) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generateStepIndex, setGenerateStepIndex] = useState(0);

  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [jobType, setJobType] = useState<JobType>("Patio");
  const [notes, setNotes] = useState("");

  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  function step1Valid() {
    return clientName.trim().length > 0 && address.trim().length > 0 && phone.trim().length > 0;
  }

  function addPhotos(files: File[]) {
    const next: PendingPhoto[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...next]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleGenerate() {
    if (photos.length < MIN_PHOTOS) {
      toast.error(`Add at least ${MIN_PHOTOS} photos`);
      return;
    }

    setGenerating(true);
    setGenerateStepIndex(0);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      // 1. Create the draft quote row so we have an id for the storage path.
      const { data: quote, error: insertError } = await supabase
        .from("quotes")
        .insert({
          company_id: companyId,
          created_by: user.id,
          client_name: clientName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          client_email: clientEmail.trim() || null,
          job_type: jobType,
          notes: notes.trim() || null,
          status: "draft",
        })
        .select()
        .single();
      if (insertError || !quote) throw new Error(insertError?.message || "Could not create quote");

      // 2. Compress photos client-side before they ever hit the network — job-site
      // signal is often slow, and phone camera photos routinely run 3-8MB each.
      const compressedFiles = await compressImages(photos.map((p) => p.file), {
        maxDimension: 1600,
        quality: 0.82,
      });
      setGenerateStepIndex(1);

      // 3. Upload photos to Supabase Storage: {company_id}/{quote_id}/photo_N.ext
      const photoUrls: string[] = [];
      for (let i = 0; i < compressedFiles.length; i++) {
        const file = compressedFiles[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${companyId}/${quote.id}/photo_${i + 1}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("quotes").upload(path, file, {
          contentType: file.type,
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);
        photoUrls.push(publicUrl.publicUrl);
      }

      await supabase.from("quotes").update({ photos_urls: photoUrls }).eq("id", quote.id);
      setGenerateStepIndex(2);

      // 4. Call the AI estimation route.
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quote.id,
          photos_urls: photoUrls,
          job_type: jobType,
          notes,
          company_rates: rates,
        }),
      });
      setGenerateStepIndex(3);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "AI estimate failed");
      }
      setGenerateStepIndex(4);

      await new Promise((r) => setTimeout(r, 400));
      router.push(`/quotes/${quote.id}`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't generate the quote — try again");
      setGenerating(false);
    }
  }

  if (generating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-semibold">{GENERATE_STEPS[generateStepIndex]}</p>
          <Progress value={((generateStepIndex + 1) / GENERATE_STEPS.length) * 100} className="w-full max-w-xs" />
          <div className="mt-6 w-full space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(step / 3) * 100} className="flex-1" />
        <span className="text-sm font-medium text-muted-foreground">Step {step} of 3</span>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold">Job info</h2>
              <div className="space-y-2">
                <Label htmlFor="clientName">Client name *</Label>
                <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Karen Mitchell" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="4521 Maple Ridge Dr, Westerville, OH" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(614) 555-0142" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email (optional)</Label>
                  <Input id="clientEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="karen@email.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobType">Job type</Label>
                <Select value={jobType} onValueChange={(v) => setJobType(v as JobType)}>
                  <SelectTrigger id="jobType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map((jt) => (
                      <SelectItem key={jt} value={jt}>
                        {jt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Remove tree, haul off dirt, 12in dig"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-bold">Upload photos</h2>
              <PhotoUploader photos={photos} onAdd={addPhotos} onRemove={removePhoto} min={MIN_PHOTOS} max={MAX_PHOTOS} />
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-bold">Ready to generate</h2>
              <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                <p>
                  <span className="font-semibold">{clientName}</span> — {address}
                </p>
                <p className="text-muted-foreground">{jobType}{notes ? ` · ${notes}` : ""}</p>
                <p className="text-muted-foreground">{photos.length} photos attached</p>
              </div>
              <p className="text-sm text-muted-foreground">
                We'll analyze your photos with AI, calculate materials and labor, and build a
                priced PDF quote — usually in about 60 seconds.
              </p>
              <Button size="lg" className="w-full" onClick={handleGenerate}>
                Generate Quote — 60sec
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {step > 1 && (
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-5 w-5" />
            Back
          </Button>
        )}
        {step < 3 && (
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              if (step === 1 && !step1Valid()) {
                toast.error("Client name, address, and phone are required");
                return;
              }
              if (step === 2 && photos.length < MIN_PHOTOS) {
                toast.error(`Add at least ${MIN_PHOTOS} photos`);
                return;
              }
              setStep(step + 1);
            }}
          >
            Next
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
