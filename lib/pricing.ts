import { AiDataJson, AiEstimate, AiLineItem, CompanyRates } from "./types";

/**
 * DigQuote pricing engine.
 *
 * gravel_cost    = tons_gravel * rates.gravel_ton
 * disposal_cost  = cubic_yards * rates.disposal_yard
 * labor_cost     = (excavator_hours * rates.excavator_hr) + (handwork_hours * rates.labor_hr)
 * equipment_cost = equipment_days * rates.equipment_day
 * subtotal       = sum of the above
 * markup         = subtotal * (rates.markup_pct / 100)
 * profit         = subtotal * (rates.profit_pct / 100)
 * total          = subtotal + markup + profit
 */
export function calculatePricing(estimate: AiEstimate, rates: CompanyRates): AiDataJson {
  const gravelCost = round2(estimate.tons_gravel_needed * rates.gravel_ton);
  const disposalCost = round2(estimate.cubic_yards_to_remove * rates.disposal_yard);
  const excavatorLabor = round2(estimate.labor_hours_excavator * rates.excavator_hr);
  const handworkLabor = round2(estimate.labor_hours_handwork * rates.labor_hr);
  const equipmentCost = round2(estimate.equipment_days * rates.equipment_day);

  const lineItems: AiLineItem[] = [
    {
      label: "Excavation labor",
      quantity: estimate.labor_hours_excavator,
      unit: "hrs",
      unit_cost: rates.excavator_hr,
      total: excavatorLabor,
      is_material: false,
    },
    {
      label: "Hand labor",
      quantity: estimate.labor_hours_handwork,
      unit: "hrs",
      unit_cost: rates.labor_hr,
      total: handworkLabor,
      is_material: false,
    },
    {
      label: "Equipment (mini-excavator)",
      quantity: estimate.equipment_days,
      unit: "days",
      unit_cost: rates.equipment_day,
      total: equipmentCost,
      is_material: false,
    },
    {
      label: "Gravel",
      quantity: estimate.tons_gravel_needed,
      unit: "tons",
      unit_cost: rates.gravel_ton,
      total: gravelCost,
      is_material: true,
    },
    {
      label: "Disposal / haul-off",
      quantity: estimate.cubic_yards_to_remove,
      unit: "cu yd",
      unit_cost: rates.disposal_yard,
      total: disposalCost,
      is_material: false,
    },
  ];

  if (estimate.tons_sand_needed > 0) {
    lineItems.push({
      label: "Sand",
      quantity: estimate.tons_sand_needed,
      unit: "tons",
      unit_cost: 60,
      total: round2(estimate.tons_sand_needed * 60),
      is_material: true,
    });
  }

  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.total, 0));
  const markup = round2(subtotal * (rates.markup_pct / 100));
  const profit = round2(subtotal * (rates.profit_pct / 100));
  const total = round2(subtotal + markup + profit);

  return {
    estimate,
    line_items: lineItems,
    subtotal,
    markup,
    profit,
    total,
    ai_confidence_1to10: estimate.confidence_1to10,
    ai_notes: estimate.notes,
    manual_mode: false,
  };
}

/** Manual-mode fallback: contractor enters sqft + depth directly, no AI. */
export function calculateManualPricing(
  sqft: number,
  depthInches: number,
  rates: CompanyRates,
  notes = "Entered manually — AI estimate unavailable."
): AiDataJson {
  const cubicYards = round2((sqft * (depthInches / 12) * 1.1) / 27); // 10% overdig
  const estimate: AiEstimate = {
    sqft,
    avg_depth_inches: depthInches,
    cubic_yards_to_remove: cubicYards,
    tons_gravel_needed: round2(cubicYards * 1.4),
    tons_sand_needed: 0,
    labor_hours_excavator: round2(cubicYards / 4),
    labor_hours_handwork: round2(sqft / 200),
    equipment_days: Math.max(1, Math.ceil(cubicYards / 20)),
    confidence_1to10: 5,
    notes,
  };
  const data = calculatePricing(estimate, rates);
  data.manual_mode = true;
  return data;
}

/**
 * Recalculates subtotal/markup/profit/total from a contractor-edited set of line items.
 * Used when someone tweaks a quantity or rate on the quote detail page instead of
 * trusting the AI's numbers outright — "you stay in control" per the pricing page copy.
 */
export function recalculateFromLineItems(
  lineItems: AiLineItem[],
  rates: Pick<CompanyRates, "markup_pct" | "profit_pct">,
  base: AiDataJson
): AiDataJson {
  const normalized = lineItems.map((li) => ({
    ...li,
    quantity: Number(li.quantity) || 0,
    unit_cost: Number(li.unit_cost) || 0,
    total: round2((Number(li.quantity) || 0) * (Number(li.unit_cost) || 0)),
  }));

  const subtotal = round2(normalized.reduce((sum, li) => sum + li.total, 0));
  const markup = round2(subtotal * (rates.markup_pct / 100));
  const profit = round2(subtotal * (rates.profit_pct / 100));
  const total = round2(subtotal + markup + profit);

  return {
    ...base,
    line_items: normalized,
    subtotal,
    markup,
    profit,
    total,
    manual_mode: false,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
