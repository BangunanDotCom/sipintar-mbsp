import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Bell,
  Building2,
  Users,
  MapPin,
  FileText,
  Settings,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  UserRound,
  Plus,
  Check,
  ArrowRight,
  LockKeyhole,
  Download,
  RefreshCw,
  ScrollText,
  Activity,
} from "lucide-react";
import { api, setCsrf, malaysiaTime } from "./api";
import {
  roles,
  permissions,
  templateCategories,
} from "../../../packages/shared/src/index";
import { Notice, Loading } from "./main";
import { DraftList } from "./ApplicationDraft";
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  value?: string;
};
function Form({
  fields,
  onSubmit,
  label = "Simpan",
  children,
}: {
  fields: Field[];
  onSubmit: (b: any) => Promise<any>;
  label?: string;
  children?: React.ReactNode;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<any>();
  const [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  return (
    <form
      className="data-form"
      onSubmit={handleSubmit(async (b) => {
        setMessage("");
        setError("");
        try {
          await onSubmit(b);
          setMessage("Maklumat berjaya disimpan.");
          reset();
        } catch (e: any) {
          setError(e.message);
        }
      })}
    >
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.type === "textarea" ? (
            <textarea
              {...register(f.name)}
              defaultValue={f.value}
              required={f.required !== false}
              rows={4}
            />
          ) : f.options ? (
            <select
              {...register(f.name)}
              required={f.required !== false}
              defaultValue={f.value || ""}
            >
              {f.required === false && (
                <option value="">Tiada / semua daerah</option>
              )}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              {...register(f.name)}
              defaultValue={f.value}
              type={f.type || "text"}
              required={f.required !== false}
              maxLength={f.type === "password" ? 128 : 500}
            />
          )}
        </label>
      ))}
      {children}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <button className="button" disabled={isSubmitting}>
        {isSubmitting ? "Memproses…" : label}
        <Check size={16} />
      </button>
    </form>
  );
}
function Empty({ text = "Tiada rekod untuk dipaparkan." }: { text?: string }) {
  return (
    <div className="empty-state compact">
      <FileText size={31} />
      <h3>{text}</h3>
      <p>Maklumat baharu akan dipaparkan apabila tersedia.</p>
    </div>
  );
}
function Mfa({ me, reload }: { me: any; reload: () => void }) {
  const [setup, setSetup] = React.useState<any>(),
    [codes, setCodes] = React.useState<string[]>(),
    [error, setError] = React.useState("");
  if (codes?.length)
    return (
      <div className="panel mfa">
        <ShieldCheck />
        <h2>Simpan kod pemulihan anda</h2>
        <Notice>
          Kod ini dipaparkan sekali sahaja. Simpan di lokasi selamat sebelum
          meneruskan.
        </Notice>
        <pre>{codes.join("\n")}</pre>
        <button
          className="button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([codes.join("\n")], { type: "text/plain" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "staylink-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Muat turun kod <Download size={16} />
        </button>
        <button className="button secondary" onClick={reload}>
          Saya telah menyimpan kod <ArrowRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="panel mfa">
      <LockKeyhole size={35} />
      <h2>Pengesahan dua faktor</h2>
      <p>
        Pegawai wajib menggunakan aplikasi pengesah TOTP untuk mengakses portal.
      </p>
      {error && <Notice error>{error}</Notice>}
      {!me.mfaEnrolled && !setup && (
        <button
          className="button"
          onClick={async () => {
            try {
              setSetup(await api("/auth/mfa/setup", "POST"));
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          Daftar MFA <Plus size={16} />
        </button>
      )}
      {setup && (
        <>
          <img
            src={setup.qr}
            width="220"
            height="220"
            alt="Kod QR pendaftaran TOTP"
          />
          <p>
            Kunci manual: <code className="break-word">{setup.secret}</code>
          </p>
        </>
      )}
      {(setup || me.mfaEnrolled) && (
        <Form
          fields={[{ name: "code", label: "Kod pengesah 6 digit" }]}
          label="Sahkan MFA"
          onSubmit={async (b) => {
            const result = await api("/auth/mfa/verify", "POST", b);
            if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
            else reload();
          }}
        />
      )}
      {me.mfaEnrolled && (
        <details>
          <summary>Gunakan kod pemulihan</summary>
          <Form
            fields={[{ name: "code", label: "Kod pemulihan sekali guna" }]}
            onSubmit={async (b) => {
              await api("/auth/mfa/recovery", "POST", b);
              reload();
            }}
            label="Pulihkan akses"
          />
        </details>
      )}
    </div>
  );
}
export default function Dashboard() {
  const nav = useNavigate(),
    qc = useQueryClient();
  const [tab, setTab] = React.useState("overview"),
    [error, setError] = React.useState("");
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await api("/auth/me");
      setCsrf(result.csrf);
      return result;
    },
    staleTime: 60000,
  });
  const me = meQuery.data;
  const reload = () => {
    qc.invalidateQueries();
  };
  const dash = useQuery({
    queryKey: ["dashboard", me?.activeRole, me?.mfaRequired],
    queryFn: () => api("/dashboard"),
    enabled: !!me?.activeRole && !me?.mfaRequired && me?.user?.emailVerified,
  });
  if (meQuery.isPending) return <Loading />;
  if (meQuery.isError)
    return (
      <div className="container info-page">
        <Notice error>{meQuery.error.message}</Notice>
        <Link className="button" to="/log-masuk">
          Log Masuk <ArrowRight size={16} />
        </Link>
      </div>
    );
  const actions = permissions[me.activeRole as keyof typeof permissions] || [];
  const menus = [
    ["overview", "Ringkasan", LayoutDashboard, true],
    ["profile", "Profil saya", UserRound, true],
    ["companies", "Syarikat & wakil", Building2, actions.includes("companies")],
    ["notifications", "Notifikasi", Bell, true],
    ["users", "Pengguna & pelantikan", Users, actions.includes("users.manage")],
    ["areas", "Kawasan & penugasan", MapPin, actions.includes("areas.read")],
    [
      "templates",
      "Pengurusan templat",
      FileText,
      actions.includes("templates.write"),
    ],
    [
      "config",
      "Konfigurasi",
      Settings,
      actions.some((x) => x.startsWith("config.")),
    ],
    [
      "audit",
      "Audit log",
      ScrollText,
      actions.some((x) => x.startsWith("audit.")),
    ],
    [
      "services",
      "Status perkhidmatan",
      Activity,
      actions.includes("services.read"),
    ],
    [
      "representations",
      "Pengesahan wakil",
      ShieldCheck,
      actions.includes("representation.verify"),
    ],
  ];
  return (
    <div className="dashboard">
      <aside className="dash-sidebar">
        <div className="workspace-label">RUANG KERJA STAYLINK</div>
        <div className="avatar">{me.user.name.slice(0, 1)}</div>
        <strong>{me.user.name}</strong>
        <small>{me.user.email}</small>
        {!me.mfaRequired && me.user.emailVerified && (
          <label className="role-select">
            Peranan aktif
            <select
              aria-label="Peranan aktif"
              value={me.activeRole || ""}
              onChange={async (e) => {
                try {
                  await api("/auth/role", "POST", { roleId: e.target.value });
                  setTab("overview");
                  await qc.invalidateQueries({ queryKey: ["me"] });
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <option value="" disabled>
                Pilih peranan
              </option>
              {me.roles.map((r: any, i: number) => (
                <option key={i} value={r.id}>
                  {r.label}
                  {r.districtId ? ` · ${r.districtId}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav>
          {menus
            .filter((x) => x[3])
            .map(([key, label, Icon]: any) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            try {
              await api("/auth/logout", "POST");
              qc.clear();
              nav("/log-masuk");
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <LogOut size={17} /> Log keluar
        </button>
      </aside>
      <main className="dash-main">
        <div className="dash-top">
          <span>
            Portal /{" "}
            <b>{roles[me.activeRole as keyof typeof roles] || "Akaun"}</b>
          </span>
          <span className="badge">
            <span className="dot" /> Fasa 1 · Pembangunan
          </span>
        </div>
        {error && <Notice error>{error}</Notice>}
        {!me.user.emailVerified ? (
          <div className="panel">
            <MailNotice />
            <h2>Sahkan e-mel anda</h2>
            <p>
              Buka pautan pengesahan dalam peti masuk. Akses dashboard
              memerlukan pengesahan e-mel.
            </p>
            <button
              className="button"
              onClick={async () => {
                try {
                  await api("/auth/recover", "POST", {
                    email: me.user.email,
                    type: "VERIFY_EMAIL",
                  });
                  setError("Pautan dihantar jika akaun layak.");
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Hantar semula pautan
            </button>
          </div>
        ) : me.mfaRequired ? (
          <Mfa me={me} reload={reload} />
        ) : !me.activeRole ? (
          <div className="panel">
            <h2>Pilih peranan untuk meneruskan</h2>
            <p>
              Gunakan pilihan peranan di sebelah kiri. Hanya pelantikan yang
              sedang berkuat kuasa boleh digunakan.
            </p>
          </div>
        ) : (
          <>
            <div className="dash-heading">
              <div>
                <span className="kicker">
                  {roles[me.activeRole as keyof typeof roles]}
                </span>
                <h1>
                  {tab === "overview"
                    ? `Selamat datang, ${me.user.name.split(" ")[0]}.`
                    : (menus.find((x) => x[0] === tab)?.[1] as string)}
                </h1>
                <p>
                  Urus maklumat dan perkhidmatan dalam skop pelantikan anda.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Muat semula"
                onClick={reload}
              >
                <RefreshCw size={19} />
              </button>
            </div>
            {dash.isError && <Notice error>{dash.error.message}</Notice>}
            {tab === "overview" && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span>
                      <UserRound /> Status akaun
                    </span>
                    <strong>
                      {me.user.status === "ACTIVE" ? "Aktif" : "Digantung"}
                    </strong>
                    <small>
                      <Check size={13} /> E-mel disahkan
                    </small>
                  </div>
                  <div className="stat-card">
                    <span>
                      <ShieldCheck /> Keselamatan
                    </span>
                    <strong>
                      {me.user.kind === "OFFICER"
                        ? "MFA aktif"
                        : "Akaun individu"}
                    </strong>
                    <small>Sesi dan kawalan akses backend</small>
                  </div>
                  <div className="stat-card">
                    <span>
                      <Bell /> Notifikasi belum dibaca
                    </span>
                    <strong>
                      {dash.data?.notifications.filter((n: any) => !n.readAt)
                        .length ?? "—"}
                    </strong>
                    <small>Berdasarkan rekod akaun anda</small>
                  </div>
                </div>
                {me.user.kind === "APPLICANT" && (
                  <div className="two-columns">
                    <section className="panel">
                      <h3>Profil pemohon</h3>
                      <p>
                        <strong>{me.user.name}</strong>
                        <br />
                        {me.user.email}
                        <br />
                        {me.user.phone}
                      </p>
                      <p>
                        Nombor pengenalan:{" "}
                        {me.user.identificationMasked || "Belum dilengkapkan"}
                      </p>
                      <span className="badge">
                        E-mel{" "}
                        {me.user.emailVerified ? "disahkan" : "belum disahkan"}
                      </span>
                      <p className="muted">
                        Pengesahan e-mel tidak menggantikan pengesahan dokumen
                        MBSP.
                      </p>
                      <button
                        className="button secondary small"
                        onClick={() => setTab("profile")}
                      >
                        Urus profil
                      </button>
                    </section>
                    <section className="panel">
                      <h3>Syarikat diwakili</h3>
                      {dash.data?.companies.length ? (
                        dash.data.companies.map((r: any) => (
                          <div className="company-record" key={r.id}>
                            <strong>{r.company.name}</strong>
                            <p>
                              SSM: {r.company.registrationNumber}
                              <br />
                              Profil{" "}
                              {r.company.status === "ACTIVE"
                                ? "aktif"
                                : r.company.status}{" "}
                              · Perwakilan{" "}
                              {r.status === "VERIFIED"
                                ? "disahkan"
                                : "menunggu semakan MBSP"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p>Belum ada profil syarikat.</p>
                      )}
                      <button
                        className="button secondary small"
                        onClick={() => setTab("companies")}
                      >
                        Urus syarikat
                      </button>
                    </section>
                  </div>
                )}
                {me.activeRole === "PIC_KAWASAN" && (
                  <section className="panel">
                    <h3>Kawasan seliaan</h3>
                    {dash.data?.areaAssignments.length ? (
                      dash.data.areaAssignments.map((a: any) => (
                        <p key={a.id}>
                          {a.area.name} · {a.area.district.name}
                        </p>
                      ))
                    ) : (
                      <Empty text="Belum ada kawasan ditugaskan." />
                    )}
                  </section>
                )}
                {["PERANCANG_BANDAR", "KEJURUTERAAN"].includes(
                  me.activeRole,
                ) && (
                  <Notice>
                    Ruang jabatan teknikal tersedia. Rujukan serentak dan ulasan
                    mengikut unit/tingkat akan dilaksanakan dalam fasa
                    seterusnya.
                  </Notice>
                )}
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Ruang perkhidmatan</h3>
                    <span className="phase-tag">FASA SETERUSNYA</span>
                  </div>
                  <div className="module-grid">
                    {[
                      "Permohonan",
                      "Pembetulan",
                      "Bil dan bayaran",
                      "Dokumen & surat keputusan",
                      ...(me.user.kind === "OFFICER"
                        ? ["AI Pre-Check", "KP-PPTT"]
                        : []),
                    ].map((x) => (
                      <Link
                        key={x}
                        to={
                          x === "Permohonan" &&
                          actions.includes("applications.draft")
                            ? "/permohonan/baharu"
                            : "/modul/permohonan"
                        }
                      >
                        <FileText size={21} />
                        <strong>{x}</strong>
                        <small>
                          {x === "Permohonan" &&
                          actions.includes("applications.draft")
                            ? "Mulakan dan simpan draf PPTT"
                            : "Akan Tersedia Dalam Fasa Seterusnya"}
                        </small>
                      </Link>
                    ))}
                  </div>
                </section>
                {actions.includes("applications.draft") ? (
                  <>
                    <Link className="button" to="/permohonan/baharu">
                      Permohonan Baharu <Plus size={16} />
                    </Link>
                    <DraftList userId={me.user.id} />
                  </>
                ) : (
                  <section className="panel">
                    <h3>Rekod permohonan</h3>
                    <Empty text="Modul penghantaran permohonan belum tersedia." />
                  </section>
                )}
              </>
            )}
            {tab === "profile" && (
              <div className="two-columns">
                <section className="panel">
                  <h3>Maklumat peribadi</h3>
                  {me.user.kind === "APPLICANT" && (
                    <>
                      <p>
                        Nombor pengenalan:{" "}
                        <strong>
                          {me.user.identificationMasked || "Belum dilengkapkan"}
                        </strong>
                      </p>
                      {!me.user.identificationMasked && (
                        <details>
                          <summary>
                            Lengkapkan nombor pengenalan akaun sedia ada
                          </summary>
                          <Form
                            fields={[
                              {
                                name: "identificationNumber",
                                label: "Nombor pengenalan (MyKad / pasport)",
                              },
                              {
                                name: "currentPassword",
                                label: "Kata laluan semasa",
                                type: "password",
                              },
                            ]}
                            onSubmit={async (b) => {
                              await api("/profile/identification", "POST", b);
                              reload();
                            }}
                          />
                        </details>
                      )}
                    </>
                  )}

                  <Form
                    key={me.user.name + me.user.phone}
                    fields={[
                      {
                        name: "name",
                        label: "Nama penuh",
                        value: me.user.name,
                      },
                      {
                        name: "phone",
                        label: "Nombor telefon",
                        type: "tel",
                        value: me.user.phone,
                      },
                    ]}
                    onSubmit={async (b) => {
                      await api("/profile", "PATCH", b);
                      reload();
                    }}
                  />
                  <p className="muted">E-mel: {me.user.email} · Disahkan</p>
                </section>
                <section className="panel">
                  <h3>Tukar kata laluan</h3>
                  <Form
                    fields={[
                      {
                        name: "currentPassword",
                        label: "Kata laluan semasa",
                        type: "password",
                      },
                      {
                        name: "password",
                        label:
                          "Kata laluan baharu (12+ aksara, besar, kecil, nombor, simbol)",
                        type: "password",
                      },
                    ]}
                    onSubmit={async (b) => {
                      await api("/auth/password", "POST", b);
                      qc.clear();
                      nav("/log-masuk");
                    }}
                  />
                  <p className="muted">
                    Penukaran kata laluan menamatkan semua sesi aktif.
                  </p>
                </section>
              </div>
            )}
            {tab === "notifications" && (
              <section className="panel">
                <h3>Pusat notifikasi</h3>
                {dash.data?.notifications.length ? (
                  dash.data.notifications.map((n: any) => (
                    <div
                      className={`notification ${n.readAt ? "read" : ""}`}
                      key={n.id}
                    >
                      <Bell size={19} />
                      <div>
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        <small>{malaysiaTime(n.createdAt)}</small>
                      </div>
                      {!n.readAt && (
                        <button
                          className="button secondary small"
                          onClick={async () => {
                            try {
                              await api(`/notifications/${n.id}/read`, "POST");
                              reload();
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          Tanda dibaca
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty />
                )}
              </section>
            )}
            {tab === "companies" && <Companies />}
            {tab === "users" && <UsersPanel />}
            {tab === "areas" && <Areas actions={actions} />}
            {tab === "templates" && <Templates />}
            {tab === "config" && (
              <Config
                scope={
                  actions.includes("config.technical")
                    ? "technical"
                    : "operations"
                }
              />
            )}
            {tab === "audit" && <Audit />}
            {tab === "services" && <ServiceStatus />}
            {tab === "representations" && <Representations />}
          </>
        )}
      </main>
    </div>
  );
}
function MailNotice() {
  return <Bell size={32} />;
}
const companyFields: Field[] = [
  { name: "name", label: "Nama syarikat" },
  { name: "registrationNumber", label: "Nombor pendaftaran SSM" },
  { name: "address", label: "Alamat berdaftar", type: "textarea" },
  { name: "phone", label: "Telefon syarikat", type: "tel" },
  { name: "email", label: "E-mel syarikat", type: "email" },
  {
    name: "authorityType",
    label: "Jenis kuasa perwakilan",
    options: [
      { value: "PENGARAH", label: "Pengarah" },
      { value: "PEKERJA", label: "Pekerja" },
      { value: "WAKIL_DIBERI_KUASA", label: "Wakil diberi kuasa" },
    ],
  },
  {
    name: "endsAt",
    label: "Tamat kuasa (pilihan)",
    type: "date",
    required: false,
  },
];
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
function useResource(path: string) {
  return useQuery({ queryKey: [path], queryFn: () => api(path) });
}
function ResourceState({
  query,
  children,
}: {
  query: any;
  children: (data: any) => React.ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <Notice error>{query.error.message}</Notice>;
  return <>{children(query.data)}</>;
}
function CompanyRepresentatives({ companyId }: { companyId: string }) {
  const q = useResource(`/companies/${companyId}/representatives`);
  return (
    <details>
      <summary>Senarai wakil syarikat</summary>
      <ResourceState query={q}>
        {(data) =>
          data.map((r: any) => (
            <p key={r.id}>
              <strong>{r.user.name}</strong> · {r.authorityType}
              <br />
              <small>
                {r.status === "VERIFIED"
                  ? "Perwakilan disahkan"
                  : "Perwakilan menunggu semakan MBSP"}
                {r.endsAt ? ` · Tamat: ${malaysiaTime(r.endsAt)}` : ""}
              </small>
            </p>
          ))
        }
      </ResourceState>
    </details>
  );
}
function Companies() {
  const q = useResource("/companies"),
    refresh = useRefresh(),
    [error, setError] = React.useState("");
  return (
    <>
      <section className="panel">
        <h3>Syarikat yang diwakili</h3>
        <p>
          Profil aktif selepas pengesahan akaun. Pengesahan rasmi maklumat
          syarikat dan surat kuasa dibuat oleh pegawai MBSP semasa semakan awal
          permohonan.
        </p>
        {error && <Notice error>{error}</Notice>}
        <ResourceState query={q}>
          {(data) =>
            data.length ? (
              data.map((r: any) => (
                <article className="company-record" key={r.id}>
                  <div className="panel-heading">
                    <div>
                      <h3>{r.company.name}</h3>
                      <p>SSM: {r.company.registrationNumber}</p>
                    </div>
                    <span className="badge">
                      Akaun{" "}
                      {r.company.status === "ACTIVE"
                        ? "Aktif"
                        : r.company.status}
                    </span>
                  </div>
                  <div className="status-line">
                    <span>
                      Maklumat:{" "}
                      {r.company.informationStatus === "UNVERIFIED"
                        ? "Belum disahkan"
                        : r.company.informationStatus}
                    </span>
                    <span>
                      Perwakilan:{" "}
                      {r.status === "VERIFIED"
                        ? "Disahkan"
                        : r.status === "UNVERIFIED"
                          ? "Belum disahkan"
                          : "Dokumen perlu dikemas kini"}
                    </span>
                  </div>
                  <p>{r.company.address}</p>
                  <small>
                    Kuasa: {r.authorityType}{" "}
                    {r.endsAt ? ` · Tamat: ${malaysiaTime(r.endsAt)}` : ""}
                  </small>
                  <details>
                    <summary>Kemas kini maklumat syarikat</summary>
                    <Form
                      fields={companyFields
                        .filter((f) =>
                          ["name", "address", "phone", "email"].includes(
                            f.name,
                          ),
                        )
                        .map((f) => ({ ...f, value: r.company[f.name] }))}
                      onSubmit={async (b) => {
                        await api(`/companies/${r.companyId}`, "PATCH", b);
                        refresh();
                      }}
                    />
                  </details>
                  <details>
                    <summary>Surat kuasa & dokumen</summary>
                    <p>
                      PDF maksimum 2 MB. Dokumen disimpan secara peribadi dan
                      dimuat turun sebagai lampiran.
                    </p>
                    <label>
                      Muat naik surat kuasa
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            if (file.size > 2 * 1024 * 1024)
                              throw Error("Saiz maksimum ialah 2 MB.");
                            const base64 = await new Promise<string>(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () =>
                                  resolve(String(reader.result).split(",")[1]);
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                              },
                            );
                            await api(
                              `/companies/${r.companyId}/documents`,
                              "POST",
                              { fileName: file.name, content: base64 },
                            );
                            refresh();
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      />
                    </label>
                    {r.company.documents.map((d: any) => (
                      <p key={d.id}>
                        <a href={`/api/documents/${d.id}`} download>
                          {d.fileName}
                        </a>{" "}
                        <span className="badge">{d.status}</span>
                      </p>
                    ))}
                  </details>
                  <CompanyRepresentatives companyId={r.companyId} />
                  {(r.canManageRepresentatives || r.status === "VERIFIED") && (
                    <details>
                      <summary>Jemput wakil syarikat</summary>
                      <p>
                        Penerima mesti mempunyai akaun pemohon yang telah
                        disahkan. Jemputan memerlukan penerimaan pemegang akaun
                        tersebut.
                      </p>
                      <Form
                        fields={[
                          {
                            name: "email",
                            label: "E-mel akaun pemohon yang disahkan",
                            type: "email",
                          },
                          companyFields[5],
                        ]}
                        onSubmit={async (b) => {
                          await api(
                            `/companies/${r.companyId}/invitations`,
                            "POST",
                            b,
                          );
                          refresh();
                        }}
                      />
                    </details>
                  )}
                </article>
              ))
            ) : (
              <Empty text="Belum ada syarikat yang diwakili." />
            )
          }
        </ResourceState>
      </section>
      <section className="panel">
        <h3>Daftar profil syarikat</h3>
        <p>
          Satu akaun individu boleh mewakili beberapa syarikat. Nombor SSM sedia
          ada memerlukan penyelesaian melalui bantuan, bukan akses automatik.
        </p>
        <Form
          fields={companyFields}
          label="Tambah Syarikat"
          onSubmit={async (b) => {
            if (b.endsAt) b.endsAt = new Date(b.endsAt).toISOString();
            else delete b.endsAt;
            await api("/companies", "POST", b);
            refresh();
          }}
        />
      </section>
    </>
  );
}
const roleOptions = Object.entries(roles)
  .filter(([id]) => !["PEMOHON", "WAKIL_SYARIKAT"].includes(id))
  .map(([value, label]) => ({ value, label }));
const districtOptions = ["SPU", "SPT", "SPS"].map((value) => ({
  value,
  label: value,
}));
const appointmentFields: Field[] = [
  { name: "roleId", label: "Peranan", options: roleOptions },
  {
    name: "departmentId",
    label: "Jabatan",
    options: [
      { value: "BANGUNAN", label: "Jabatan Bangunan" },
      { value: "PERANCANG", label: "Jabatan Perancang Bandar" },
      { value: "KEJURUTERAAN", label: "Jabatan Kejuruteraan" },
      { value: "ICT", label: "Bahagian ICT" },
    ],
  },
  {
    name: "districtId",
    label: "Skop daerah (kosong: semua)",
    options: districtOptions,
    required: false,
  },
  { name: "reference", label: "Rujukan pelantikan rasmi" },
  { name: "startsAt", label: "Tarikh kuat kuasa", type: "date" },
  {
    name: "endsAt",
    label: "Tarikh tamat (pilihan)",
    type: "date",
    required: false,
  },
];
function appointmentBody(b: any) {
  const result = { ...b };
  for (const k of ["startsAt", "endsAt"])
    if (result[k]) result[k] = new Date(result[k]).toISOString();
    else delete result[k];
  if (!result.districtId) delete result.districtId;
  return result;
}
function UsersPanel() {
  const q = useResource("/admin/users"),
    refresh = useRefresh();
  const [error, setError] = React.useState("");
  const [action, setAction] = React.useState<{
    user: any;
    kind: string;
  } | null>(null);
  return (
    <>
      <section className="panel">
        <h3>Pengguna & pelantikan</h3>
        <Notice>
          Akaun pegawai hanya melalui jemputan. Tiada kata laluan dihantar
          melalui e-mel.
        </Notice>
        {error && <Notice error>{error}</Notice>}
        <ResourceState query={q}>
          {(data) => (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nama / E-mel</th>
                    <th>Jenis</th>
                    <th>Status</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u: any) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                        <details>
                          <summary>Pelantikan ({u.roles.length})</summary>
                          {u.roles.map((a: any) => (
                            <div className="appointment" key={a.id}>
                              <strong>
                                {roles[a.roleId as keyof typeof roles]}
                              </strong>
                              <small>
                                {a.status} · {a.districtId || "Semua daerah"} ·{" "}
                                {a.reference}
                              </small>
                              <small>
                                {malaysiaTime(a.startsAt)} —{" "}
                                {a.endsAt
                                  ? malaysiaTime(a.endsAt)
                                  : "Tiada tamat"}
                              </small>
                              {a.status === "ACTIVE" && (
                                <button
                                  className="text-button danger"
                                  onClick={() =>
                                    setAction({
                                      user: { ...u, appointmentId: a.id },
                                      kind: "revoke",
                                    })
                                  }
                                >
                                  Tamatkan pelantikan
                                </button>
                              )}
                            </div>
                          ))}
                        </details>
                      </td>
                      <td>{u.kind === "OFFICER" ? "Pegawai" : "Pemohon"}</td>
                      <td>
                        <span className="badge">{u.status}</span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() =>
                              setAction({ user: u, kind: "status" })
                            }
                          >
                            Status
                          </button>
                          {u.kind === "OFFICER" && (
                            <>
                              <button
                                onClick={() =>
                                  setAction({ user: u, kind: "role" })
                                }
                              >
                                Lantik peranan
                              </button>
                              <button
                                onClick={() =>
                                  setAction({ user: u, kind: "mfa" })
                                }
                              >
                                Pulih MFA
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ResourceState>
      </section>
      {action && (
        <section className="panel action-panel">
          <div className="panel-heading">
            <h3>
              {action.kind === "status"
                ? "Ubah status"
                : action.kind === "role"
                  ? "Pelantikan peranan"
                  : action.kind === "revoke"
                    ? "Tamatkan pelantikan"
                    : "Pemulihan MFA"}
              : {action.user.name}
            </h3>
            <button onClick={() => setAction(null)} className="text-button">
              Tutup
            </button>
          </div>
          {action.kind === "role" ? (
            <Form
              fields={appointmentFields}
              onSubmit={async (b) => {
                await api(
                  `/admin/users/${action.user.id}/roles`,
                  "POST",
                  appointmentBody(b),
                );
                refresh();
                setAction(null);
              }}
            />
          ) : action.kind === "revoke" ? (
            <>
              <Notice>
                Pelantikan ditamatkan dan sesi pengguna akan dibatalkan.
              </Notice>
              <button
                className="button"
                onClick={async () => {
                  try {
                    await api(
                      `/admin/appointments/${action.user.appointmentId}`,
                      "DELETE",
                    );
                    refresh();
                    setAction(null);
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Tamatkan pelantikan
              </button>
            </>
          ) : (
            <Form
              fields={[
                ...(action.kind === "status"
                  ? [
                      {
                        name: "status",
                        label: "Status baharu",
                        options: [
                          { value: "ACTIVE", label: "Aktif" },
                          { value: "SUSPENDED", label: "Digantung" },
                        ],
                      },
                    ]
                  : []),
                {
                  name: "reason",
                  label:
                    "Sebab / rujukan pengesahan identiti (minimum 10 aksara)",
                  type: "textarea",
                },
              ]}
              onSubmit={async (b) => {
                await api(
                  `/admin/users/${action.user.id}/${action.kind === "status" ? "status" : "mfa-reset"}`,
                  action.kind === "status" ? "PATCH" : "POST",
                  b,
                );
                refresh();
                setAction(null);
              }}
            />
          )}
        </section>
      )}
      <section className="panel">
        <h3>Jemput pegawai baharu</h3>
        <Form
          fields={[
            { name: "name", label: "Nama pegawai ujian" },
            { name: "email", label: "E-mel rasmi", type: "email" },
            { name: "phone", label: "Telefon", type: "tel" },
            ...appointmentFields,
          ]}
          label="Hantar Jemputan"
          onSubmit={async (b) => {
            await api("/admin/officers", "POST", appointmentBody(b));
            refresh();
          }}
        />
      </section>
    </>
  );
}
function Areas({ actions }: { actions: string[] }) {
  const q = useResource("/areas"),
    canAssign = actions.includes("areas.assign"),
    canWrite = actions.includes("areas.write"),
    refresh = useRefresh();
  const pics = useQuery({
    queryKey: ["pics"],
    queryFn: () => api("/areas/pics"),
    enabled: canAssign,
  });
  return (
    <>
      <section className="panel">
        <h3>Kawasan seliaan & sejarah penugasan</h3>
        <ResourceState query={q}>
          {(data) =>
            data.length ? (
              data.map((a: any) => (
                <article className="company-record" key={a.id}>
                  <h3>
                    {a.name} <span className="badge">{a.districtId}</span>
                  </h3>
                  {a.assignments.length ? (
                    a.assignments.map((s: any) => (
                      <p key={s.id}>
                        <strong>
                          {pics.data?.find((p: any) => p.id === s.userId)
                            ?.name || s.userId}
                        </strong>
                        <small>
                          {" "}
                          · {malaysiaTime(s.startsAt)} —{" "}
                          {s.endsAt ? malaysiaTime(s.endsAt) : "Aktif"}
                        </small>
                        <br />
                        {s.reason}
                      </p>
                    ))
                  ) : (
                    <Notice>
                      PERLU PENENTUAN PPSK — Tiada PIC ditugaskan.
                    </Notice>
                  )}
                </article>
              ))
            ) : (
              <Empty text="Tiada kawasan dikonfigurasi." />
            )
          }
        </ResourceState>
      </section>
      {canWrite && (
        <section className="panel">
          <h3>Tambah kawasan</h3>
          <Form
            fields={[
              { name: "name", label: "Nama kawasan" },
              { name: "districtId", label: "Daerah", options: districtOptions },
            ]}
            onSubmit={async (b) => {
              await api("/areas", "POST", b);
              refresh();
            }}
          />
        </section>
      )}
      {canAssign && (
        <section className="panel">
          <h3>Penugasan / penugasan semula PIC</h3>
          {pics.isError && <Notice error>{pics.error.message}</Notice>}
          <Form
            fields={[
              {
                name: "areaId",
                label: "Kawasan",
                options: (q.data || []).map((a: any) => ({
                  value: a.id,
                  label: `${a.name} (${a.districtId})`,
                })),
              },
              {
                name: "userId",
                label: "PIC dengan pelantikan aktif",
                options: (pics.data || []).map((p: any) => ({
                  value: p.id,
                  label: p.name,
                })),
              },
              {
                name: "reason",
                label: "Sebab penugasan (minimum 10 aksara)",
                type: "textarea",
              },
            ]}
            onSubmit={async (b) => {
              await api("/areas/assign", "POST", b);
              refresh();
            }}
          />
        </section>
      )}
    </>
  );
}
function Templates() {
  const q = useResource("/templates"),
    refresh = useRefresh(),
    [error, setError] = React.useState("");
  return (
    <>
      <Notice>
        Daftar, versi dan pengaktifan format induk sahaja. Penjanaan DOCX/PDF
        dan editor lanjutan belum tersedia.
      </Notice>
      <section className="panel">
        <h3>Daftar templat berpusat</h3>
        {error && <Notice error>{error}</Notice>}
        <ResourceState query={q}>
          {(data) =>
            data.map((t: any) => (
              <details key={t.id} className="template-record">
                <summary>
                  {t.name}{" "}
                  <span className="badge">{t.versions.length} versi</span>
                </summary>
                <p>Kategori: {t.category}</p>
                {t.versions.map((v: any) => (
                  <div key={v.id} className="version">
                    <span>
                      Versi {v.version} · {v.status}
                    </span>
                    <pre>{v.content}</pre>
                    {v.status !== "ACTIVE" && (
                      <button
                        className="button small secondary"
                        onClick={async () => {
                          try {
                            await api(
                              `/template-versions/${v.id}/activate`,
                              "POST",
                            );
                            refresh();
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        Aktifkan format induk
                      </button>
                    )}
                  </div>
                ))}
                <Form
                  fields={[
                    {
                      name: "content",
                      label: "Kandungan versi baharu",
                      type: "textarea",
                    },
                  ]}
                  label="Simpan Versi Baharu"
                  onSubmit={async (b) => {
                    await api(`/templates/${t.id}/versions`, "POST", b);
                    refresh();
                  }}
                />
              </details>
            ))
          }
        </ResourceState>
      </section>
      <section className="panel">
        <h3>Cipta templat</h3>
        <Form
          fields={[
            { name: "name", label: "Nama templat" },
            {
              name: "category",
              label: "Kategori",
              options: templateCategories.map((value) => ({
                value,
                label: value,
              })),
            },
            { name: "content", label: "Kandungan draf", type: "textarea" },
          ]}
          onSubmit={async (b) => {
            await api("/templates", "POST", b);
            refresh();
          }}
        />
      </section>
    </>
  );
}
function Config({ scope }: { scope: string }) {
  const q = useResource(`/config/${scope}`),
    refresh = useRefresh();
  return (
    <>
      <section className="panel">
        <h3>Konfigurasi {scope === "technical" ? "teknikal" : "operasi"}</h3>
        <Notice>
          Nilai dalam daftar ini tidak mengubah polisi keselamatan atau
          mengaktifkan integrasi. Pelaksanaan polisi memerlukan perubahan kod
          yang disemak.
        </Notice>
        <ResourceState query={q}>
          {(data) =>
            data.length ? (
              data.map((c: any) => (
                <div className="company-record" key={c.key}>
                  <strong>{c.key}</strong>
                  <p>{JSON.stringify(c.value)}</p>
                  <details>
                    <summary>Sejarah versi</summary>
                    {c.versions.map((v: any) => (
                      <p key={v.id}>
                        {malaysiaTime(v.createdAt)} · {JSON.stringify(v.value)}{" "}
                        · {v.reason}
                      </p>
                    ))}
                  </details>
                </div>
              ))
            ) : (
              <Empty />
            )
          }
        </ResourceState>
      </section>
      <section className="panel">
        <h3>Simpan konfigurasi berversi</h3>
        <Form
          fields={[
            { name: "key", label: "Kunci (contoh: sla.review_days)" },
            { name: "value", label: "Nilai" },
            { name: "reason", label: "Sebab perubahan", type: "textarea" },
          ]}
          onSubmit={async (b) => {
            await api(`/config/${scope}`, "POST", b);
            refresh();
          }}
        />
      </section>
    </>
  );
}
function Audit() {
  const q = useResource("/audit");
  return (
    <section className="panel">
      <h3>Audit log · 100 rekod terkini mengikut skop</h3>
      <ResourceState query={q}>
        {(data) =>
          data.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Masa Malaysia</th>
                    <th>Tindakan</th>
                    <th>Peranan</th>
                    <th>Sasaran / keputusan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a: any) => (
                    <tr key={a.id}>
                      <td>{malaysiaTime(a.createdAt)}</td>
                      <td>
                        {a.action}
                        <small>{a.actorId || "Tanpa identiti"}</small>
                      </td>
                      <td>{a.activeRole || "—"}</td>
                      <td>
                        {a.target || "—"}
                        <small>{a.outcome}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )
        }
      </ResourceState>
    </section>
  );
}
function ServiceStatus() {
  const q = useResource("/admin/services");
  return (
    <section className="panel">
      <h3>Status perkhidmatan sebenar</h3>
      <ResourceState query={q}>
        {(data) => (
          <>
            <p>
              PostgreSQL: <span className="badge">{data.database}</span>
            </p>
            <h4>Log penghantaran e-mel</h4>
            {data.email.map((e: any) => (
              <p key={e.status}>
                {e.status}: {e._count}
              </p>
            ))}
            <h4>Integrasi</h4>
            {Object.entries(data.integrations).map(([k, v]: any) => (
              <p key={k}>
                {k}: <span className="badge">{v}</span>
              </p>
            ))}
          </>
        )}
      </ResourceState>
    </section>
  );
}
function Representations() {
  const q = useResource("/representations"),
    refresh = useRefresh();
  return (
    <section className="panel">
      <h3>Pengesahan perwakilan</h3>
      <ResourceState query={q}>
        {(data) =>
          data.length ? (
            data.map((r: any) => (
              <article className="company-record" key={r.id}>
                <h3>
                  {r.company.name} · {r.user.name}
                </h3>
                <p>
                  Status: {r.status} · {r.company.documents.length} dokumen
                </p>
                {r.company.documents.map((d: any) => (
                  <p key={d.id}>
                    <a href={`/api/representation-documents/${d.id}`} download>
                      {d.fileName}
                    </a>
                  </p>
                ))}
                <Notice>
                  Semak dokumen asal melalui proses yang dibenarkan. Pautan
                  permohonan mengikut kawasan akan diperkenalkan dalam Fasa 2.
                </Notice>
                <Form
                  fields={[
                    {
                      name: "status",
                      label: "Keputusan",
                      options: [
                        { value: "VERIFIED", label: "Disahkan" },
                        {
                          value: "DOCUMENT_UPDATE_REQUIRED",
                          label: "Dokumen perlu dikemas kini",
                        },
                      ],
                    },
                    {
                      name: "reason",
                      label: "Sebab / rujukan semakan",
                      type: "textarea",
                    },
                  ]}
                  onSubmit={async (b) => {
                    await api(`/representations/${r.id}/verify`, "POST", b);
                    refresh();
                  }}
                />
              </article>
            ))
          ) : (
            <Empty />
          )
        }
      </ResourceState>
    </section>
  );
}
