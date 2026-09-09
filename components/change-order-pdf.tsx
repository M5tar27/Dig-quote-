import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Company } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  companyName: { fontSize: 16, fontWeight: 700 },
  label: { fontSize: 20, fontWeight: 700, textAlign: "right", color: "#ea580c" },
  meta: { fontSize: 9, color: "#666", textAlign: "right", marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#ea580c", textTransform: "uppercase" },
  description: { lineHeight: 1.5 },
  priceBox: {
    marginTop: 14,
    alignSelf: "flex-end",
    width: 220,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: "#1a1a1a",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceLabel: { fontSize: 13, fontWeight: 700 },
  priceValue: { fontSize: 16, fontWeight: 700, color: "#ea580c" },
  signatureRow: { flexDirection: "row", gap: 24, marginTop: 40 },
  signatureBlock: { flex: 1 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#1a1a1a", marginTop: 30, paddingTop: 4 },
  signatureCaption: { fontSize: 8.5, color: "#666" },
  signedBanner: {
    marginTop: 10,
    padding: 8,
    borderWidth: 1.5,
    borderColor: "#16a34a",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    color: "#16a34a",
    textAlign: "center",
  },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: "#888", textAlign: "center" },
});

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ChangeOrderPdfProps {
  id: string;
  description: string;
  price: number | null;
  customerName: string | null;
  signedAt: string | null;
  createdAt: string;
  company: Pick<Company, "name" | "phone" | "email" | "default_terms">;
}

/** Pro-only: PDF for a voice-recorded Change Order, with a signature line for the customer. */
export function ChangeOrderPdf({ id, description, price, customerName, signedAt, createdAt, company }: ChangeOrderPdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.phone ? <Text style={{ color: "#666" }}>{company.phone}</Text> : null}
            {company.email ? <Text style={{ color: "#666" }}>{company.email}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>CHANGE ORDER</Text>
            <Text style={styles.meta}>#{id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.meta}>{new Date(createdAt).toLocaleDateString()}</Text>
          </View>
        </View>

        {customerName ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Text style={{ fontWeight: 700 }}>{customerName}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Change</Text>
          <Text style={styles.description}>{description || "—"}</Text>
        </View>

        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>ADDITIONAL COST</Text>
          <Text style={styles.priceValue}>{money(price)}</Text>
        </View>

        {signedAt ? (
          <View style={styles.signedBanner}>
            <Text>Approved by customer — {new Date(signedAt).toLocaleString()}</Text>
          </View>
        ) : (
          <View style={styles.signatureRow}>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Customer signature</Text>
              </View>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Date</Text>
              </View>
            </View>
          </View>
        )}

        {company.default_terms ? (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>Terms</Text>
            <Text style={{ color: "#666" }}>{company.default_terms}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          This change order adjusts the scope and price of the original estimate. Work on the change
          begins once approved. {company.name} is not liable for delays caused by change-order approval time.
        </Text>
      </Page>
    </Document>
  );
}
