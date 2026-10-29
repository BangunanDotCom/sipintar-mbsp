import React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setCsrf } from "./api";
import { Notice, Loading } from "./main";
export function CompanyInvitation() {
  const [params] = useSearchParams(),
    nav = useNavigate(),
    qc = useQueryClient();
  const token = params.get("token") || "";
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  const me = useQuery({
    queryKey: ["invitation-me"],
    queryFn: async () => {
      const r = await api("/auth/me");
      setCsrf(r.csrf);
      return r;
    },
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["company-invitation-preview", token],
    enabled: !!me.data?.user.emailVerified && /^[a-f0-9]{64}$/.test(token),
    queryFn: async () => {
      const role = me.data.roles.find((r: any) =>
        ["PEMOHON", "WAKIL_SYARIKAT"].includes(r.id),
      );
      if (!role) throw Error("Peranan pemohon aktif diperlukan.");
      await api("/auth/role", "POST", { roleId: role.id });
      return api("/company-invitations/preview", "POST", { token });
    },
    retry: false,
  });
  const next = `/jemputan-syarikat?token=${token}`;
  if (me.isPending) return <Loading />;
  return (
    <div className="container info-page">
      <div className="panel prose">
        <h1>Jemputan wakil syarikat</h1>
        <p>
          Terima jemputan hanya jika anda diberi kuasa mewakili syarikat
          tersebut. Pengesahan rasmi dokumen dibuat oleh MBSP semasa semakan
          awal permohonan.
        </p>
        {!/^[a-f0-9]{64}$/.test(token) ? (
          <Notice error>Pautan jemputan tidak sah.</Notice>
        ) : me.isError ? (
          <Link
            className="button"
            to={`/log-masuk?next=${encodeURIComponent(next)}`}
          >
            Log masuk sebagai penerima
          </Link>
        ) : !me.data.user.emailVerified ? (
          <>
            <Notice>Sahkan e-mel anda sebelum menerima jemputan.</Notice>
            <Link to="/dashboard">Urus pengesahan akaun</Link>
          </>
        ) : (
          <>
            <p>
              Akaun: <strong>{me.data.user.email}</strong>
            </p>
            {preview.isPending && <p>Memuatkan butiran jemputan…</p>}
            {preview.isError && <Notice error>{preview.error.message}</Notice>}
            {preview.data && (
              <p>
                <strong>{preview.data.companyName}</strong>
                <br />
                SSM: {preview.data.registrationNumber}
                <br />
                Kuasa: {preview.data.authorityType}
              </p>
            )}
            {error && <Notice error>{error}</Notice>}
            {message ? (
              <>
                <Notice>{message}</Notice>
                <button
                  className="button"
                  onClick={() => {
                    qc.invalidateQueries();
                    nav("/dashboard");
                  }}
                >
                  Ke dashboard
                </button>
              </>
            ) : (
              <button
                className="button"
                disabled={busy || !preview.data}
                onClick={async () => {
                  setError("");
                  setBusy(true);
                  try {
                    const role = me.data.roles.find((r: any) =>
                      ["PEMOHON", "WAKIL_SYARIKAT"].includes(r.id),
                    );
                    if (!role) throw Error("Peranan pemohon aktif diperlukan.");
                    await api("/auth/role", "POST", { roleId: role.id });
                    setMessage(
                      (
                        await api("/company-invitations/accept", "POST", {
                          token,
                        })
                      ).message,
                    );
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Sedang memproses…" : "Terima jemputan"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
