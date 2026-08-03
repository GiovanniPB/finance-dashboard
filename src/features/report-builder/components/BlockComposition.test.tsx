import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createBlock } from "../blocks/catalog";
import { BlockComposition } from "./BlockComposition";

function setup(blocks = [createBlock("cover", "c1"), createBlock("dre", "d1")]) {
  const handlers = {
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onReorder: vi.fn(),
    onOptionsChange: vi.fn(),
  };
  render(<BlockComposition blocks={blocks} {...handlers} />);
  return handlers;
}

describe("BlockComposition", () => {
  it("orienta o usuário quando a composição está vazia", () => {
    setup([]);

    expect(screen.getByText(/Nenhum bloco na composição/u)).toBeInTheDocument();
  });

  it("lista os blocos na ordem, numerados", () => {
    setup();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Capa");
    expect(items[1]).toHaveTextContent("DRE");
  });

  it("usa o título personalizado quando existe", () => {
    setup([{ instanceId: "d1", type: "dre", options: { heading: "Resultado do trimestre" } }]);

    expect(screen.getByText("Resultado do trimestre")).toBeInTheDocument();
  });

  it("desabilita subir no primeiro e descer no último", () => {
    setup();

    expect(screen.getByRole("button", { name: /Mover Capa para cima/u })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mover DRE para baixo/u })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mover Capa para baixo/u })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Mover DRE para cima/u })).toBeEnabled();
  });

  it("informa a direção ao reordenar por botão", async () => {
    const handlers = setup();

    await userEvent.click(screen.getByRole("button", { name: /Mover DRE para cima/u }));

    expect(handlers.onMove).toHaveBeenCalledExactlyOnceWith("d1", "up");
  });

  it("informa o bloco ao remover", async () => {
    const handlers = setup();

    await userEvent.click(screen.getByRole("button", { name: /Remover Capa/u }));

    expect(handlers.onRemove).toHaveBeenCalledExactlyOnceWith("c1");
  });

  it("não oferece opções para bloco que não tem nenhuma", () => {
    setup([createBlock("page-break", "pb1")]);

    expect(screen.queryByRole("button", { name: /Opções/u })).not.toBeInTheDocument();
  });

  it("abre e fecha o painel de opções", async () => {
    setup([createBlock("counterparties", "cp1")]);
    const toggle = screen.getByRole("button", { name: /Opções/u });

    await userEvent.click(toggle);
    expect(screen.getByLabelText("Quantidade de linhas")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByLabelText("Quantidade de linhas")).not.toBeInTheDocument();
  });

  it("mostra só as opções que o bloco honra", async () => {
    setup([createBlock("counterparties", "cp1")]);

    await userEvent.click(screen.getByRole("button", { name: /Opções/u }));

    // Contrapartes tem topN e natureza, mas não granularidade nem coluna de caixa.
    expect(screen.getByLabelText("Quantidade de linhas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Granularidade")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/coluna de caixa/iu)).not.toBeInTheDocument();
  });

  it("propaga a mudança de opção com o instanceId certo", async () => {
    const handlers = setup([createBlock("counterparties", "cp1")]);
    await userEvent.click(screen.getByRole("button", { name: /Opções/u }));

    // O input é controlado e o pai aqui é mock, então não re-renderiza: digitar
    // acumularia no valor antigo. Um evento de mudança direto é determinístico.
    fireEvent.change(screen.getByLabelText("Quantidade de linhas"), {
      target: { value: "7" },
    });

    expect(handlers.onOptionsChange).toHaveBeenLastCalledWith("cp1", { topN: 7 });
  });

  it("limita a quantidade de linhas ao máximo permitido", async () => {
    const handlers = setup([createBlock("counterparties", "cp1")]);
    await userEvent.click(screen.getByRole("button", { name: /Opções/u }));

    fireEvent.change(screen.getByLabelText("Quantidade de linhas"), {
      target: { value: "999" },
    });

    expect(handlers.onOptionsChange).toHaveBeenLastCalledWith("cp1", { topN: 50 });
  });

  it("marca visualmente a quebra de página", () => {
    setup([createBlock("page-break", "pb1")]);

    expect(screen.getByText("quebra")).toBeInTheDocument();
  });

  it("reordena ao arrastar de uma posição para outra", () => {
    const handlers = setup();
    const items = screen.getAllByRole("listitem");
    const [first, second] = items;
    if (first == null || second == null) throw new Error("itens não renderizados");

    // Arrastar é complemento dos botões; os botões são o caminho por teclado.
    fireEvent.dragStart(first);
    fireEvent.dragOver(second);
    fireEvent.drop(second);

    expect(handlers.onReorder).toHaveBeenCalledExactlyOnceWith(0, 1);
  });
});
