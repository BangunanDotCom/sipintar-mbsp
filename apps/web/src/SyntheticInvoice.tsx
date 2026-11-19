import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type Invoice = {
  id: string;
  unitCount: number;
  amountSen: number;
  currency: "MYR";
  status: "ISSUED" | "SETTLED" | "EXPIRED";
  providerReference: string | null;
};
const titles = {
  ISSUED: "Menunggu rekonsiliasi",
  SETTLED: "Direkonsiliasi dalam simulasi",
  EXPIRED: "Invois latihan tamat tempoh",
};
const ringgit = new Intl.NumberFormat("ms-MY", {
  style: "currency",
  currency: "MYR",
});

export function SyntheticInvoice({
  path,
  identity,
  manage = false,
}: {
  path: string;
  identity: string;
  manage?: boolean;
}) {
  const query = useQuery<{ invoice: Invoice | null }>({
    queryKey: ["synthetic-invoice", identity, path],
    queryFn: () => api(path),
    retry: false,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (!query.data || query.isError) return null;
  const invoice = query.data.invoice;
  if (!invoice && !manage) return null;

  async function next(action: "ISSUE" | "SIMULATE_SETTLEMENT") {
    setPending(true);
    setMessage("");
    try {
      await api(path, "POST", { action });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Tindakan invois gagal.",
      );
    } finally {
      await query.refetch();
      setPending(false);
    }
  }

  return (
    <section aria-label="Invois tiruan" className="panel">
      <h4>Invois tiruan</h4>
      {invoice ? (
        <>
          <p>
            {invoice.unitCount} unit fizikal × RM50 ·{" "}
            {ringgit.format(invoice.amountSen / 100)}
          </p>
          <p>{titles[invoice.status]}</p>
          {invoice.providerReference && (
            <p>
              Rujukan tiruan <code>{invoice.providerReference}</code>
            </p>
          )}
        </>
      ) : (
        <p>Invois latihan belum dijana.</p>
      )}
      <p>Simulasi sahaja. Tiada bayaran perlu dibuat.</p>
      {manage && !invoice && (
        <button
          type="button"
          className="button secondary small"
          disabled={pending}
          onClick={() => void next("ISSUE")}
        >
          Jana invois tiruan
        </button>
      )}
      {manage && invoice?.status === "ISSUED" && (
        <button
          type="button"
          className="button secondary small"
          disabled={pending}
          onClick={() => void next("SIMULATE_SETTLEMENT")}
        >
          Rekonsiliasi tiruan
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
