// Tokens visuais do app — tema escuro "lava jato": azul-petróleo profundo com
// um ciano de água/espuma como destaque. Como toda tela usa só os nomes abaixo
// (colors.*, nunca hex direto), trocar a paleta aqui já muda o app inteiro sem
// mexer em cada tela.
export const colors = {
  background: "#0A1620",
  surface: "#101F2C",
  surfaceAlt: "#162A3A",
  ink: "#EAF4FB",
  inkMuted: "#8AA1B3",
  border: "#223A4D",
  accent: "#2FB8E6", // ciano água — cor de destaque (botões, ícone ativo, estrelas)
  accentSoft: "#10394D",
  accentInk: "#041620", // texto escuro sobre o ciano (contraste)
  success: "#4FBF8B",
  successSoft: "#13302A",
  danger: "#E5695C",
  dangerSoft: "#35201E",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
};

export const typography = {
  // Carregue Manrope/Work Sans via expo-font se quiser igualar 100% ao protótipo;
  // até lá, o sistema usa a fonte padrão da plataforma.
  heading: { fontWeight: "800" as const },
  subheading: { fontWeight: "700" as const },
  body: { fontWeight: "400" as const },
};
