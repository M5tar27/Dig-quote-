import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { AiDataJson, Company, Quote } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  logo: { width: 56, height: 56, objectFit: "cover", borderRadius: 6 },
  companyName: { fontSize: 16, fontWeight: 700 },
  quoteLabel: { fontSize: 20, fontWeight: 700, textAlign: "right", color: "#ea580c" },
  quoteMeta: { fontSize: 9, color: "#666", textAlign: "right", marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#ea580c", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  label: { color: "#666" },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  photo: { width: 110, height: 80, objectFit: "cover", borderRadius: 4 },
  table: { marginTop: 6, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 6,
    fontWeight: 700,
    backgroundColor: "#fafafa",
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f0f0f0", paddingVertical: 6 },
  colLabel: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 1, textAlign: "right" },
  colCost: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalsBox: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: "#1a1a1a",
  },
  grandTotalLabel: { fontSize: 13, fontWeight: 700 },
  grandTotalValue: { fontSize: 16, fontWeight: 700, color: "#ea580c" },
  banner: { marginTop: 14, padding: 8, backgroundColor: "#fff7ed", borderRadius: 4, fontSize: 9 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: "#888", textAlign: "center" },
});

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuotePdf({ quote, company }: { quote: Quote; company: Company }) {
  const ai = quote.ai_data_json as AiDataJson | null;
  const lineItems = ai?.line_items ?? [];
  const activeCerts = (company.certifications || []).filter(
    (c) => !c.expires_at || new Date(c.expires_at).getTime() > Date.now()
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {company.logo_url ? <Image src={company.logo_url} style={styles.logo} /> : null}
            <View>
              <Text style={styles.companyName}>{company.name}</Text>
              {company.phone ? <Text style={{ color: "#666" }}>{company.phone}</Text> : null}
              {company.email ? <Text style={{ color: "#666" }}>{company.email}</Text> : null}
              {activeCerts.length > 0 ? (
                <Text style={{ color: "#ea580c", fontSize: 8.5, marginTop: 2 }}>
                  Certified: {activeCerts.map((c) => c.title).join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
          <View>
            <Text style={styles.quoteLabel}>ESTIMATE</Text>
            <Text style={styles.quoteMeta}>#{quote.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.quoteMeta}>{new Date(quote.created_at).toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.row}>
            <Text style={{ fontWeight: 700 }}>{quote.client_name}</Text>
            <Text>{quote.phone}</Text>
          </View>
          <Text style={{ color: "#666" }}>{quote.address}</Text>
          <Text style={{ color: "#666", marginTop: 4 }}>Job type: {quote.job_type}</Text>
          {quote.notes ? <Text style={{ color: "#666" }}>Notes: {quote.notes}</Text> : null}
        </View>

        {quote.photos_urls?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Site Photos</Text>
            <View style={styles.photosGrid}>
              {quote.photos_urls.slice(0, 6).map((url, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Image key={i} src={url} style={styles.photo} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Items</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.colLabel}>Item</Text>
              <Text style={styles.colQty}>Qty</Text>
              <Text style={styles.colUnit}>Unit</Text>
              <Text style={styles.colCost}>Rate</Text>
              <Text style={styles.colTotal}>Total</Text>
            </View>
            {lineItems.map((li, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={i} style={styles.tableRow}>
                <Text style={styles.colLabel}>{li.label}</Text>
                <Text style={styles.colQty}>{li.quantity}</Text>
                <Text style={styles.colUnit}>{li.unit}</Text>
                <Text style={styles.colCost}>{money(li.unit_cost)}</Text>
                <Text style={styles.colTotal}>{money(li.total)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.label}>Subtotal</Text>
              <Text>{money(ai?.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.label}>Markup</Text>
              <Text>{money(ai?.markup)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.label}>Profit</Text>
              <Text>{money(ai?.profit)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL</Text>
              <Text style={styles.grandTotalValue}>{money(quote.total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.banner}>
          <Text>Valid 30 days from the date above.</Text>
          <Text style={{ marginTop: 3, fontWeight: 700 }}>
            AI-Generated Estimate — Verify all measurements before starting work.
          </Text>
        </View>

        {company.default_terms ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.sectionTitle}>Terms</Text>
            <Text style={{ color: "#666" }}>{company.default_terms}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Estimates are AI-generated for convenience only. Contractor must verify all
          measurements and site conditions. {company.name} is not liable for errors.
        </Text>
      </Page>
    </Document>
  );
}
