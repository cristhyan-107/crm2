'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';

interface PdfButtonProps {
  /** CSS selector or ref ID of the element to capture */
  targetSelector?: string;
  /** Filename for the downloaded PDF (without .pdf extension) */
  filename?: string;
  variant?: 'icon' | 'full';
}

export function PdfButton({ 
  targetSelector = '#report-content', 
  filename = 'relatorio',
  variant = 'icon' 
}: PdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const element = document.querySelector(targetSelector);
      if (!element) {
        console.error('Report content element not found:', targetSelector);
        return;
      }

      // Clone the element so we can style it for PDF without affecting the page
      const clone = element.cloneNode(true) as HTMLElement;
      
      // Override dark-mode styles for PDF (white background for readability)
      clone.style.backgroundColor = '#ffffff';
      clone.style.color = '#1a1a1a';
      clone.style.padding = '24px';
      
      // Override all child element colors for PDF readability
      clone.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        const computedStyle = window.getComputedStyle(htmlEl);
        
        // Make dark text colors readable
        if (computedStyle.color) {
          const rgb = computedStyle.color;
          // If text is very light (for dark mode), make it dark
          if (rgb.includes('rgba') && rgb.includes(', 0)')) return; // skip transparent
          htmlEl.style.color = htmlEl.style.color || '';
        }
      });

      // Apply white-background theme overrides
      clone.querySelectorAll('[class*="text-white"]').forEach(el => {
        (el as HTMLElement).style.color = '#1a1a1a';
      });
      clone.querySelectorAll('[class*="text-gray-"]').forEach(el => {
        (el as HTMLElement).style.color = '#4a5568';
      });
      clone.querySelectorAll('[class*="text-blue-"]').forEach(el => {
        (el as HTMLElement).style.color = '#2563eb';
      });
      clone.querySelectorAll('[class*="text-emerald-"]').forEach(el => {
        (el as HTMLElement).style.color = '#059669';
      });
      clone.querySelectorAll('[class*="bg-[#"]').forEach(el => {
        (el as HTMLElement).style.backgroundColor = '#ffffff';
      });
      clone.querySelectorAll('[class*="border-white"]').forEach(el => {
        (el as HTMLElement).style.borderColor = '#e2e8f0';
      });

      // Hide print:hidden elements
      clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        },
        jsPDF: { 
          unit: 'mm' as const, 
          format: 'a4' as const, 
          orientation: 'portrait' as const,
        },
      };

      // Temporarily add clone to DOM (hidden)
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = '800px';
      document.body.appendChild(clone);

      await html2pdf().set(opt).from(clone).save();

      document.body.removeChild(clone);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (variant === 'full') {
    return (
      <button
        onClick={handleGeneratePdf}
        disabled={generating}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg font-medium transition-colors print:hidden"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4" />
        )}
        {generating ? 'Gerando PDF...' : 'Baixar PDF'}
      </button>
    );
  }

  return (
    <button
      onClick={handleGeneratePdf}
      disabled={generating}
      className="inline-flex items-center justify-center p-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-300 rounded-lg transition-colors border border-white/10 print:hidden"
      title="Baixar PDF"
    >
      {generating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
    </button>
  );
}
