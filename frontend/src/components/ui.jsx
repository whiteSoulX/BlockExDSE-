export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ variant = "primary", className = "", disabled, children, ...props }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    danger: "bg-rose-500 text-slate-950 hover:bg-rose-400",
    ghost: "border border-slate-700 text-slate-200 hover:bg-slate-800",
    subtle: "bg-slate-800 text-slate-200 hover:bg-slate-700",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, className = "", ...props }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label && <span>{label}</span>}
      <input
        className={`rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, className = "", children, ...props }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label && <span>{label}</span>}
      <select
        className={`rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: "bg-slate-800 text-slate-300",
    green: "bg-emerald-500/15 text-emerald-400",
    red: "bg-rose-500/15 text-rose-400",
    amber: "bg-amber-500/15 text-amber-400",
    blue: "bg-sky-500/15 text-sky-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mono mt-1 text-xl font-semibold text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

export function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-xs text-slate-600">
        {children}
      </td>
    </tr>
  );
}

export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-xs">
        <thead>
          <tr className="text-slate-500">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-slate-800 pb-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-300">{children}</tbody>
      </table>
    </div>
  );
}
