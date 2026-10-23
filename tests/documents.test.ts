import { describe, it, expect } from "vitest";
import { contentTypeFor, fileSize, safeFileName, storagePath } from "@/lib/crm/documents";

describe("documents", () => {
  it("knows the allowed file types by extension", () => {
    expect(contentTypeFor("Proposal.PDF")).toBe("application/pdf");
    expect(contentTypeFor("deck.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(contentTypeFor("script.exe")).toBeNull();
    expect(contentTypeFor("no-extension")).toBeNull();
  });

  it("makes file names safe for storage, keeping the extension", () => {
    expect(safeFileName("The Map – Acacia (v2).pdf")).toBe("The-Map-Acacia-v2.pdf");
    expect(safeFileName("../../etc/passwd.pdf")).toBe("..-..-etc-passwd.pdf");
    expect(safeFileName("Café notes.DOCX")).toBe("Cafe-notes.docx");
    expect(safeFileName("???.pdf")).toBe("file.pdf");
  });

  it("files each upload under its workspace, document and version", () => {
    expect(storagePath("ws", "doc", 2, "One pager.pdf")).toBe("ws/doc/v2/One-pager.pdf");
    expect(storagePath("ws", "doc", 1, "../x.pdf").split("/")).toHaveLength(4);
  });

  it("shows sizes in KB or MB", () => {
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(fileSize(null)).toBe("");
  });
});
