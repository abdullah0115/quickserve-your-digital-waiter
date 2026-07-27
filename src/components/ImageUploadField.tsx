import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadMenuImage, deleteMenuImage } from "@/lib/uploadMenuImage";

interface ImageUploadFieldProps {
  businessId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  aspect?: string; // Tailwind aspect-* class, e.g. "aspect-4/3" (default) or "aspect-square"
  // Small fixed-size square thumbnail with icon-only actions, for a dense
  // list row (e.g. one per line in the scan-review list) instead of the
  // full-size 220px field used in item/cover-photo forms.
  compact?: boolean;
}

// Replaces the old "paste an already-hosted URL" text field everywhere a
// photo is needed (menu items, business cover) with a real upload straight
// from the phone's camera or gallery — see
// supabase/migrations/20260727010000_menu_images_storage.sql for the
// storage bucket this uploads into.
export function ImageUploadField({ businessId, value, onChange, aspect = "aspect-4/3", compact = false }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadMenuImage(businessId, file);
      const previous = value;
      onChange(url);
      if (previous) deleteMenuImage(previous);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const remove = () => {
    deleteMenuImage(value);
    onChange(null);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
      {value ? (
        <div className={compact
          ? "relative rounded-md overflow-hidden border w-14 h-14 shrink-0"
          : `relative rounded-lg overflow-hidden border ${aspect} w-full max-w-55`
        }>
          <img src={value} alt="" className="w-full h-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className={compact ? "w-3.5 h-3.5 animate-spin text-white" : "w-5 h-5 animate-spin text-white"} />
            </div>
          )}
          {compact ? (
            <div className="absolute inset-x-0 bottom-0 flex">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex-1 bg-black/60 text-white text-[9px] py-0.5 hover:bg-black/75">
                Change
              </button>
              <button type="button" onClick={remove} disabled={uploading} className="bg-black/60 text-white px-1 hover:bg-black/75">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <div className="absolute bottom-1.5 right-1.5 flex gap-1">
              <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => inputRef.current?.click()} disabled={uploading}>
                Change
              </Button>
              <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={remove} disabled={uploading}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={compact
            ? "w-14 h-14 shrink-0 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition disabled:opacity-60"
            : `w-full max-w-55 ${aspect} border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-accent hover:text-accent transition disabled:opacity-60`
          }
        >
          {uploading ? <Loader2 className={compact ? "w-4 h-4 animate-spin" : "w-5 h-5 animate-spin"} /> : <Camera className={compact ? "w-4 h-4" : "w-5 h-5"} />}
          {!compact && <span className="text-xs">{uploading ? "Uploading…" : "Add photo"}</span>}
        </button>
      )}
    </div>
  );
}
