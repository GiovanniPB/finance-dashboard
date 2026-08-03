import type { BlockRenderer } from "../driver";

/**
 * Quebra de página manual. Não faz nada se o cursor já está no topo de uma
 * página — quebrar aí produziria uma página em branco.
 */
export const renderPageBreak: BlockRenderer = ({ cursor }) => {
  if (!cursor.isAtPageStart()) cursor.newPage();
};
