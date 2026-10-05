import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, Trash2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resizeImageToDataUrl } from "./resizeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

interface Category {
  id: string;
  name: string;
}

interface ScannedRow {
  tempId: string;
  name: string;
  price: string;
  category: string;
  include: boolean;
  // A physical paper menu has no photos to extract — this is where an
  // owner can attach a real one per item before it's saved, instead of
  // every scanned item landing with no image at all.
  imageUrl: string | null;
}

interface ScanMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  categories: Category[];
  categoryCount: number;
  onImported: () => void;
  onManualFallback: () => void;
}

type Step = "upload" | "scanning" | "review" | "empty" | "error";

const FALLBACK_ERROR = "Scan is not available right now, please try again later.";

async function parseFunctionError(error: unknown): Promise<{ message: string; usage?: { used: number; limit: number } }> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      const usage = typeof body?.scans_used === "number" && typeof body?.scans_limit === "number"
        ? { used: body.scans_used, limit: body.scans_limit }
        : undefined;
      if (typeof body?.error === "string") return { message: body.error, usage };
    } catch {
    }
  }
  return { message: FALLBACK_ERROR };
}

export function ScanMenuDialog({
  open,
  onOpenChange,
  businessId,
  categories,
  categoryCount,
  onImported,
  onManualFallback,
}: ScanMenuDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show "X of 20 scans used this month" up front, so the owner knows the
  // cap exists before they try — a plain read, doesn't spend a scan.
  useEffect(() => {
    if (!open) return;
    supabase.rpc("get_scan_usage", { p_business_id: businessId }).maybeSingle().then(({ data }) => {
      // Older deployments returned NULL for paid plans to mean "unlimited".
      // Never let that value be coerced to zero by a numeric comparison and
      // accidentally disable the scanner before the monthly-quota migration
      // has reached the database.
      if (typeof data?.scans_used === "number" && typeof data.scans_limit === "number") {
        setUsage({ used: data.scans_used, limit: data.scans_limit });
      } else {
        setUsage(null);
      }
    });
  }, [open, businessId]);

  const reset = () => {
    setStep("upload");
    setErrorMsg("");
    setRows([]);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (file: File) => {
    setStep("scanning");
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const { data, error } = await supabase.functions.invoke("scan-menu", {
        body: { business_id: businessId, image: dataUrl },
      });
      if (error) {
        const { message, usage: errUsage } = await parseFunctionError(error);
        if (errUsage) setUsage(errUsage);
        throw new Error(message);
      }
      if (data?.error) {
        if (typeof data.scans_used === "number" && typeof data.scans_limit === "number") {
          setUsage({ used: data.scans_used, limit: data.scans_limit });
        }
        throw new Error(data.error);
      }

      if (typeof data?.data?.scans_used === "number" && typeof data?.data?.scans_limit === "number") {
        setUsage({ used: data.data.scans_used, limit: data.data.scans_limit });
      }

      const items = (data?.data?.items ?? []) as Array<{ name: string; price: number; category: string | null }>;
      if (items.length === 0) {
        setStep("empty");
        return;
      }
      setRows(
        items.map((it, i) => ({
          tempId: `${Date.now()}-${i}`,
          name: it.name,
          price: String(it.price),
          category: it.category ?? "",
          include: true,
          imageUrl: null,
        })),
      );
      setStep("review");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : FALLBACK_ERROR);
      setStep("error");
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const updateRow = (tempId: string, patch: Partial<ScannedRow>) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  };
  const removeRow = (tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const confirmImport = async () => {
    const included = rows.filter((r) => r.include && r.name.trim() && r.price.trim() !== "" && !Number.isNaN(Number(r.price)) && Number(r.price) >= 0);
    if (included.length === 0) {
      toast.error("Select at least one valid item to add");
      return;
    }
    setSaving(true);
    try {
      const categoryIdByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const newCategoryNames = [
        ...new Set(
          included
            .map((r) => r.category.trim())
            .filter((name) => name && !categoryIdByName.has(name.toLowerCase())),
        ),
      ];

      if (newCategoryNames.length > 0) {
        const { data: createdCats, error: catErr } = await supabase
          .from("menu_categories")
          .insert(newCategoryNames.map((name, i) => ({ business_id: businessId, name, display_order: categoryCount + i })))
          .select("id, name");
        if (catErr) throw catErr;
        createdCats?.forEach((c) => categoryIdByName.set(c.name.trim().toLowerCase(), c.id));
      }

      const payload = included.map((r) => ({
        business_id: businessId,
        name: r.name.trim().slice(0, 100),
        price: Number(r.price),
        category_id: r.category.trim() ? categoryIdByName.get(r.category.trim().toLowerCase()) ?? null : null,
        image_url: r.imageUrl,
      }));

      const { error: insErr } = await supabase.from("menu_items").insert(payload);
      if (insErr) throw insErr;

      toast.success(`${payload.length} item${payload.length > 1 ? "s" : ""} added from scan`);
      onImported();
      handleOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the scanned items");
    } finally {
      setSaving(false);
    }
  };

  const includedCount = rows.filter((r) => r.include).length;
  const hasReachedScanLimit = usage !== null && usage.used >= usage.limit;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" /> Scan Menu</DialogTitle>
          <DialogDescription>
            Upload a photo of your existing menu — we'll pull out the items, then you review before anything's saved.
          </DialogDescription>
        </DialogHeader>

        {usage && (
          <p className="text-xs text-muted-foreground text-center">
            {usage.used} of {usage.limit} menu scans used this month · {Math.max(usage.limit - usage.used, 0)} remaining
          </p>
        )}

        {step === "upload" && (
          <div className="space-y-4">
            {hasReachedScanLimit ? (
              <Alert>
                <TriangleAlert className="w-4 h-4" />
                <AlertDescription>
                  You've used all {usage.limit} menu scans included in your plan this month. Try again next month, or add items manually.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 text-muted-foreground hover:border-accent hover:text-accent transition"
                >
                  <Camera className="w-10 h-10" />
                  <div className="text-sm font-medium">Tap to take a photo or upload an image</div>
                  <div className="text-xs">A clear, well-lit photo of your menu works best</div>
                </button>
              </>
            )}
            <Button variant="ghost" className="w-full" onClick={() => { onManualFallback(); handleOpenChange(false); }}>
              I'll add items manually instead
            </Button>
          </div>
        )}

        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">Reading your menu…</p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <TriangleAlert className="w-4 h-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              {!hasReachedScanLimit && (
                <Button variant="outline" className="flex-1" onClick={reset}>Try again</Button>
              )}
              <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => { onManualFallback(); handleOpenChange(false); }}>
                Add manually instead
              </Button>
            </div>
          </div>
        )}

        {step === "empty" && (
          <div className="space-y-4">
            <Alert>
              <TriangleAlert className="w-4 h-4" />
              <AlertDescription>Couldn't confidently read any items from that photo. Try a clearer, well-lit shot, or add items by hand.</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Try another photo</Button>
              <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => { onManualFallback(); handleOpenChange(false); }}>
                Add manually instead
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Found {rows.length} item{rows.length > 1 ? "s" : ""}. Review, edit, or uncheck anything before adding — the photo icon lets you attach a real picture, since there's none on a paper menu to scan.
            </p>
            <ScrollArea className="max-h-[45vh] pr-2">
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.tempId} className="flex items-start gap-2 p-2.5 rounded-lg border">
                    <Checkbox className="mt-2.5" checked={r.include} onCheckedChange={(c) => updateRow(r.tempId, { include: !!c })} />
                    <ImageUploadField
                      compact
                      businessId={businessId}
                      value={r.imageUrl}
                      onChange={(url) => updateRow(r.tempId, { imageUrl: url })}
                    />
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-1.5">
                      <Input className="col-span-2 h-8 text-sm" value={r.name} onChange={(e) => updateRow(r.tempId, { name: e.target.value })} placeholder="Item name" />
                      <Input className="h-8 text-sm" type="number" value={r.price} onChange={(e) => updateRow(r.tempId, { price: e.target.value })} placeholder="Price" />
                      <Input className="h-8 text-sm" value={r.category} onChange={(e) => updateRow(r.tempId, { category: e.target.value })} placeholder="Category (optional)" list="scan-menu-categories" />
                    </div>
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => removeRow(r.tempId)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">All items removed.</p>}
              </div>
            </ScrollArea>
            <datalist id="scan-menu-categories">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
            <Button className="w-full bg-primary text-primary-foreground" disabled={saving || includedCount === 0} onClick={confirmImport}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add {includedCount || ""} item{includedCount === 1 ? "" : "s"} to menu
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
