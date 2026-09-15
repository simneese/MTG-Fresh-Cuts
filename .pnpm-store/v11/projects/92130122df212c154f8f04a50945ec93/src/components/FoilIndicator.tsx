export function isFoilPrinting(cacheKey?: string) {
  return cacheKey?.split(':').at(-1) === 'foil';
}

export default function FoilIndicator({ cacheKey }: { cacheKey?: string }) {
  if (!isFoilPrinting(cacheKey)) return null;
  return (
    <span
      className="ml-1.5 inline-flex size-4 shrink-0 translate-y-[-1px] items-center justify-center rounded border border-sky-200/35 bg-gradient-to-br from-fuchsia-300/20 via-cyan-200/20 to-amber-200/20 font-mono text-[9px] font-bold text-sky-100 shadow-sm shadow-cyan-300/10"
      title="Foil printing"
      aria-label="Foil printing"
    >
      F
    </span>
  );
}
