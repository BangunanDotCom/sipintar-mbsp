import React from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  Link2,
  ShieldCheck,
  MapPin,
  FilePlus2,
  Search,
  FilePenLine,
  CreditCard,
  Files,
  BookOpen,
  ChevronDown,
  Mail,
  Phone,
  Menu,
  X,
  CheckCircle2,
  LockKeyhole,
  Globe,
  Layers3,
  UserRound,
  ChevronRight,
} from "lucide-react";
import { api, setCsrf } from "./api";
import { registerSchema } from "../../../packages/shared/src/index";
import Dashboard from "./Dashboard";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
export function Logo() {
  return (
    <Link className="brand" to="/" aria-label="STAYLink MBSP, halaman utama">
      <span className="brand-icon">
        <Building2 size={28} />
        <Link2 className="link-mark" size={18} />
      </span>
      <span>
        <strong>
          STAY<span>Link</span> <small>MBSP</small>
        </strong>
        <em>Smart Temporary Accommodation Link</em>
      </span>
    </Link>
  );
}
function Header() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="official">
        <div className="container">
          <span>
            <span className="dot" /> Portal pembangunan • Jabatan Bangunan, MBSP
          </span>
          <span>
            Bahasa Melayu <Globe size={12} />
          </span>
        </div>
      </div>
      <header>
        <div className="container header-inner">
          <Logo />
          <button
            className="icon-button mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Buka menu"
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav className={open ? "open" : ""} onClick={() => setOpen(false)}>
            <Link className="nav-active" to="/">
              Utama
            </Link>
            <Link to="/panduan">Panduan</Link>
            <Link to="/status">Semak Status</Link>
            <Link to="/log-masuk" className="login-link">
              Log Masuk <ArrowUpRight size={15} />
            </Link>
            <Link to="/daftar" className="button small">
              Permohonan Baharu <ArrowRight size={15} />
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
function City() {
  return (
    <div className="city-wrap" aria-hidden="true">
      <svg className="city" viewBox="0 0 650 500" fill="none">
        <defs>
          <linearGradient id="tower" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#225ca0" />
            <stop offset="1" stopColor="#0d2446" />
          </linearGradient>
          <linearGradient id="side">
            <stop stopColor="#0a1e3c" />
            <stop offset="1" stopColor="#143f70" />
          </linearGradient>
          <linearGradient id="ground">
            <stop stopColor="#183e68" stopOpacity=".6" />
            <stop offset="1" stopColor="#0a2044" stopOpacity=".2" />
          </linearGradient>
          <pattern
            id="windows"
            width="17"
            height="23"
            patternUnits="userSpaceOnUse"
          >
            <rect
              x="5"
              y="4"
              width="5"
              height="11"
              rx="1"
              fill="#54d1fa"
              opacity=".55"
            />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <ellipse
          cx="325"
          cy="420"
          rx="280"
          ry="66"
          fill="#13598d"
          opacity=".12"
        />
        <g stroke="#2683c3" opacity=".2">
          <path d="M20 400L320 240L630 410L330 550Z" fill="url(#ground)" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path
              key={i}
              d={`M${25 + i * 42} ${400 + i * 22}L${325 + i * 42} ${240 + i * 22} M${25 + i * 45} ${400 - i * 24}L${335 + i * 45} ${570 - i * 24}`}
            />
          ))}
        </g>
        <g>
          <path
            d="M118 374V219L188 179L254 217V375L188 415Z"
            fill="url(#tower)"
            stroke="#3785bd"
          />
          <path d="M188 179V415L254 375V217Z" fill="url(#side)" />
          <path d="M128 227L180 197V392L128 363Z" fill="url(#windows)" />
          <path d="M118 219L188 259L254 217M188 259V415" stroke="#3677ac" />
        </g>
        <g>
          <path
            d="M258 384V120L340 73L421 119V383L340 430Z"
            fill="url(#tower)"
            stroke="#52b0db"
          />
          <path d="M340 73V430L421 383V119Z" fill="url(#side)" />
          <path d="M268 128L331 91V406L268 371Z" fill="url(#windows)" />
          <path
            d="M352 143L408 111V371L352 403Z"
            fill="url(#windows)"
            opacity=".5"
          />
          <path
            d="M258 120L340 167L421 119M340 167V430M284 105V87L338 57L393 87V104"
            stroke="#5cc5ee"
          />
          <path d="M338 57V25" stroke="#5cc5ee" />
          <circle cx="338" cy="25" r="4" fill="#00c896" />
          <path
            d="M258 172L340 219L421 171M258 286L340 333L421 285"
            stroke="#3dd6ff"
            opacity=".6"
          />
        </g>
        <g>
          <path
            d="M442 395V242L497 211L554 242V395L497 427Z"
            fill="url(#tower)"
            stroke="#357bab"
          />
          <path d="M497 211V427L554 395V242Z" fill="url(#side)" />
          <path d="M452 252L489 231V408L452 387Z" fill="url(#windows)" />
          <path d="M442 242L497 274L554 242" stroke="#3c87b3" />
        </g>
        <g stroke="#00c896" strokeWidth="2">
          <path d="M72 391L72 339L105 320M400 435L457 466L590 390V323" />
          <path d="M223 441L264 465L321 434" />
          <circle cx="72" cy="339" r="4" fill="#00c896" />
          <circle cx="590" cy="323" r="4" fill="#00c896" />
          <circle cx="264" cy="465" r="4" fill="#00c896" />
        </g>
        <g stroke="#3dd6ff" opacity=".45" strokeDasharray="4 7">
          <path d="M188 163V107L290 48M432 168L487 137L585 193V265" />
        </g>
        <g fill="#3dd6ff">
          <circle cx="188" cy="107" r="3" />
          <circle cx="487" cy="137" r="3" />
        </g>
      </svg>
      <div className="city-label city-label-top">
        <span className="signal" />
        <div>
          SEBERANG PERAI<small>Ekosistem bandar pintar</small>
        </div>
      </div>
      <div className="city-label city-label-bottom">
        <ShieldCheck size={23} />
        <div>
          Akses selamat<small>Identiti digital terlindung</small>
        </div>
      </div>
      <div className="city-coordinates">
        SPU <span>•</span> SPT <span>•</span> SPS <i /> CONNECTED COMMUNITIES
      </div>
    </div>
  );
}
const services = [
  {
    icon: FilePlus2,
    title: "Permohonan Baharu",
    text: "Mulakan dengan akaun individu dan profil syarikat anda.",
    to: "/daftar",
    label: "Daftar akaun",
    ready: true,
  },
  {
    icon: Search,
    title: "Semakan Status",
    text: "Ikuti perkembangan permohonan anda dengan mudah.",
    to: "/status",
  },
  {
    icon: FilePenLine,
    title: "Pembetulan Permohonan",
    text: "Kemas kini maklumat dan dokumen yang diperlukan.",
    to: "/modul/pembetulan",
  },
  {
    icon: CreditCard,
    title: "Bil dan Bayaran",
    text: "Urus bil dan pembayaran melalui saluran digital.",
    to: "/modul/bayaran",
  },
  {
    icon: Files,
    title: "Dokumen & Surat Keputusan",
    text: "Akses dokumen dan surat keputusan permohonan.",
    to: "/modul/dokumen",
  },
  {
    icon: BookOpen,
    title: "Panduan Permohonan",
    text: "Ketahui langkah, keperluan dan persediaan awal.",
    to: "/panduan",
    label: "Baca panduan",
    ready: true,
  },
];
function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> PORTAL DIGITAL PENGINAPAN PEKERJA
            </div>
            <h1>
              Perkhidmatan pintar.
              <br />
              Urusan lebih <span>terhubung.</span>
            </h1>
            <div className="hero-name">STAYLink MBSP</div>
            <p className="hero-fullname">Smart Temporary Accommodation Link</p>
            <p className="hero-desc">
              Platform Digital Pintar bagi Pengurusan Permohonan Penginapan
              Pekerja Tempoh Terhad di Seberang Perai.
            </p>
            <div className="hero-actions">
              <Link className="button green" to="/daftar">
                Permohonan Baharu <ArrowUpRight size={18} />
              </Link>
              <Link className="button outline" to="/status">
                <Search size={17} /> Semak Status
              </Link>
            </div>
            <div className="hero-trust">
              <ShieldCheck size={15} />
              <span>Akses selamat</span>
              <i />
              <span>Perkhidmatan bersepadu</span>
              <i />
              <span>Mesra pengguna</span>
            </div>
          </div>
          <City />
        </div>
        <div className="hero-bottom container">
          <span>Digital Services, Practical Solutions.</span>
          <span>
            01 <i /> SMART CITY. CONNECTED SERVICES.
          </span>
        </div>
      </section>
      <div className="announcement container">
        <span className="announcement-tag">
          <span className="dot" /> MAKLUMAN
        </span>
        <p>
          Pembangunan Fasa 1: pendaftaran akaun dan pengurusan profil. Modul
          permohonan akan diperkenalkan pada fasa seterusnya.
        </p>
        <Link to="/panduan" aria-label="Baca maklumat fasa satu">
          <ArrowRight size={19} />
        </Link>
      </div>
      <section className="section container" id="perkhidmatan">
        <div className="section-heading">
          <div>
            <span className="kicker">PERKHIDMATAN DIGITAL</span>
            <h2>Semua urusan, satu platform.</h2>
            <p>Akses perkhidmatan STAYLink mengikut keperluan anda.</p>
          </div>
          <span className="section-number">01 / PERKHIDMATAN</span>
        </div>
        <div className="services-grid">
          {services.map((s, i) => (
            <Link to={s.to} className="service-card" key={s.title}>
              <div className="service-top">
                <span className={`service-icon c${i}`}>
                  <s.icon size={24} />
                </span>
                <ArrowUpRight size={20} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className={s.ready ? "service-action" : "phase-tag"}>
                {s.ready ? s.label : "Fasa seterusnya"}
                {s.ready && <ArrowRight size={15} />}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="steps-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="kicker">MUDAH & TERSUSUN</span>
              <h2>Langkah awal anda bersama STAYLink.</h2>
              <p>Persediaan yang jelas untuk urusan yang lebih lancar.</p>
            </div>
            <Link className="text-link" to="/panduan">
              Panduan lengkap <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="steps">
            {[
              [
                "01",
                "Daftar akaun",
                "Satu akaun individu untuk semua syarikat yang anda wakili.",
                UserRound,
              ],
              [
                "02",
                "Sahkan identiti",
                "Sahkan e-mel dan lengkapkan maklumat perhubungan.",
                ShieldCheck,
              ],
              [
                "03",
                "Lengkapkan syarikat",
                "Daftar profil syarikat dan muat naik surat kuasa.",
                Building2,
              ],
              [
                "04",
                "Bersedia memohon",
                "Modul permohonan menyusul dalam fasa seterusnya.",
                FilePlus2,
              ],
            ].map(([n, title, desc, Icon]: any) => (
              <div className="step" key={n}>
                <span className="step-number">{n}</span>
                <Icon size={23} />
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="district-layout">
          <div>
            <span className="kicker">SEBERANG PERAI TERHUBUNG</span>
            <h2>
              Tiga daerah. <br />
              Satu ekosistem digital.
            </h2>
            <p>Meliputi kawasan pentadbiran Majlis Bandaraya Seberang Perai.</p>
            <span className="district-note">
              <MapPin size={16} /> Pulau Pinang, Malaysia
            </span>
          </div>
          <div className="districts">
            {[
              ["SPU", "Seberang Perai Utara"],
              ["SPT", "Seberang Perai Tengah"],
              ["SPS", "Seberang Perai Selatan"],
            ].map(([code, name], i) => (
              <div className="district" key={code}>
                <span>0{i + 1}</span>
                <div>
                  <strong>{code}</strong>
                  <p>{name}</p>
                </div>
                <MapPin size={22} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="faq-section">
        <div className="container faq-layout">
          <div>
            <span className="kicker">SOALAN LAZIM</span>
            <h2>
              Ada pertanyaan? <br />
              Kami sedia membantu.
            </h2>
            <p>Maklumat asas sebelum anda bermula.</p>
            <Link className="text-link" to="/bantuan">
              Pusat bantuan <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="faqs">
            {[
              [
                "Siapakah yang boleh mendaftar akaun?",
                "Individu yang ingin mewakili syarikat boleh mendaftar satu akaun pemohon. Akaun pegawai hanya diwujudkan oleh pentadbir yang diberi kuasa.",
              ],
              [
                "Bolehkah saya mewakili lebih daripada satu syarikat?",
                "Ya. Satu akaun individu boleh dikaitkan dengan beberapa syarikat. Setiap hubungan perwakilan mempunyai status pengesahan tersendiri.",
              ],
              [
                "Adakah permohonan dan bayaran sudah tersedia?",
                "Modul permohonan, MBSPPay dan surat keputusan akan dibangunkan dalam fasa seterusnya. Fasa 1 menyediakan akaun, profil dan pentadbiran sistem.",
              ],
              [
                "Bagaimanakah saya mengaktifkan akaun?",
                "Buka pautan pengesahan yang dihantar kepada e-mel berdaftar. Pegawai juga perlu mendaftarkan MFA menggunakan aplikasi pengesah.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={17} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="container help-banner">
        <div className="help-icon">
          <Layers3 size={30} />
        </div>
        <div>
          <h2>Mulakan pengalaman digital anda.</h2>
          <p>
            Daftar akaun dan sediakan profil syarikat bersama STAYLink MBSP.
          </p>
        </div>
        <Link className="button green" to="/daftar">
          Daftar Sekarang <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
function Footer() {
  return (
    <footer>
      <div className="container footer-top">
        <div>
          <Logo />
          <p>Digital Services, Practical Solutions.</p>
          <span>
            Jabatan Bangunan
            <br />
            Majlis Bandaraya Seberang Perai
          </span>
        </div>
        <div>
          <h4>Pautan pantas</h4>
          <Link to="/panduan">Panduan pengguna</Link>
          <Link to="/status">Semakan status</Link>
          <Link to="/log-masuk">Log masuk pegawai</Link>
        </div>
        <div>
          <h4>Maklumat perkhidmatan</h4>
          <a href="https://www.mbsp.gov.my" target="_blank" rel="noreferrer">
            Portal rasmi MBSP <ArrowUpRight size={12} />
          </a>
          <Link to="/bantuan">Maklumat bantuan</Link>
          <Link to="/privasi">Privasi & keselamatan</Link>
        </div>
        <div className="footer-status">
          <ShieldCheck size={25} />
          <h4>Persekitaran pembangunan</h4>
          <p>
            Fasa 1 • Untuk semakan dan pengujian.
            <br />
            Belum diluluskan untuk kegunaan rasmi.
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} STAYLink MBSP. Semua hak terpelihara.
        </span>
        <span>
          Direka untuk Seberang Perai <span className="green-text">↗</span>
        </span>
      </div>
    </footer>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="container loading" aria-label="Sedang memuatkan">
      <div />
      <div />
      <div />
    </div>
  );
}
function Auth({
  mode,
}: {
  mode: "login" | "register" | "recover" | "activate";
}) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<any>();
  const [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  const titles = {
    login: "Selamat kembali.",
    register: "Mulakan dengan satu akaun.",
    recover: "Pulihkan akses akaun.",
    activate: "Aktifkan akaun anda.",
  };
  async function submit(b: any) {
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        registerSchema.parse(b);
        setMessage((await api("/auth/register", "POST", b)).message);
      }
      if (mode === "login") {
        const data = await api("/auth/login", "POST", b);
        setCsrf(data.csrf);
        nav("/dashboard");
      }
      if (mode === "recover")
        setMessage((await api("/auth/recover", "POST", b)).message);
      if (mode === "activate")
        setMessage(
          (
            await api("/auth/activate", "POST", {
              ...b,
              type: params.get("type"),
              token: params.get("token"),
            })
          ).message,
        );
    } catch (e: any) {
      setError(
        e.issues ? e.issues.map((i: any) => i.message).join(" ") : e.message,
      );
    }
  }
  return (
    <div className="auth-page container">
      <div className="auth-aside">
        <span className="kicker">AKSES DIGITAL STAYLINK</span>
        <h1>
          Terhubung dengan
          <br />
          perkhidmatan yang
          <br />
          <span>lebih pintar.</span>
        </h1>
        <p>
          Satu identiti digital untuk mengurus profil, syarikat dan urusan anda
          bersama STAYLink MBSP.
        </p>
        <div>
          <ShieldCheck /> Kata laluan disulitkan dengan Argon2id
        </div>
        <div>
          <Building2 /> Pelbagai syarikat, satu akaun individu
        </div>
        <div>
          <LockKeyhole /> MFA wajib untuk pegawai
        </div>
      </div>
      <div className="form-card">
        <span className="form-icon">
          <UserRound size={25} />
        </span>
        <h2>{titles[mode]}</h2>
        <p>
          {mode === "register"
            ? "Pendaftaran individu. Akaun pegawai diwujudkan oleh pentadbir sahaja."
            : "Gunakan maklumat akaun STAYLink MBSP anda."}
        </p>
        {error && <Notice error>{error}</Notice>}
        {message ? (
          <>
            <Notice>{message}</Notice>
            <Link className="button full" to="/log-masuk">
              Ke halaman log masuk <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit(submit)}>
            {mode === "register" && (
              <label>
                Nama penuh
                <input
                  {...register("name", { required: true })}
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </label>
            )}
            {mode !== "activate" && (
              <label>
                E-mel
                <input
                  {...register("email", { required: true })}
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {mode === "register" && (
              <label>
                Nombor telefon
                <input
                  {...register("phone", { required: true })}
                  type="tel"
                  autoComplete="tel"
                  required
                />
              </label>
            )}
            {(mode === "login" ||
              mode === "register" ||
              (mode === "activate" &&
                params.get("type") !== "VERIFY_EMAIL")) && (
              <label>
                {mode === "activate" ? "Kata laluan baharu" : "Kata laluan"}
                <input
                  {...register("password", { required: true })}
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  required
                />
                {mode !== "login" && (
                  <small>
                    Minimum 12 aksara dengan huruf besar, kecil, nombor dan
                    simbol.
                  </small>
                )}
              </label>
            )}
            {mode === "recover" && (
              <label>
                Jenis bantuan
                <select {...register("type")}>
                  <option value="RESET_PASSWORD">
                    Tetapkan semula kata laluan
                  </option>
                  <option value="VERIFY_EMAIL">
                    Hantar semula pengesahan e-mel
                  </option>
                </select>
              </label>
            )}
            {mode === "register" && (
              <label className="checkbox">
                <input
                  {...register("consent", { required: true })}
                  type="checkbox"
                  required
                />
                <span>
                  Saya bersetuju dengan pemprosesan maklumat untuk urusan
                  STAYLink. <Link to="/privasi">Baca notis privasi.</Link>
                </span>
              </label>
            )}
            <button className="button full" disabled={isSubmitting}>
              {isSubmitting
                ? "Sedang memproses…"
                : mode === "register"
                  ? "Daftar Akaun"
                  : mode === "login"
                    ? "Log Masuk"
                    : mode === "recover"
                      ? "Hantar Pautan"
                      : "Sahkan Akaun"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {mode === "login" && (
          <div className="auth-links">
            <Link to="/pulih-akaun">Lupa kata laluan?</Link>
            <span>
              Belum berdaftar? <Link to="/daftar">Daftar akaun</Link>
            </span>
          </div>
        )}
        {mode === "register" && (
          <div className="auth-links">
            Sudah berdaftar? <Link to="/log-masuk">Log masuk</Link>
          </div>
        )}
        <div className="secure-note">
          <LockKeyhole size={13} /> Sambungan selamat diperlukan untuk
          penggunaan produksi.
        </div>
      </div>
    </div>
  );
}
function Info({ type }: { type: string }) {
  const guide = type === "panduan",
    privacy = type === "privasi",
    help = type === "bantuan";
  return (
    <main className="container info-page">
      <Link className="breadcrumb" to="/">
        Utama <ChevronRight size={14} />
      </Link>
      <span className="kicker">STAYLINK MBSP</span>
      <h1>
        {guide
          ? "Panduan pengguna"
          : privacy
            ? "Privasi & keselamatan"
            : help
              ? "Maklumat bantuan"
              : "Semakan & modul permohonan"}
      </h1>
      {guide ? (
        <>
          <p className="lead">
            Sediakan akaun dan profil anda untuk perkhidmatan digital STAYLink.
          </p>
          <div className="guide-grid">
            {[
              [
                "1. Daftar sebagai individu",
                "Gunakan nama penuh, e-mel dan nombor telefon anda. Jangan cipta akaun baharu untuk setiap syarikat.",
              ],
              [
                "2. Sahkan e-mel",
                "Buka pautan sekali guna dalam e-mel pengesahan. Pautan luput selepas satu jam.",
              ],
              [
                "3. Lengkapkan profil syarikat",
                "Masukkan nombor SSM, alamat dan maklumat hubungan. Muat naik surat kuasa PDF maksimum 2 MB.",
              ],
              [
                "4. Fahami status pengesahan",
                "Akaun aktif tidak bermaksud maklumat atau perwakilan sudah disahkan. PIC Kawasan mengesahkan dokumen mengikut kuasa.",
              ],
            ].map(([title, text]) => (
              <article className="panel" key={title}>
                <BookOpen />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <Notice>
            Fasa 1: permohonan, pembetulan, bayaran dan penjanaan surat
            keputusan belum tersedia.
          </Notice>
          <Link className="button" to="/daftar">
            Daftar Akaun <ArrowRight size={16} />
          </Link>
        </>
      ) : privacy ? (
        <div className="panel prose">
          <h3>Notis persekitaran pembangunan</h3>
          <p>
            Gunakan data ujian sahaja. Draf ini perlu disemak dan diluluskan
            oleh MBSP sebelum penggunaan rasmi.
          </p>
          <h3>Tujuan pemprosesan</h3>
          <p>
            Nama, e-mel, telefon, maklumat syarikat dan surat kuasa digunakan
            untuk mengurus identiti serta perwakilan. Aktiviti keselamatan
            direkodkan untuk audit.
          </p>
          <h3>Kawalan akses</h3>
          <p>
            Akses berdasarkan peranan dan skop pelantikan. Pegawai wajib
            menggunakan MFA. Kata laluan tidak boleh dibaca oleh pentadbir.
          </p>
          <h3>Sebelum produksi</h3>
          <p>
            ICT MBSP perlu menetapkan tempoh penyimpanan, saluran permintaan
            subjek data, polisi privasi rasmi, sandaran dan pelan pemulihan.
          </p>
        </div>
      ) : help ? (
        <div className="panel prose">
          <h3>Jabatan Bangunan, MBSP</h3>
          <p>
            Rujuk direktori di portal rasmi MBSP untuk maklumat hubungan yang
            disahkan. Tiada nombor telefon atau e-mel pegawai diandaikan dalam
            sistem ini.
          </p>
          <a
            className="button"
            href="https://www.mbsp.gov.my"
            target="_blank"
            rel="noreferrer"
          >
            Portal rasmi MBSP <ArrowUpRight size={16} />
          </a>
          <h3>Bantuan akaun</h3>
          <Link to="/pulih-akaun">
            Pulihkan kata laluan atau hantar semula pengesahan e-mel.
          </Link>
        </div>
      ) : (
        <div className="empty-state">
          <Layers3 size={44} />
          <span className="phase-tag">FASA SETERUSNYA</span>
          <h2>Akan Tersedia Dalam Fasa Seterusnya</h2>
          <p>
            Modul permohonan, semakan status, pembetulan, bil dan surat
            keputusan belum diaktifkan. Tiada rekod permohonan sebenar tersedia
            dalam Fasa 1.
          </p>
          <Link className="button" to="/dashboard">
            Urus Akaun & Profil <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </main>
  );
}
function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Langkau ke kandungan
      </a>
      <Header />
      <div id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/daftar" element={<Auth mode="register" />} />
          <Route path="/log-masuk" element={<Auth mode="login" />} />
          <Route path="/pulih-akaun" element={<Auth mode="recover" />} />
          <Route path="/aktifkan" element={<Auth mode="activate" />} />
          <Route path="/dashboard/*" element={<Dashboard />} />
          {["panduan", "privasi", "bantuan", "status"].map((x) => (
            <Route key={x} path={`/${x}`} element={<Info type={x} />} />
          ))}
          <Route path="/modul/:name" element={<Info type="modul" />} />
          <Route
            path="*"
            element={
              <div className="container info-page">
                <h1>Halaman tidak ditemui</h1>
                <Link to="/">Kembali ke utama</Link>
              </div>
            }
          />
        </Routes>
      </div>
      <Footer />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
export { useQuery, Mail, Phone, CheckCircle2 };
