import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Download, Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

type BillLine = { name: string; price: number; quantity: number };

export interface BillOrder {
  id: string;
  business_id: string;
  token_number: number;
  customer_name: string;
  table_number: string | null;
  order_type: string;
  notes: string | null;
  created_at: string;
  order_items: BillLine[];
}

interface OrderBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BillOrder | null;
  businessName: string;
}

const money = (amount: number) => `PKR ${Math.max(amount, 0).toLocaleString()}`;
const sourceLines = (order: BillOrder): BillLine[] => order.order_items.map((item) => ({ ...item, price: Number(item.price), quantity: Number(item.quantity) }));

export function OrderBillDialog({ open, onOpenChange, order, businessName }: OrderBillDialogProps) {
  const [lines, setLines] = useState<BillLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    setEditing(false);
    supabase.from("order_bill_edits").select("items, discount_amount, service_charge, note").eq("order_id", order.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        const editedLines = Array.isArray(data?.items) ? data.items as unknown as BillLine[] : null;
        setLines(editedLines?.length ? editedLines.map((item) => ({ name: String(item.name ?? ""), price: Number(item.price) || 0, quantity: Number(item.quantity) || 1 })) : sourceLines(order));
        setDiscount(Number(data?.discount_amount) || 0);
        setServiceCharge(Number(data?.service_charge) || 0);
        setNote(data?.note ?? "");
        setLoading(false);
      }, () => setLoading(false));
  }, [open, order]);

  const subtotal = useMemo(() => lines.reduce((sum, item) => sum + item.price * item.quantity, 0), [lines]);
  const total = Math.max(subtotal - discount + serviceCharge, 0);
  if (!order) return null;

  const updateLine = (index: number, patch: Partial<BillLine>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("order_bill_edits").upsert({
      order_id: order.id,
      business_id: order.business_id,
      items: lines.map((line) => ({ name: line.name.trim() || "Item", price: Math.max(line.price, 0), quantity: Math.max(Math.floor(line.quantity), 1) })),
      discount_amount: Math.max(discount, 0),
      service_charge: Math.max(serviceCharge, 0),
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setEditing(false);
    toast.success("Bill changes saved");
  };

  const createPdf = () => {
    const pdf = new jsPDF({ unit: "mm", format: [80, 180] });
    let y = 12;
    const line = (text: string, align: "left" | "right" = "left") => pdf.text(text, align === "right" ? 74 : 6, y, { align });
    pdf.setFontSize(15); pdf.setFont("helvetica", "bold"); pdf.text(businessName, 40, y, { align: "center" }); y += 8;
    pdf.setFontSize(10); pdf.setFont("helvetica", "normal"); pdf.text("Order bill", 40, y, { align: "center" }); y += 8;
    line(`Order #${order.token_number}`); line(format(new Date(order.created_at), "MMM d, yyyy h:mm a"), "right"); y += 6;
    line(order.customer_name); line(order.table_number ? `Table ${order.table_number}` : "Takeaway", "right"); y += 6;
    pdf.line(6, y, 74, y); y += 6;
    lines.forEach((item) => { line(`${item.quantity}× ${item.name}`); line(money(item.price * item.quantity), "right"); y += 6; });
    pdf.line(6, y, 74, y); y += 6;
    line("Subtotal"); line(money(subtotal), "right"); y += 6;
    if (discount > 0) { line("Discount"); line(`- ${money(discount)}`, "right"); y += 6; }
    if (serviceCharge > 0) { line("Service charge"); line(money(serviceCharge), "right"); y += 6; }
    pdf.setFont("helvetica", "bold"); line("Total"); line(money(total), "right"); y += 8;
    if (note) { pdf.setFont("helvetica", "normal"); pdf.text(note, 6, y, { maxWidth: 68 }); }
    return pdf;
  };

  const downloadPdf = () => {
    createPdf().save(`${businessName}-order-${order.token_number}-bill.pdf`.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase());
  };

  const printBill = () => {
    const pdf = createPdf();
    pdf.autoPrint();
    window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Order bill #{order.token_number}</DialogTitle>
        <DialogDescription>{order.customer_name}{order.table_number ? ` · Table ${order.table_number}` : " · Takeaway"}</DialogDescription>
      </DialogHeader>
      {loading ? <div className="flex justify-center py-14"><Loader2 className="w-6 h-6 animate-spin" /></div> : <div className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between"><span className="font-display font-semibold">Items</span>{!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit bill</Button>}</div>
          {lines.map((item, index) => <div key={index} className="grid grid-cols-[1fr_52px_70px_36px] gap-2 items-center text-sm">
            {editing ? <Input value={item.name} onChange={(e) => updateLine(index, { name: e.target.value })} /> : <span>{item.quantity}× {item.name}</span>}
            {editing ? <Input type="number" min="1" value={item.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /> : null}
            {editing ? <Input type="number" min="0" value={item.price} onChange={(e) => updateLine(index, { price: Number(e.target.value) })} /> : <span className="text-right">{money(item.price * item.quantity)}</span>}
            {editing ? <Button size="icon" variant="ghost" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 className="w-4 h-4 text-destructive" /></Button> : null}
          </div>)}
          {editing && <Button size="sm" variant="ghost" onClick={() => setLines((current) => [...current, { name: "New item", price: 0, quantity: 1 }])}><Plus className="w-4 h-4 mr-1" /> Add item</Button>}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
          {editing ? <><div className="grid grid-cols-2 gap-3"><Input type="number" min="0" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="Discount" /><Input type="number" min="0" value={serviceCharge} onChange={(e) => setServiceCharge(Number(e.target.value))} placeholder="Service charge" /></div><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bill note (optional)" rows={2} /></> : <>{discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>- {money(discount)}</span></div>}{serviceCharge > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Service charge</span><span>{money(serviceCharge)}</span></div>}{note && <p className="text-muted-foreground pt-1">{note}</p>}</>}
          <div className="flex justify-between border-t pt-3 font-display text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
        </div>
        <div className="flex gap-2">{editing ? <><Button variant="outline" className="flex-1" onClick={() => { setLines(sourceLines(order)); setDiscount(0); setServiceCharge(0); setNote(""); setEditing(false); }}>Cancel</Button><Button className="flex-1 bg-primary text-primary-foreground" disabled={saving || lines.length === 0} onClick={save}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save bill"}</Button></> : <><Button variant="outline" className="flex-1" onClick={printBill}><Printer className="w-4 h-4 mr-2" /> Print bill</Button><Button className="flex-1 bg-primary text-primary-foreground" onClick={downloadPdf}><Download className="w-4 h-4 mr-2" /> Download PDF</Button></>}</div>
      </div>}
    </DialogContent>
  </Dialog>;
}
