export type JobType =
  | "Patio"
  | "Driveway"
  | "Trench"
  | "Grading"
  | "Pool Dig"
  | "Demolition"
  | "Other";

export type QuoteStatus = "draft" | "sent" | "won" | "lost";

export type UserRole = "admin" | "estimator";

export interface CompanyRates {
  excavator_hr: number;
  labor_hr: number;
  markup_pct: number;
  profit_pct: number;
  gravel_ton: number;
  disposal_yard: number;
  equipment_day: number;
}

export const DEFAULT_RATES: CompanyRates = {
  excavator_hr: 125,
  labor_hr: 55,
  markup_pct: 20,
  profit_pct: 15,
  gravel_ton: 150,
  disposal_yard: 45,
  equipment_day: 450,
};

export interface Certification {
  id: string;
  title: string;
  issuer: string | null;
  cert_number: string | null;
  completion_date: string | null; // ISO date
  expires_at: string | null; // ISO date, null = doesn't expire
  file_url: string;
}

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  owner_id: string;
  phone: string | null;
  email: string | null;
  default_terms: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | "none";
  trial_ends_at: string | null;
  rates_json: CompanyRates;
  certifications: Certification[];
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

export interface AiLineItem {
  label: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
  /** True for physical materials a crew orders/installs (gravel, sand, etc.) —
   * false/undefined for labor, equipment, and disposal line items. Drives which
   * items get auto-seeded into job_materials when a quote is approved. */
  is_material?: boolean;
}

export type MaterialStatus = "needed" | "ordered" | "delivered" | "installed";

export interface JobMaterial {
  id: string;
  quote_id: string;
  company_id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  status: MaterialStatus;
  created_at: string;
  updated_at: string;
}

export interface AiEstimate {
  sqft: number;
  avg_depth_inches: number;
  cubic_yards_to_remove: number;
  tons_gravel_needed: number;
  tons_sand_needed: number;
  labor_hours_excavator: number;
  labor_hours_handwork: number;
  equipment_days: number;
  confidence_1to10: number;
  notes: string;
}

export interface AiDataJson {
  estimate: AiEstimate | null;
  line_items: AiLineItem[];
  subtotal: number;
  markup: number;
  profit: number;
  total: number;
  ai_confidence_1to10: number;
  ai_notes: string;
  manual_mode: boolean;
  raw_response?: string;
}

export interface Quote {
  id: string;
  company_id: string;
  created_by: string;
  client_name: string;
  address: string;
  phone: string;
  client_email: string | null;
  job_type: JobType;
  notes: string | null;
  photos_urls: string[];
  status: QuoteStatus;
  ai_data_json: AiDataJson | null;
  total: number | null;
  pdf_url: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
}
