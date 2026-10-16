"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { blobatarUri } from "blobatar/uri";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { loginPathFor } from "@/lib/auth-routing";
import type { UserData } from "@/types/userData";
import { ProfileAvatar } from "./profile-avatar";
import { PlayerAvatar } from "@/components/game/players/player-avatar";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type UploadResponse = {
  status: string;
  username: string;
  filename: string;
  size_bytes: number | null;
};

async function generatedAvatarFile(seed: string): Promise<File> {
  const image = new Image();
  image.src = blobatarUri(seed, { size: 512, background: false });
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser cannot prepare the generated avatar.");
  context.drawImage(image, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The generated avatar could not be prepared.");
  return new File([blob], "generated-avatar.png", { type: "image/png" });
}

export function EditProfileDialog({
  open,
  onOpenChange,
  user,
  authReturnPath = "/profile",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserData;
  authReturnPath?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"generated" | "upload">("generated");
  const generatedSeeds = Array.from(
    { length: 10 },
    (_, index) => `trivia-trap:${user.id}:${index + 1}`,
  );
  const [selectedSeed, setSelectedSeed] = useState(generatedSeeds[0]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function resetSelection() {
    setFile(null);
    setPreviewUrl(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && !uploading) resetSelection();
    if (!uploading) onOpenChange(nextOpen);
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!ACCEPTED_AVATAR_TYPES.has(selected.type)) {
      resetSelection();
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (selected.size > MAX_AVATAR_BYTES) {
      resetSelection();
      setMessage("The image must be 5 MB or smaller.");
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((mode === "upload" && !file) || uploading) return;
    setUploading(true);
    setMessage(null);

    try {
      const avatarFile =
        mode === "generated" ? await generatedAvatarFile(selectedSeed) : file;
      if (!avatarFile) return;
      const form = new FormData();
      form.append("username", user.username);
      form.append("file", avatarFile);
      const response = await apiFetch("/users/me/upload", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as
        | UploadResponse
        | { detail?: string }
        | null;
      if (response.status === 401) {
        router.replace(loginPathFor(authReturnPath));
        return;
      }
      if (!response.ok) {
        throw new Error(
          body && "detail" in body && body.detail
            ? body.detail
            : "Avatar upload failed. Please try again.",
        );
      }
      setMessage(
        mode === "generated"
          ? "Generated avatar saved successfully."
          : "Avatar uploaded successfully.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Avatar upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-lg p-5 sm:p-7" aria-busy={uploading}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-secondary text-xl uppercase">
              Update avatar
            </DialogTitle>
            <DialogDescription>
              Choose a stable generated avatar or upload a custom image.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-4">
            <div
              className="grid grid-cols-2 gap-2"
              role="tablist"
              aria-label="Avatar source"
            >
              <Button
                type="button"
                variant={mode === "generated" ? "secondary" : "surface"}
                onClick={() => {
                  setMode("generated");
                  setMessage(null);
                }}
              >
                Generated
              </Button>
              <Button
                type="button"
                variant={mode === "upload" ? "secondary" : "surface"}
                onClick={() => {
                  setMode("upload");
                  setMessage(null);
                }}
              >
                Upload image
              </Button>
            </div>
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/15 p-4 text-center sm:flex-row sm:text-left">
              <ProfileAvatar
                name={mode === "generated" ? selectedSeed : user.username}
                imageUrl={
                  mode === "upload" ? (previewUrl ?? user.avatar) : null
                }
                size={96}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Avatar preview</p>
                <p className="mt-1 break-all text-xs text-[#85858f]">
                  {mode === "generated"
                    ? "Blobatar v2 generates this avatar deterministically from its selected seed."
                    : file
                      ? file.name
                      : "Select an image to preview it before uploading."}
                </p>
                {message && (
                  <p
                    className="mt-2 text-xs font-semibold text-[#d8d8dd]"
                    role="status"
                    aria-live="polite"
                  >
                    {message}
                  </p>
                )}
              </div>
            </div>
            {mode === "generated" ? (
              <div
                className="grid grid-cols-3 gap-3 sm:grid-cols-6"
                aria-label="Generated avatar choices"
              >
                {generatedSeeds.map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    disabled={uploading}
                    aria-label="Select generated avatar"
                    aria-pressed={selectedSeed === seed}
                    onClick={() => setSelectedSeed(seed)}
                    className={cn(
                      "rounded-2xl p-2 transition",
                      selectedSeed === seed
                        ? "bg-primary/15 ring-2 ring-primary"
                        : "bg-black/15 ring-1 ring-white/10 hover:ring-white/30",
                    )}
                  >
                    <PlayerAvatar name={seed} size={48} animated={false} />
                  </button>
                ))}
              </div>
            ) : (
              <Button
                asChild
                variant="surface"
                className="w-full"
                aria-disabled={uploading}
              >
                <label
                  className={
                    uploading ? "pointer-events-none" : "cursor-pointer"
                  }
                >
                  <Upload className="size-4" /> Choose JPEG, PNG, or WebP
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={selectImage}
                    disabled={uploading}
                    className="sr-only"
                  />
                </label>
              </Button>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={uploading}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={(mode === "upload" && !file) || uploading}
            >
              {uploading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> Saving
                </>
              ) : mode === "generated" ? (
                "Use generated avatar"
              ) : (
                "Upload avatar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
