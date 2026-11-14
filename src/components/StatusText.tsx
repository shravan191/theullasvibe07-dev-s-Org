import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';

export function CategoryStatusText({ category }: { category: string }) {
  if (category === 'Eligible') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Eligible</span>
      </span>
    );
  }
  if (category === 'Shortage Warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Shortage Warning</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
      <span>Critical Shortage</span>
    </span>
  );
}

export function AttendanceStatusText({ status }: { status: string }) {
  if (status === 'Present') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Present</span>
      </span>
    );
  }
  if (status === 'Absent') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Absent</span>
      </span>
    );
  }
  if (status === 'Late') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>Late</span>
      </span>
    );
  }
  if (status === 'Pending Review') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Pending Review</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
}
