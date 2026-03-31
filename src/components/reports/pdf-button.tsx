'use client';

import { FileDown } from 'lucide-react';

interface PdfButtonProps {
  /** CSS selector or ref ID of the element to capture (kept for API compatibility) */
  targetSelector?: string;
  /** Filename for the downloaded PDF (kept for API compatibility) */
  filename?: string;
  variant?: 'icon' | 'full';
}

export function PdfButton({ 
  variant = 'icon' 
}: PdfButtonProps) {
  
  const handleGeneratePdf = () => {
    // The native window.print() is 100% reliable, handles Tailwind v4 oklch colors perfectly,
    // and produces highlightable, smaller PDF files. The UI is controlled via 'print:*' tailwind classes.
    window.print();
  };

  if (variant === 'full') {
    return (
      <button
        onClick={handleGeneratePdf}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors print:hidden"
      >
        <FileDown className="w-4 h-4" />
        Baixar PDF
      </button>
    );
  }

  return (
    <button
      onClick={handleGeneratePdf}
      className="inline-flex items-center justify-center p-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/10 print:hidden"
      title="Baixar PDF"
    >
      <FileDown className="w-4 h-4" />
    </button>
  );
}
