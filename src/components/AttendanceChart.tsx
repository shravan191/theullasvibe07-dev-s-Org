interface BarItem {
  label: string;
  percentage: number;
  sublabel?: string;
}

export function AttendanceBarChart({
  title,
  subtitle,
  items,
  targetPercent = 75,
}: {
  title: string;
  subtitle?: string;
  items: BarItem[];
  targetPercent?: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          Target threshold: {targetPercent}%
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          No finalized attendance records available for this chart yet.
        </div>
      ) : (
        <div className="space-y-3.5">
          {items.map((item) => {
            const pct = Math.max(0, Math.min(100, item.percentage));
            const barColor =
              pct >= targetPercent
                ? 'bg-[#1D4ED8]'
                : pct >= Math.max(0, targetPercent - 10)
                ? 'bg-amber-600'
                : 'bg-red-600';

            return (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800 truncate block">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-slate-500 block">{item.sublabel}</span>
                    )}
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-900 shrink-0">
                    {pct.toFixed(2)}%
                  </span>
                </div>
                <div className="relative h-2.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-200`}
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-px bg-slate-900/40"
                    style={{ left: `${targetPercent}%` }}
                    title={`${targetPercent}% minimum requirement`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
