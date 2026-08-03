/**
 * Tema de impressão — métricas A4, paleta em hex e escala tipográfica.
 *
 * **Por que a paleta é hex literal e não derivada dos tokens do app:** os tokens
 * em `src/styles/tokens.css` são `oklch()`, e nem o jsPDF nem o svg2pdf parseiam
 * `oklch`. Além disso um SVG serializado e destacado do documento perde acesso às
 * CSS vars, então `fill="var(--color-accent)"` chegaria vazio no PDF.
 *
 * Resolver cor em runtime seria frágil; declarar aqui é determinístico e
 * testável. E é melhor design de qualquer forma: impressão pede fundo branco e
 * contraste próprios, diferentes da tela (que ainda tem tema escuro).
 *
 * Os valores são aproximações **ajustadas à mão** dos tokens oklch, não
 * conversões automáticas. `accent` vem do hex de marca já usado no favicon
 * (`index.html`), que é a referência autoritativa.
 *
 * Módulo de dados puro: sem imports, sem runtime.
 */

/* ─── Página ──────────────────────────────────────────────────────────── */

/** jsPDF é inicializado com esta unidade — toda medida geométrica está em mm. */
export const PDF_UNIT = "mm" as const;

export const PAGE = {
  format: "a4" as const,
  widthMm: 210,
  heightMm: 297,
  margin: { top: 16, right: 18, bottom: 18, left: 18 },
  /** Faixa reservada ao cabeçalho corrido das páginas internas. */
  headerHeightMm: 9,
  /** Faixa reservada ao rodapé (numeração e confidencialidade). */
  footerHeightMm: 8,
} as const;

export const CONTENT = {
  widthMm: PAGE.widthMm - PAGE.margin.left - PAGE.margin.right,
  heightMm: PAGE.heightMm - PAGE.margin.top - PAGE.margin.bottom,
  /** X inicial do conteúdo. */
  leftMm: PAGE.margin.left,
  /** Y inicial do conteúdo nas páginas com cabeçalho corrido. */
  topWithHeaderMm: PAGE.margin.top + PAGE.headerHeightMm,
  topMm: PAGE.margin.top,
} as const;

/** Altura útil de uma página interna, já descontados cabeçalho e rodapé. */
export const USABLE_HEIGHT_MM = CONTENT.heightMm - PAGE.headerHeightMm - PAGE.footerHeightMm;

/* ─── Cores ───────────────────────────────────────────────────────────── */

export const COLORS = {
  accent: "#644DFF",
  accentSoft: "#EDE9FF",
  income: "#0E9F6E",
  incomeSoft: "#E3F5EE",
  expense: "#DC4C3F",
  expenseSoft: "#FCEAE8",
  warning: "#D98A0B",
  info: "#2E7FD4",

  text: "#14161A",
  textMuted: "#555B69",
  textSubtle: "#868D9C",
  textInverse: "#FFFFFF",

  border: "#DDE1E8",
  borderStrong: "#C2C8D4",
  surface: "#FFFFFF",
  /** Zebra de tabela e fundo de cabeçalho. */
  surfaceAlt: "#F5F6F9",
} as const;

/**
 * Paleta categórica — espelha a ordem de `ExpenseDonut` para que a rosca do PDF
 * fique reconhecível ao lado da tela.
 */
export const SERIES_PALETTE = [
  "#644DFF", // violeta (accent)
  "#4E6BE8", // azul-violeta
  "#2E7FD4", // azul
  "#17919B", // teal
  "#0E9F6E", // verde
  "#D98A0B", // âmbar
  "#DC4C3F", // vermelho-laranja
  "#C2489B", // rosa
] as const;

/** Cinza reservado à fatia "Outros" e à série do ano anterior. */
export const NEUTRAL_SERIES = "#A8AEBC";

/* ─── Tipografia ──────────────────────────────────────────────────────── */

/**
 * Helvetica embutida do jsPDF: codificação WinAnsi (Latin-1). Acentuação do
 * português e travessão funcionam; **setas `↑ ↓` e símbolos fora do Latin-1
 * não** — variação se expressa por sinal e cor, nunca por seta.
 */
export const FONT_FAMILY = "helvetica" as const;

/** Tamanhos em pt (única medida do PDF que não está em mm). */
export const FONT_SIZE = {
  coverTitle: 26,
  coverSubtitle: 13,
  coverMeta: 10,
  sectionTitle: 13,
  blockTitle: 11,
  body: 9,
  small: 7.5,
  kpiValue: 15,
  kpiLabel: 7.5,
  tableHeader: 8,
  tableBody: 8,
  tableSummary: 8,
  header: 7.5,
  footer: 7,
} as const;

export const LINE_HEIGHT = 1.35;

/* ─── Captura de gráficos ─────────────────────────────────────────────── */

/**
 * Os gráficos são renderizados fora da tela em px e depois colocados em mm. A
 * proporção precisa bater com a largura de destino para não distorcer, então
 * as alturas em mm abaixo são derivadas — não escolhidas.
 */
const CAPTURE_WIDTH_PX = 720;

export const CHART_CAPTURE = {
  full: {
    widthPx: CAPTURE_WIDTH_PX,
    heightPx: 280,
    widthMm: CONTENT.widthMm,
    heightMm: (280 / CAPTURE_WIDTH_PX) * CONTENT.widthMm,
  },
  half: {
    widthPx: CAPTURE_WIDTH_PX / 2,
    heightPx: 240,
    widthMm: CONTENT.widthMm / 2 - 3,
    heightMm: (240 / (CAPTURE_WIDTH_PX / 2)) * (CONTENT.widthMm / 2 - 3),
  },
  /** Rosca é quadrada. */
  donut: {
    widthPx: 320,
    heightPx: 320,
    widthMm: 62,
    heightMm: 62,
  },
} as const;

/** Espaçamentos verticais recorrentes, em mm. */
export const SPACING = {
  blockGap: 8,
  titleGap: 4,
  tableGap: 3,
  paragraphGap: 2.5,
} as const;
