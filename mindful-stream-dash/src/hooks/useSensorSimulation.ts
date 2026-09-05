import { useEffect, useRef, useState } from "react";

export type SensorTick = { t: number; bpm: number; gsr: number; motion: number; ax: number; ay: number; az: number };

const MAX = 50;

export function useSensorSimulation(intervalMs = 1200) {
  const [series, setSeries] = useState<SensorTick[]>(() =>
    Array.from({ length: MAX }).map((_, i) => ({
      t: i, bpm: 78, gsr: 4.2, motion: 35, ax: 30, ay: 20, az: 40,
    }))
  );
  const idx = useRef(MAX);

  useEffect(() => {
    const id = setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1];
        const next: SensorTick = {
          t: idx.current++,
          bpm: clamp(last.bpm + (Math.random() - 0.5) * 4, 65, 110),
          gsr: +clamp(last.gsr + (Math.random() - 0.5) * 0.6, 1.5, 9.5).toFixed(2),
          motion: Math.round(clamp(last.motion + (Math.random() - 0.5) * 18, 0, 100)),
          ax: Math.round(clamp(last.ax + (Math.random() - 0.5) * 25, 0, 100)),
          ay: Math.round(clamp(last.ay + (Math.random() - 0.5) * 25, 0, 100)),
          az: Math.round(clamp(last.az + (Math.random() - 0.5) * 25, 0, 100)),
        };
        return [...prev.slice(-MAX + 1), next];
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const latest = series[series.length - 1];
  return { series, latest };
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
