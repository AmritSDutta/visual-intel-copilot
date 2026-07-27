import { jsPDF } from 'jspdf';
import type { SessionTurnRecord } from './sessionDbService';

export async function exportSessionToPdf(sessionId: string, turns: SessionTurnRecord[]): Promise<void> {
  if (!turns || turns.length === 0) {
    throw new Error('No turns found for this session to export.');
  }

  // Sort turns chronologically
  const sortedTurns = [...turns].sort((a, b) => 
    a.created_at.localeCompare(b.created_at) || a.turn_id.localeCompare(b.turn_id)
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Title Page / Session Header
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('EXCALIDRAW AI SESSION REPORT', margin, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // #cbd5e1
  doc.text(`Session ID: ${sessionId}`, margin, 24);
  doc.text(`Total Turns: ${sortedTurns.length}  •  Exported: ${new Date().toLocaleString()}`, margin, 29);

  let currentY = 45;

  for (let index = 0; index < sortedTurns.length; index++) {
    const turn = sortedTurns[index];
    const turnNumber = index + 1;

    // Check page space for turn header
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    // Turn Section Badge
    doc.setFillColor(30, 41, 59); // #1e293b
    doc.rect(margin, currentY, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TURN ${turnNumber} (${new Date(turn.created_at).toLocaleTimeString()})`, margin + 4, currentY + 7);
    currentY += 15;

    // User Question / Prompt
    doc.setTextColor(51, 65, 85); // #334155
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('USER QUESTION:', margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const promptLines = doc.splitTextToSize(turn.user_prompt, contentWidth);
    doc.text(promptLines, margin, currentY);
    currentY += promptLines.length * 5 + 6;

    // Canvas Snapshot PNG Image
    if (turn.image_blob && turn.image_blob.startsWith('data:image')) {
      try {
        if (currentY > pageHeight - 80) {
          doc.addPage();
          currentY = 20;
        }

        const imgHeight = (contentWidth * 9) / 16; // 16:9 aspect ratio
        doc.addImage(turn.image_blob, 'PNG', margin, currentY, contentWidth, imgHeight);
        currentY += imgHeight + 8;
      } catch (e) {
        console.warn('Failed to embed turn image blob in PDF:', e);
      }
    }

    // AI Response Plain Text
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(51, 65, 85);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('AI RESPONSE:', margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);

    const replyLines = doc.splitTextToSize(turn.chat_reply, contentWidth);
    for (const line of replyLines) {
      if (currentY > pageHeight - 15) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(line, margin, currentY);
      currentY += 4.5;
    }

    currentY += 12; // Gap between turns
  }

  // Download PDF file
  const filename = `session-${sessionId}.pdf`;
  doc.save(filename);
}
