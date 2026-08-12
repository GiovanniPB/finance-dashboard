/**
 * A barra de paginação é o que informa "quantos títulos existem de verdade"
 * depois que a lista passou a mostrar só uma fatia. Errar a faixa exibida ou
 * deixar navegar além das pontas reintroduz exatamente o problema que a
 * paginação veio resolver.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BillsPagination } from "./BillsPagination";

function setup(overrides: Partial<React.ComponentProps<typeof BillsPagination>> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <BillsPagination
      page={1}
      pageCount={12}
      totalCount={235}
      rowsOnPage={20}
      pageSize={20}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...overrides}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

describe("BillsPagination", () => {
  it("mostra a faixa da página e o total do filtro", () => {
    setup();

    expect(screen.getByText("1–20 de 235")).toBeInTheDocument();
    expect(screen.getByText("1 / 12")).toBeInTheDocument();
  });

  it("calcula a faixa de uma página do meio", () => {
    setup({ page: 4 });

    expect(screen.getByText("61–80 de 235")).toBeInTheDocument();
  });

  it("encurta a faixa na última página incompleta", () => {
    setup({ page: 12, rowsOnPage: 15 });

    expect(screen.getByText("221–235 de 235")).toBeInTheDocument();
  });

  it("não anuncia faixa quando o filtro não achou nada", () => {
    setup({ pageCount: 1, totalCount: 0, rowsOnPage: 0 });

    expect(screen.getByText("0 títulos")).toBeInTheDocument();
  });

  it("trava o retrocesso na primeira página", () => {
    setup({ page: 1 });

    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /próxima/i })).toBeEnabled();
  });

  it("trava o avanço na última página", () => {
    setup({ page: 12 });

    expect(screen.getByRole("button", { name: /próxima/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /anterior/i })).toBeEnabled();
  });

  it("trava as duas pontas quando só existe uma página", () => {
    setup({ page: 1, pageCount: 1, totalCount: 8, rowsOnPage: 8 });

    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /próxima/i })).toBeDisabled();
  });

  it("avança e retrocede uma página por vez", async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ page: 5 });

    await user.click(screen.getByRole("button", { name: /próxima/i }));
    expect(onPageChange).toHaveBeenCalledWith(6);

    await user.click(screen.getByRole("button", { name: /anterior/i }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("entrega o tamanho novo como número", async () => {
    const user = userEvent.setup();
    const { onPageSizeChange } = setup();

    await user.click(screen.getByRole("combobox", { name: "Títulos por página" }));
    await user.click(screen.getByRole("option", { name: "50" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("nunca mostra zero páginas", () => {
    setup({ pageCount: 0, totalCount: 0, rowsOnPage: 0 });

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
});
