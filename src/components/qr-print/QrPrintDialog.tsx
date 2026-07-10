import { useRef, useState } from "react";
import { toPng, toJpeg } from "html-to-image";
import jsPDF from "jspdf";
import { FileImage, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  QrPrintCard,
  QR_PRINT_CARD_WIDTH,
  QR_PRINT_CARD_HEIGHT,
  TEMPLATE_LABELS,
  type QrPrintTemplate,
} from "./QrPrintCard";

interface QrPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  tableLabel: string;
  qrUrl: string;
}

// Render at 3x the on-screen size so the exported PNG/PDF stays crisp
// when actually printed, not just when viewed on a screen.
const EXPORT_PIXEL_RATIO = 3;

// The live preview is shown at a fraction of the actual card size so the
// whole dialog (header, template tabs, buttons) fits on screen without
// the card itself dwarfing the rest of the layout — export still renders
// the full-size card via cardRef, this only affects what's on screen.
const PREVIEW_SCALE = 0.5;

function safeFileBase(businessName: string, tableLabel: string) {
  return `${businessName}-table-${tableLabel}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

export function QrPrintDialog({ open, onOpenChange, businessName, tableLabel, qrUrl }: QrPrintDialogProps) {
  const [template, setTemplate] = useState<QrPrintTemplate>("classic");
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const renderPng = async () => {
    if (!cardRef.current) throw new Error("Card not ready");
    return toPng(cardRef.current, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: QR_PRINT_CARD_WIDTH,
      height: QR_PRINT_CARD_HEIGHT,
    });
  };

  const downloadPng = async () => {
    setExporting("png");
    try {
      const dataUrl = await renderPng();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${safeFileBase(businessName, tableLabel)}.png`;
      a.click();
    } catch (e) {
      toast.error("Couldn't generate the image. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    setExporting("pdf");
    try {
      if (!cardRef.current) throw new Error("Card not ready");
      // JPEG rather than PNG here — a lossless raster at 3x pixel density
      // came out to ~6MB per card (PDF re-embeds the source bytes as-is,
      // no re-compression). High-quality JPEG is visually identical and a
      // fraction of the size; a QR code tolerates mild lossy compression
      // fine since it's read from a printed page, not pixel-inspected.
      const dataUrl = await toJpeg(cardRef.current, {
        pixelRatio: EXPORT_PIXEL_RATIO,
        width: QR_PRINT_CARD_WIDTH,
        height: QR_PRINT_CARD_HEIGHT,
        quality: 0.92,
      });
      const pdf = new jsPDF({
        unit: "px",
        format: [QR_PRINT_CARD_WIDTH, QR_PRINT_CARD_HEIGHT],
      });
      pdf.addImage(dataUrl, "JPEG", 0, 0, QR_PRINT_CARD_WIDTH, QR_PRINT_CARD_HEIGHT);
      pdf.save(`${safeFileBase(businessName, tableLabel)}.pdf`);
    } catch (e) {
      toast.error("Couldn't generate the PDF. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print QR — Table {tableLabel}</DialogTitle>
          <DialogDescription>
            Pick a style, then download a ready-to-print card. No design tool needed.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={template} onValueChange={(v) => setTemplate(v as QrPrintTemplate)}>
          <TabsList className="grid grid-cols-3 w-full">
            {(Object.keys(TEMPLATE_LABELS) as QrPrintTemplate[]).map((t) => (
              <TabsTrigger key={t} value={t}>{TEMPLATE_LABELS[t]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex justify-center py-1">
          <div style={{ width: QR_PRINT_CARD_WIDTH * PREVIEW_SCALE, height: QR_PRINT_CARD_HEIGHT * PREVIEW_SCALE, overflow: "hidden" }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
              <QrPrintCard ref={cardRef} businessName={businessName} tableLabel={tableLabel} qrUrl={qrUrl} template={template} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={downloadPng} disabled={exporting !== null}>
            {exporting === "png" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileImage className="w-4 h-4 mr-2" />}
            PNG
          </Button>
          <Button onClick={downloadPdf} disabled={exporting !== null} className="bg-primary text-primary-foreground">
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
