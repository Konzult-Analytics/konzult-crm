// QR codes drawn in the CRM, so booking links never go to an outside QR service.
import qrcode from "qrcode-generator";

/** Modules of empty margin around the code; scanners need at least four. */
export const QR_MARGIN = 4;

/** One SVG path for the dark modules of a code for `text` (medium error correction). */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QR_MARGIN} ${row + QR_MARGIN}h1v1h-1z`;
    }
  }
  return { size: count + QR_MARGIN * 2, d };
}

/** A standalone SVG file of the code, black on white, for printing. */
export function qrSvg(text: string): string {
  const { size, d } = qrPath(text);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">
<rect width="${size}" height="${size}" fill="#ffffff"/>
<path d="${d}" fill="#000000"/>
</svg>
`;
}
