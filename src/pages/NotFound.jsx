import React from 'react';
import { Compass, ArrowLeft } from 'lucide-react';

export default function NotFound({ onNav }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 text-center px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--grad)' }}
      >
        <Compass size={28} color="#fff" strokeWidth={2} />
      </div>

      <div>
        <h1 className="font-display font-black text-6xl tracking-tight text-[var(--ink)]">404</h1>
        <p className="font-display font-bold text-xl text-[var(--ink)] mt-2">Page not found</p>
        <p className="text-sm text-[var(--mut)] font-semibold mt-2 max-w-sm">
          The page you're looking for doesn't exist or may have been moved.
        </p>
      </div>

      <button
        onClick={() => onNav?.('dashboard')}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
        style={{ background: 'var(--grad)' }}
      >
        <ArrowLeft size={15} />
        Back to Dashboard
      </button>
    </div>
  );
}
