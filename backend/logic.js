// ==============================================================
// Core domain logic for the Protein Timing Tracker
// Based on: Areta et al. 2013 (J Physiol) — 20g protein every ~3h
// outperformed both more-frequent-smaller and less-frequent-larger
// dosing patterns for stimulating muscle protein synthesis (MPS).
// Also: Mamerow et al. 2014 (even spacing > back-loading protein).
// ==============================================================

const ACTIVITY_FACTORS = {
  sedentary: 0.8,      // g protein per kg bodyweight / day
  active: 1.4,         // recreational exercise a few times/week
  training: 1.9,       // regular resistance training (core user)
  serious: 2.2          // competitive / high-frequency training
};

// Effective per-dose thresholds, from Areta 2013 / Moore et al.
const MIN_EFFECTIVE_DOSE_G = 20;   // below this, a dose barely registers
const OPTIMAL_DOSE_G = 40;         // diminishing returns above this
const IDEAL_GAP_HOURS = 3;         // Areta's "INT" arm: every 3h
const MIN_GAP_HOURS = 2.5;         // closer than this = doses start to overlap/waste
const MAX_GAP_HOURS = 5;           // longer than this = meaningful gap, flag it

/**
 * Calculate a flat daily protein target (v1: not adjusted per workout day).
 */
function calculateProteinTarget({ weightKg, activityLevel }) {
  const factor = ACTIVITY_FACTORS[activityLevel] ?? ACTIVITY_FACTORS.training;
  return Math.round(weightKg * factor);
}

/**
 * Classify a single dose by size.
 */
function classifyDose(grams) {
  if (grams < MIN_EFFECTIVE_DOSE_G) return "small";       // likely below effective threshold
  if (grams <= OPTIMAL_DOSE_G) return "good";              // in the sweet spot
  return "large";                                           // fine nutritionally, but extra likely not extra-stimulating
}

/**
 * Given today's log entries (sorted by time), work out spacing quality
 * and produce a plain-language status the UI can show directly.
 * entries: [{ grams, timestamp }]  timestamp = ms epoch
 */
function analyzeSpacing(entries) {
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const totalGrams = sorted.reduce((sum, e) => sum + e.grams, 0);

  const annotated = sorted.map((e, i) => {
    const doseType = classifyDose(e.grams);
    let gapHours = null;
    let gapFlag = "ok";
    if (i > 0) {
      gapHours = (e.timestamp - sorted[i - 1].timestamp) / (1000 * 60 * 60);
      if (gapHours < MIN_GAP_HOURS) gapFlag = "too_close";
      else if (gapHours > MAX_GAP_HOURS) gapFlag = "gap";
    }
    return { ...e, doseType, gapHours, gapFlag };
  });

  // Check gap since last dose to "now" too (an open-ended gap matters)
  let openGapHours = null;
  let openGapFlag = "ok";
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    openGapHours = (Date.now() - last.timestamp) / (1000 * 60 * 60);
    if (openGapHours > MAX_GAP_HOURS) openGapFlag = "gap";
  }

  const tooCloseCount = annotated.filter(e => e.gapFlag === "too_close").length;
  const gapCount = annotated.filter(e => e.gapFlag === "gap").length + (openGapFlag === "gap" ? 1 : 0);
  const smallDoseCount = annotated.filter(e => e.doseType === "small").length;

  let spacingQuality = "good"; // good | mixed | poor
  if (tooCloseCount + gapCount === 0 && smallDoseCount === 0) spacingQuality = "good";
  else if (tooCloseCount + gapCount + smallDoseCount >= 2) spacingQuality = "poor";
  else spacingQuality = "mixed";

  return { entries: annotated, totalGrams, spacingQuality, gapCount, tooCloseCount, smallDoseCount, openGapHours, openGapFlag };
}

/**
 * Combine total-vs-target with spacing quality into one plain status line.
 */
function buildStatusMessage({ totalGrams, target, spacingQuality, openGapFlag }) {
  const hitTarget = totalGrams >= target * 0.9; // small buffer

  if (hitTarget && spacingQuality === "good") {
    return { level: "good", message: "On track — good total, good spacing." };
  }
  if (hitTarget && spacingQuality !== "good") {
    return { level: "warn", message: "You're hitting your total, but doses are bunched or gapped — spacing it out more evenly would help." };
  }
  if (!hitTarget && spacingQuality === "good") {
    return { level: "warn", message: "Good spacing so far, but you're under your daily protein target." };
  }
  if (openGapFlag === "gap") {
    return { level: "warn", message: "It's been a while since your last protein — worth topping up." };
  }
  return { level: "bad", message: "Under your target and spacing could be better today." };
}

module.exports = {
  ACTIVITY_FACTORS,
  MIN_EFFECTIVE_DOSE_G,
  OPTIMAL_DOSE_G,
  IDEAL_GAP_HOURS,
  MIN_GAP_HOURS,
  MAX_GAP_HOURS,
  calculateProteinTarget,
  classifyDose,
  analyzeSpacing,
  buildStatusMessage
};
