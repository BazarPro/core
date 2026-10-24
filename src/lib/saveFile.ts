import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { jsPDF } from 'jspdf';

/**
 * Downloads a generated file. The mobile app's web view cannot download: there the file
 * is written to the cache and handed to the system share sheet (print, mail, files …).
 */
export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return shareFile(blob, fileName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** `doc.save()` on the web, the share sheet in the app. */
export async function savePdf(doc: jsPDF, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return shareFile(doc.output('blob'), fileName);
  doc.save(fileName);
}

async function shareFile(blob: Blob, fileName: string) {
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: await toBase64(blob),
    directory: Directory.Cache,
  });
  await Share.share({ files: [uri] });
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    // "data:<type>;base64,<data>" → "<data>"
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}
