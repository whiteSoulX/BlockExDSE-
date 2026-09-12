const TONE_STYLES = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${TONE_STYLES[t.tone] || TONE_STYLES.info}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="break-words">{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
