/**
 * O gate de escopo é a regra que mais dói se quebrar: sem ele o usuário monta um
 * relatório que falha na geração. Estes testes cobrem exatamente isso.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BlockCatalog } from "./BlockCatalog";

describe("BlockCatalog", () => {
  it("agrupa os blocos por seção", () => {
    render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Estrutura" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demonstrativos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Análises" })).toBeInTheDocument();
  });

  it("libera fluxo de caixa no escopo de empresa", () => {
    render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Fluxo de caixa" })).toBeEnabled();
  });

  it("desabilita fluxo de caixa no consolidado e explica o motivo", () => {
    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Fluxo de caixa" });
    expect(button).toBeDisabled();
    // O motivo vive no `title`; o chip mostra só o rótulo.
    expect(button).toHaveAttribute("title", expect.stringMatching(/consolidada/iu));
  });

  it("resume os blocos indisponíveis fora do hover", () => {
    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={vi.fn()} />);

    // Depender só de `title` esconderia a informação de quem não usa mouse.
    expect(screen.getByText(/bloco\(s\) indisponível\(is\) aqui/u)).toBeInTheDocument();
    expect(screen.getByText(/Selecione uma empresa específica/u)).toBeInTheDocument();
  });

  it("mantém DRE disponível nos dois escopos", () => {
    // Nome exato: "DRE" não pode casar com "DRE comparativo".
    const { unmount } = render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "DRE" })).toBeEnabled();
    unmount();

    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "DRE" })).toBeEnabled();
  });

  it("exige eixo de comparação para o DRE comparativo", () => {
    const { unmount } = render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);
    const disabled = screen.getByRole("button", { name: "DRE comparativo" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("title", expect.stringMatching(/compara/iu));
    unmount();

    render(<BlockCatalog mode="company" comparison="yoy" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "DRE comparativo" })).toBeEnabled();
  });

  it("avisa o tipo escolhido ao clicar", async () => {
    const onAdd = vi.fn();
    render(<BlockCatalog mode="company" comparison="none" onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: "Saldos bancários" }));

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("bank-balances");
  });

  it("não dispara nada ao clicar num bloco indisponível", async () => {
    const onAdd = vi.fn();
    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: "Forecast 90 dias" }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
