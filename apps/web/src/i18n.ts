export const messages = {
  ms: {
    brand: "STAYLink MBSP",
    tagline: "Digital Services, Practical Solutions.",
    future: "Akan Tersedia Dalam Fasa Seterusnya",
    loading: "Sedang memuatkan…",
    empty: "Tiada rekod untuk dipaparkan.",
  },
};
export type Locale = keyof typeof messages;
export const t = (key: keyof typeof messages.ms, locale: Locale = "ms") =>
  messages[locale][key];
