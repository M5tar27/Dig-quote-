"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addCertification, removeCertification } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Award, Loader2, Trash2, Upload, FileText } from "lucide-react";
import type { Certification, Company } from "@/lib/types";

function expiryStatus(cert: Certification): { label: string; className: string } | null {
  if (!cert.expires_at) return null;
  const daysLeft = Math.ceil((new Date(cert.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: "Expired", className: "border-transparent bg-destructive text-destructive-foreground" };
  if (daysLeft <= 60) return { label: `Expires in ${daysLeft}d`, className: "border-transparent bg-amber-500 text-white" };
  return { label: `Valid thru ${formatDate(cert.expires_at)}`, className: "border-transparent bg-success text-success-foreground" };
}

export function CertificationsForm({ company }: { company: Company }) {
  const supabase = createClient();
  const [certs, setCerts] = useState<Certification[]>(company.certifications || []);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Give the certification a title");
    if (!file) return toast.error("Attach the certificate file (PDF or image)");

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${company.id}/certifications/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("quotes").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);

      const newCert = await addCertification({
        title: title.trim(),
        issuer: issuer.trim() || null,
        cert_number: certNumber.trim() || null,
        completion_date: completionDate || null,
        expires_at: expiresAt || null,
        file_url: publicUrl.publicUrl,
      });

      setCerts((prev) => [...prev, newCert]);
      setTitle("");
      setIssuer("");
      setCertNumber("");
      setCompletionDate("");
      setExpiresAt("");
      setFile(null);
      toast.success("Certification added");
    } catch (err: any) {
      toast.error(err.message || "Failed to add certification");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(certId: string) {
    setRemovingId(certId);
    try {
      await removeCertification(certId);
      setCerts((prev) => prev.filter((c) => c.id !== certId));
      toast.success("Certification removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove certification");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Certifications
        </CardTitle>
        <CardDescription>
          Operator training and safety certifications. Shown as trust badges on the client-facing quote page and PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {certs.length > 0 && (
          <ul className="space-y-2">
            {certs.map((cert) => {
              const status = expiryStatus(cert);
              return (
                <li key={cert.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <a
                    href={cert.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-3"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{cert.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[cert.issuer, cert.cert_number ? `#${cert.cert_number}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </a>
                  <div className="flex shrink-0 items-center gap-2">
                    {status && <Badge className={status.className}>{status.label}</Badge>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={removingId === cert.id}
                      onClick={() => handleRemove(cert.id)}
                    >
                      {removingId === cert.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleAdd} className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="certTitle">Certification title</Label>
            <Input
              id="certTitle"
              placeholder="Excavator Online Training"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="certIssuer">Issuer</Label>
              <Input
                id="certIssuer"
                placeholder="360training / Hard Hat Training"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="certNumber">Certificate #</Label>
              <Input
                id="certNumber"
                placeholder="000039238345"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="certCompletion">Completion date</Label>
              <Input
                id="certCompletion"
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="certExpires">Expires (optional)</Label>
              <Input id="certExpires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="certFile">Certificate file (PDF or image)</Label>
            <Input
              id="certFile"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <Button type="submit" disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Add certification
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
