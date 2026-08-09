"use client";

import { useRef } from "react";
import { Camera, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export function PhotoUploader({
  photos,
  onAdd,
  onRemove,
  min = 3,
  max = 6,
}: {
  photos: PendingPhoto[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  min?: number;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = Math.max(0, max - photos.length);
    onAdd(files.slice(0, room));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Take <strong>1 wide shot, 2 close shots, 1 with a tape measure</strong> for the most
          accurate estimate.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="Site photo" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="tap-target flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input text-muted-foreground hover:bg-accent"
          >
            <Camera className="h-7 w-7" />
            <span className="text-xs font-medium">Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      <p className="text-sm text-muted-foreground">
        {photos.length} of {max} photos ({min} minimum)
      </p>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => inputRef.current?.click()}>
        <Camera className="h-5 w-5" />
        {photos.length === 0 ? "Take or choose photos" : "Add another photo"}
      </Button>
    </div>
  );
}
