export type FocusState = "Focused" | "Distracted" | "Disregulated";

// Clean types and structure - No dummy/fake data
export interface TelemetryPoint {
  time: string;
  bpm: number;
  gsr: number;
  motion: number;
}
