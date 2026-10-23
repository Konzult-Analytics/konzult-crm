import { qrPath } from "@/lib/crm/qr";

/** Always black on white, whatever the theme: scanners need the contrast. */
export default function QrCode({ text, label, className }: { text: string; label: string; className?: string }) {
  const { size, d } = qrPath(text);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className={className}>
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
