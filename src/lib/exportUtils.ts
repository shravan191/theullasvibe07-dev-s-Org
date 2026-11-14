import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function downloadCsvReport(
  filename: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
) {
  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    columns.map(escapeCell).join(','),
    ...rows.map((row) => columns.map((col) => escapeCell(row[col])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPdfReport(
  filename: string,
  title: string,
  subtitle: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });

  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('University Attendance Management ERP', 14, 12);
  doc.setFontSize(9);
  doc.text(`${title} | Generated: ${new Date().toLocaleString()}`, 14, 20);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(subtitle, 14, 34);

  autoTable(doc, {
    startY: 40,
    head: [columns],
    body: rows.map((r) => columns.map((c) => String(r[c] ?? ''))),
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 39, 68],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [244, 247, 251],
    },
  });

  doc.save(`${filename}.pdf`);
}
