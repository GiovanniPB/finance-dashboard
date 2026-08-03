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

    expect(screen.getByRole("button", { name: /Fluxo de caixa/u })).toBeEnabled();
  });

  it("desabilita fluxo de caixa no consolidado e explica o motivo", () => {
    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Fluxo de caixa/u });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/consolidada/iu);
  });

  it("mantém DRE disponível nos dois escopos", () => {
    // O nome acessível inclui a descrição, então "DRE" sozinho também casaria
    // com "DRE comparativo".
    const dre = /^DRE Demonstrativo/u;
    const { unmount } = render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: dre })).toBeEnabled();
    unmount();

    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: dre })).toBeEnabled();
  });

  it("exige eixo de comparação para o DRE comparativo", () => {
    const { unmount } = render(<BlockCatalog mode="company" comparison="none" onAdd={vi.fn()} />);
    const disabled = screen.getByRole("button", { name: /DRE comparativo/u });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveTextContent(/compara/iu);
    unmount();

    render(<BlockCatalog mode="company" comparison="yoy" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /DRE comparativo/u })).toBeEnabled();
  });

  it("avisa o tipo escolhido ao clicar", async () => {
    const onAdd = vi.fn();
    render(<BlockCatalog mode="company" comparison="none" onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /Saldos bancários/u }));

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("bank-balances");
  });

  it("não dispara nada ao clicar num bloco indisponível", async () => {
    const onAdd = vi.fn();
    render(<BlockCatalog mode="consolidated" comparison="none" onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /Projeção|Forecast/u }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
