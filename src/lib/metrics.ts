// Lightweight in-memory metrics for Phase 6 monitoring skeleton
const counters: Record<string, number> = { requests_total: 0 };

export function incCounter(name: string, n = 1) {
  counters[name] = (counters[name] || 0) + n;
}

export function getMetrics() {
  return { ...counters };
}

export function getPrometheusText() {
  // Simple exposition: counters only
  let out = '';
  for (const [k, v] of Object.entries(counters)) {
    out += `# TYPE ${k} counter\n`;
    out += `${k} ${v}\n`;
  }
  return out;
}

export default { incCounter, getMetrics, getPrometheusText };
