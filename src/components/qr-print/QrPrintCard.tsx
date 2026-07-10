import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export type QrPrintTemplate = "classic" | "minimal" | "bold";

export interface QrPrintCardProps {
  businessName: string;
  tableLabel: string;
  qrUrl: string;
  template: QrPrintTemplate;
}

// Fixed pixel size so the exported PNG/PDF is consistent regardless of
// screen size — roughly postcard-sized (4in x 6in @ 100dpi), good for a
// small table tent or standee insert.
export const QR_PRINT_CARD_WIDTH = 400;
export const QR_PRINT_CARD_HEIGHT = 600;

const TEMPLATE_LABELS: Record<QrPrintTemplate, string> = {
  classic: "Classic",
  minimal: "Minimal",
  bold: "Bold",
};

export { TEMPLATE_LABELS };

// forwardRef so the export dialog can grab the rendered DOM node to
// rasterize with html-to-image — the card itself has no download logic.
export const QrPrintCard = forwardRef<HTMLDivElement, QrPrintCardProps>(
  ({ businessName, tableLabel, qrUrl, template }, ref) => {
    const size = { width: QR_PRINT_CARD_WIDTH, height: QR_PRINT_CARD_HEIGHT };

    if (template === "minimal") {
      return (
        <div
          ref={ref}
          style={{ ...size, background: "#ffffff", border: "2px solid #111111" }}
          className="flex flex-col items-center justify-between px-8 py-10 font-sans"
        >
          <div className="text-center">
            <div className="text-[13px] tracking-[0.2em] uppercase text-neutral-500">{businessName}</div>
          </div>
          <div className="text-center">
            <div className="text-[15px] tracking-[0.15em] uppercase text-neutral-500 mb-2">Table</div>
            <div className="text-6xl font-bold text-neutral-900 leading-none">{tableLabel}</div>
          </div>
          <div className="bg-white p-3 border border-neutral-300">
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          <div className="text-center text-[13px] tracking-wide text-neutral-500">
            Scan to view menu &amp; order
          </div>
        </div>
      );
    }

    if (template === "bold") {
      return (
        <div
          ref={ref}
          style={{ ...size, background: "#1c1917" }}
          className="flex flex-col items-center justify-between px-8 py-10 font-sans"
        >
          <div className="text-center">
            <div className="text-[13px] tracking-[0.25em] uppercase text-amber-400 font-semibold">
              {businessName}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[15px] tracking-[0.15em] uppercase text-neutral-400 mb-2">Table</div>
            <div className="text-7xl font-extrabold text-white leading-none">{tableLabel}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-lg">
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          <div className="text-center text-[13px] tracking-wide text-amber-400 font-medium">
            Scan to view menu &amp; order
          </div>
        </div>
      );
    }

    // classic
    return (
      <div
        ref={ref}
        style={{ ...size, background: "#fdf8f1", border: "1px solid #e7d9c3" }}
        className="flex flex-col items-center justify-between px-8 py-10 font-sans rounded-2xl"
      >
        <div className="text-center">
          <div className="text-lg font-bold text-orange-900">{businessName}</div>
        </div>
        <div className="text-center">
          <div className="text-sm tracking-[0.15em] uppercase text-orange-700/70 mb-1">Table</div>
          <div className="text-6xl font-bold text-orange-900 leading-none">{tableLabel}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-md border border-orange-100">
          <QRCodeSVG value={qrUrl} size={180} />
        </div>
        <div className="text-center text-sm text-orange-700/80 italic">
          Scan to view menu &amp; order
        </div>
      </div>
    );
  }
);
QrPrintCard.displayName = "QrPrintCard";
