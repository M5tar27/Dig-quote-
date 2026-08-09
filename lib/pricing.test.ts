import { describe, it, expect } from "vitest";
import { calculatePricing, calculateManualPricing, recalculateFromLineItems } from "./pricing";
import { DEFAULT_RATES, type AiEstimate, type AiDataJson } from "./types";

// Ohio default rates, exactly as shipped in supabase/schema.sql and lib/types.ts.
const RATES = { ...DEFAULT_RATES };

describe("calculatePricing", () => {
  // This mirrors the demo quote in supabase/seed.sql (Karen Mitchell / patio job).
  // If this test's expected total ever needs to change, seed.sql's ai_data_json must
  // change to match, or the demo account will show numbers that don't add up.
  const seedEstimate: AiEstimate = {
    sqft: 320,
    avg_depth_inches: 12,
    cubic_yards_to_remove: 13.2,
    tons_gravel_needed: 8.5,
    tons_sand_needed: 3.0,
    labor_hours_excavator: 6,
    labor_hours_handwork: 8,
    equipment_days: 1,
    confidence_1to10: 8,
    notes: "test",
  };

  it("matches the seeded demo quote total exactly", () => {
    const result = calculatePricing(seedEstimate, RATES);
    // subtotal = excavator(750) + handwork(440) + equipment(450) + gravel(1275) + disposal(594) + sand(180)
    expect(result.subtotal).toBe(3689);
    expect(result.markup).toBe(737.8); // 20%
    expect(result.profit).toBe(553.35); // 15%
    expect(result.total).toBe(4980.15);
    expect(result.manual_mode).toBe(false);
  });

  it("includes a Sand line item only when tons_sand_needed > 0", () => {
    const withSand = calculatePricing(seedEstimate, RATES);
    expect(withSand.line_items.some((li) => li.label === "Sand")).toBe(true);
    expect(withSand.line_items).toHaveLength(6);

    const noSand = calculatePricing({ ...seedEstimate, tons_sand_needed: 0 }, RATES);
    expect(noSand.line_items.some((li) => li.label === "Sand")).toBe(false);
    expect(noSand.line_items).toHaveLength(5);
  });

  it("applies markup and profit as independent percentages of subtotal, not compounded", () => {
    const result = calculatePricing(seedEstimate, RATES);
    expect(result.markup).toBe(round2(result.subtotal * (RATES.markup_pct / 100)));
    expect(result.profit).toBe(round2(result.subtotal * (RATES.profit_pct / 100)));
    expect(result.total).toBe(round2(result.subtotal + result.markup + result.profit));
  });

  it("scales linearly with rate changes (e.g. a higher excavator rate raises the total)", () => {
    const cheap = calculatePricing(seedEstimate, RATES);
    const expensive = calculatePricing(seedEstimate, { ...RATES, excavator_hr: RATES.excavator_hr + 50 });
    // +50/hr * 6 hrs = +300 subtotal, *1.35 (markup+profit+base) = +405 total
    expect(round2(expensive.total - cheap.total)).toBe(405);
  });
});

describe("calculateManualPricing", () => {
  it("flags manual_mode and derives cubic yards with a 10% overdig, per the documented formula", () => {
    const sqft = 320;
    const depthInches = 12;
    const result = calculateManualPricing(sqft, depthInches, RATES);

    const expectedCubicYards = round2((sqft * (depthInches / 12) * 1.1) / 27);
    expect(result.estimate?.cubic_yards_to_remove).toBe(expectedCubicYards);
    expect(result.manual_mode).toBe(true);
    expect(result.estimate?.tons_sand_needed).toBe(0);
    expect(result.line_items.some((li) => li.label === "Sand")).toBe(false);
  });

  it("still ties markup/profit/total back to subtotal the same way as the AI path", () => {
    const result = calculateManualPricing(320, 12, RATES);
    expect(result.markup).toBe(round2(result.subtotal * (RATES.markup_pct / 100)));
    expect(result.profit).toBe(round2(result.subtotal * (RATES.profit_pct / 100)));
    expect(result.total).toBe(round2(result.subtotal + result.markup + result.profit));
  });
});

describe("recalculateFromLineItems", () => {
  const base: AiDataJson = calculatePricing(
    {
      sqft: 320,
      avg_depth_inches: 12,
      cubic_yards_to_remove: 13.2,
      tons_gravel_needed: 8.5,
      tons_sand_needed: 0,
      labor_hours_excavator: 6,
      labor_hours_handwork: 8,
      equipment_days: 1,
      confidence_1to10: 8,
      notes: "test",
    },
    RATES
  );

  it("recomputes totals when a contractor edits a quantity on the quote detail page", () => {
    const edited = base.line_items.map((li) =>
      li.label === "Excavation labor" ? { ...li, quantity: 10 } : li
    );
    const updated = recalculateFromLineItems(edited, RATES, base);

    // Excavator hours 6 -> 10 is +4 * $125/hr = +$500 subtotal.
    expect(updated.subtotal).toBe(round2(base.subtotal + 500));
    expect(updated.markup).toBe(round2(updated.subtotal * (RATES.markup_pct / 100)));
    expect(updated.total).toBe(round2(updated.subtotal + updated.markup + updated.profit));
    expect(updated.manual_mode).toBe(false);
  });

  it("supports adding and removing line items", () => {
    const withExtra = recalculateFromLineItems(
      [...base.line_items, { label: "Sod", quantity: 50, unit: "sqft", unit_cost: 2, total: 0 }],
      RATES,
      base
    );
    expect(withExtra.line_items).toHaveLength(base.line_items.length + 1);
    expect(withExtra.subtotal).toBe(round2(base.subtotal + 100));

    const withoutFirst = recalculateFromLineItems(base.line_items.slice(1), RATES, base);
    expect(withoutFirst.line_items).toHaveLength(base.line_items.length - 1);
  });

  it("rounds to the cent correctly even where naive floating point rounds down (1.005 case)", () => {
    // 1 * 1.005 === 1.0049999999999999 in JS floating point — Math.round(...*100)/100 alone
    // would wrongly floor this to 1.00. round2's Number.EPSILON nudge must still land on 1.01.
    const updated = recalculateFromLineItems(
      [{ label: "Test", quantity: 1, unit: "ea", unit_cost: 1.005, total: 0 }],
      { ...RATES, markup_pct: 0, profit_pct: 0 },
      base
    );
    expect(updated.subtotal).toBe(1.01);
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
