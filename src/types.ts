interface CorrectionResult {
  original: string;
  corrected: string;
  diffs: DiffEntry[];
}

interface DiffEntry {
  original: string;
  corrected: string;
  position: number;
  confidence: number;
}