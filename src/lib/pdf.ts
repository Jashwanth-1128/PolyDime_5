import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker src
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const loadPdf = async (data: string | ArrayBuffer | Uint8Array) => {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    const binaryString = window.atob(data.split(',')[1] || data);
    bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  return await loadingTask.promise;
};

export const renderPdfPage = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number, bookId: string, scale: number = 2): Promise<string> => {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale }); // Higher scale for better quality
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas
  };
  
  await page.render(renderContext).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
};

export const extractPdfText = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> => {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  return textContent.items.map((item: any) => item.str).join(' ');
};

export const getPdfTextContent = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  return { items: textContent.items, viewport };
};
