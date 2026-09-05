import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger";
type Toast = { id: number; tone: Tone; title: string; description?: string };

const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const toneStyle: Record<Tone, { border: string; icon: ReactNode; color: string }> = {
  info:    { border: "#00D4FF", icon: <Info className="h-4 w-4" />,           color: "#67E8FF" },
  success: { border: "#10B981", icon: <CheckCircle2 className="h-4 w-4" />,   color: "#6EE7B7" },
  warning: { border: "#F59E0B", icon: <AlertTriangle className="h-4 w-4" />,  color: "#FBBF24" },
  danger:  { border: "#F43F5E", icon: <AlertTriangle className="h-4 w-4" />,  color: "#FB7185" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3 w-[320px] pointer-events-none">
        {toasts.map((t) => {
          const s = toneStyle[t.tone];
          return (
            <div
              key={t.id}
              className="glass-card toast-in p-3 pl-4 pointer-events-auto flex gap-3 shadow-xl"
              style={{ borderLeft: `4px solid ${s.border}` }}
            >
              <div style={{ color: s.color }} className="mt-0.5">{s.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: s.color }}>{t.title}</div>
                {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
