import { Building2, Users, Network, Leaf, ShieldCheck } from "lucide-react";
export function CityScene() {
  return (
    <div
      className="city-scene"
      aria-label="Visual konsep bandar pintar STAYLink"
    >
      <div className="scene-frame" />
      <svg
        className="connectivity-map"
        viewBox="0 0 600 600"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="connection" x1="0" x2="1">
            <stop stopColor="#3dd6ff" />
            <stop offset="1" stopColor="#00c896" />
          </linearGradient>
        </defs>
        <g stroke="url(#connection)" strokeWidth="1.2">
          <path d="M60 440L160 380L280 450L410 375L540 450" />
          <path d="M160 380V230L265 170M410 375V130L505 77" />
          <path d="M60 440L280 560L540 450" opacity=".35" />
          <path d="M120 105H220L260 145M350 520H450L490 480" opacity=".7" />
        </g>
        {[
          [60, 440],
          [160, 380],
          [280, 450],
          [410, 375],
          [540, 450],
          [265, 170],
          [505, 77],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="11" stroke="#3dd6ff" opacity=".2" />
            <circle cx={x} cy={y} r="3" fill={i % 2 ? "#00c896" : "#3dd6ff"} />
          </g>
        ))}
        <circle
          cx="310"
          cy="315"
          r="207"
          stroke="#57b9ed"
          strokeDasharray="2 16"
          opacity=".2"
        />
      </svg>
      <div className="scene-location">
        <span>SEBERANG PERAI</span>
        <strong>
          Terhubung.
          <br />
          Lebih sejahtera.
        </strong>
        <i />
      </div>
      <div className="scene-pillars">
        {[
          [Building2, "Bandar pintar"],
          [Users, "Komuniti sejahtera"],
          [Network, "Perkhidmatan terhubung"],
          [Leaf, "Masa hadapan mampan"],
        ].map(([Icon, label]: any) => (
          <div key={label}>
            <Icon size={23} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="scene-security">
        <ShieldCheck size={23} />
        <div>
          <strong>Identiti digital. Akses terlindung.</strong>
          <span>Satu platform, pelbagai peranan.</span>
        </div>
      </div>
      <div className="scene-districts">
        <span>PEOPLE · PLACES · CONNECTIONS</span>
        <div>
          <b>SPU</b>
          <i />
          <b>SPT</b>
          <i />
          <b>SPS</b>
        </div>
      </div>
    </div>
  );
}
export function VisualCredit() {
  return (
    <div className="photo-credit">
      Visual konsep bandar pintar diolah daripada rujukan STAYLink MBSP yang
      dibekalkan.
    </div>
  );
}
