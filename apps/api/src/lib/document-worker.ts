import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";

const input = z.object({ mimeType: z.string(), bytes: z.instanceof(Uint8Array) }).parse(workerData);
try {
  let content: string;
  if (input.mimeType === "application/pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({ data: input.bytes, useSystemFonts: false });
    const document = await loading.promise;
    try {
      if (document.numPages > 200) throw new Error("PDF exceeds the 200-page limit");
      const pages: string[] = [];
      let hasText = false;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const text = await (await document.getPage(pageNumber)).getTextContent();
        const pageText = text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        hasText ||= !!pageText.trim();
        pages.push(`[Page ${pageNumber}]\n${pageText}`);
        if (pages.reduce((sum, page) => sum + page.length, 0) > 200000)
          throw new Error("Document exceeds the text limit");
      }
      if (!hasText) throw new Error("This PDF needs OCR; no readable text was found");
      content = pages.join("\n\n");
    } finally {
      await loading.destroy();
    }
  } else {
    const mammoth = await import("mammoth");
    content = (await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) })).value;
  }
  if (!content.trim() || content.length > 200000)
    throw new Error("No readable text, or the document exceeds the text limit");
  parentPort?.postMessage({ content });
} catch (error) {
  parentPort?.postMessage({
    error: error instanceof Error ? error.message : "Document parsing failed",
  });
}
