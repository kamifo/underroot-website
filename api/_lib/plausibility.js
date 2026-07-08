// Plausibility rules — the anti-nonsense gate. Implausible runs are stored
// quarantined (invisible to stats), and the client still gets a 200 so
// forgers get no feedback loop. Pure module, no I/O.
//
// All constants tunable here. MAX_DEPTH_TILES: derived from game's
// data/layers.json deepest layer (quartz, depth_end: 342) + 50 grace tiles.

export const LIMITS = {
  BLOCKS_PER_DAY_MAX: 800,
  BLOCKS_GRACE: 1000,
  MAX_DEPTH_TILES: 392,
  MAX_DAYS: 3650,
  MAX_GEN: 50,
  PEAK_CEILING: 1_000_000,
};

export function checkPlausibility(run) {
  const reasons = [];
  const L = LIMITS;

  if (run.days > L.MAX_DAYS) reasons.push('days beyond cap');
  if (run.gen > L.MAX_GEN) reasons.push('generation beyond cap');
  if (run.depth > L.MAX_DEPTH_TILES) reasons.push('depth beyond world bottom');
  if (run.blocks > run.days * L.BLOCKS_PER_DAY_MAX + L.BLOCKS_GRACE) reasons.push('mining rate impossible');
  if (run.villager_deaths > Math.max(1, run.peak_population) * Math.max(1, run.days)) {
    reasons.push('villager deaths impossible');
  }

  for (const [mat, amt] of Object.entries(run.peaks ?? {})) {
    if (amt > L.PEAK_CEILING) { reasons.push(`peak ${mat} impossible`); break; }
  }

  // Lineage: gen/days non-decreasing; final entry must agree with run totals.
  const lin = run.lineage ?? [];
  for (let i = 1; i < lin.length; i++) {
    if (lin[i].gen <= lin[i - 1].gen || lin[i].days < lin[i - 1].days) {
      reasons.push('lineage not monotonic');
      break;
    }
  }
  if (lin.length > 0) {
    const last = lin[lin.length - 1];
    if (last.days > run.days || last.gen > run.gen || last.depth > run.depth) {
      reasons.push('lineage exceeds run totals');
    }
  }

  // History: day strictly increasing; depth/blocks/souls non-decreasing;
  // nothing above the run's final totals.
  const hist = run.history ?? [];
  for (let i = 0; i < hist.length; i++) {
    const [day, depth, blocks, , souls] = hist[i];
    if (i > 0) {
      const [pd, pdepth, pblocks, , psouls] = hist[i - 1];
      if (day <= pd || depth < pdepth || blocks < pblocks || souls < psouls) {
        reasons.push('history not monotonic');
        break;
      }
    }
    if (day > run.days || depth > run.depth || blocks > run.blocks || souls > run.villager_deaths) {
      reasons.push('history exceeds run totals');
      break;
    }
  }

  return { plausible: reasons.length === 0, reasons };
}
