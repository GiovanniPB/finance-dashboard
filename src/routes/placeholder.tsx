import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            <Construction className="size-5" />
          </div>
          <p className="text-sm font-medium">Em construção</p>
          <p className="max-w-sm text-xs text-text-subtle">
            Esta área está no roadmap. O backend já suporta toda a estrutura necessária — a UI será
            construída em sprints subsequentes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
