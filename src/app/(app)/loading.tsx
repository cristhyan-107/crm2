import { RefreshCw } from 'lucide-react';

export default function Loading() {
  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
      <p className="text-gray-400 font-medium">Carregando...</p>
    </div>
  );
}
