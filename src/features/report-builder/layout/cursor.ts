/**
 * Cursor de layout — a aritmética de "onde desenhar e quando quebrar a página".
 *
 * **Por que não é um paginador que pré-calcula páginas:** o `autoTable` pagina
 * tabelas longas por conta própria e só informa onde parou depois de desenhar.
 * Pré-calcular a altura de uma tabela exigiria replicar a lógica de altura de
 * linha dele — frágil e redundante. Então a paginação é **emergente**: cada
 * bloco pede espaço, o cursor decide se cabe, e blocos que paginam sozinhos
 * devolvem a posição final via `syncTo`.
 *
 * Não conhece jsPDF: recebe `onNewPage` por injeção, o que o torna testável sem
 * biblioteca de PDF.
 */

export interface LayoutCursorOptions {
  /** Y inicial do conteúdo em cada página, em mm. */
  topMm: number;
  /** Y máximo utilizável — normalmente o início do rodapé, em mm. */
  bottomMm: number;
  /** Chamado a cada nova página. O driver usa para `doc.addPage()`. */
  onNewPage?: (pageNumber: number) => void;
}

/** Tolerância para comparação de mm em ponto flutuante. */
const EPSILON = 0.01;

export class LayoutCursor {
  private readonly topMm: number;
  private readonly bottomMm: number;
  private readonly onNewPage?: (pageNumber: number) => void;
  private currentPage = 1;
  private currentY: number;

  constructor(options: LayoutCursorOptions) {
    this.topMm = options.topMm;
    this.bottomMm = options.bottomMm;
    this.onNewPage = options.onNewPage;
    this.currentY = options.topMm;
  }

  get page(): number {
    return this.currentPage;
  }

  get y(): number {
    return this.currentY;
  }

  /** Espaço vertical restante na página atual, em mm. */
  remaining(): number {
    return this.bottomMm - this.currentY;
  }

  /** O cursor está no topo de uma página, sem nada desenhado ainda? */
  isAtPageStart(): boolean {
    return Math.abs(this.currentY - this.topMm) < EPSILON;
  }

  /** `heightMm` cabe no que resta da página atual? */
  fits(heightMm: number): boolean {
    return heightMm <= this.remaining() + EPSILON;
  }

  /**
   * Garante espaço para `heightMm` e devolve o Y onde desenhar.
   *
   * Bloco mais alto que a página inteira **não** dispara quebra quando o cursor
   * já está no topo — quebrar aqui geraria uma página vazia e, num laço, loop
   * infinito. Nesse caso o bloco é desenhado e transborda por conta própria
   * (tabelas resolvem isso paginando internamente).
   */
  reserve(heightMm: number): number {
    if (!this.fits(heightMm) && !this.isAtPageStart()) {
      this.newPage();
    }
    return this.currentY;
  }

  /** Avança o cursor sem quebrar página. */
  advance(heightMm: number): void {
    this.currentY += heightMm;
  }

  /** Reserva o espaço, avança e devolve o Y onde o bloco começa. */
  take(heightMm: number): number {
    const y = this.reserve(heightMm);
    this.advance(heightMm);
    return y;
  }

  newPage(): void {
    this.currentPage += 1;
    this.currentY = this.topMm;
    this.onNewPage?.(this.currentPage);
  }

  /**
   * Sincroniza o cursor com a posição real após um bloco que paginou sozinho
   * (`autoTable`). `page` é o número absoluto de página, `y` o Y final em mm.
   */
  syncTo(page: number, y: number): void {
    this.currentPage = page;
    this.currentY = y;
  }
}
