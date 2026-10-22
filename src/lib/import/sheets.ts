import * as XLSX from "xlsx";
import type { Cell } from "./normalize";

export type Sheet = { name: string; rows: Cell[][] };

/** Every sheet as rows of raw cells. Dates stay Excel serial numbers; cleanDate reads them. */
export function readWorkbook(data: ArrayBuffer | Buffer): Sheet[] {
  const book = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer", dense: true });
  return book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
}
