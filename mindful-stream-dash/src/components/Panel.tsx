import type { ReactNode } from "react";

export function Panel({
  title, action, children, className = "",
}: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-card p-5 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-4">
          {title && <h3 className="panel-title">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
