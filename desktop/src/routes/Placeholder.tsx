import { useLocation } from "react-router";
import { Card } from "@/components/kit";

export default function Placeholder({ title }: { title: string }) {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="p-5 text-sm text-mute">
        Coming in Phase 4 · <code className="font-mono text-soft">{pathname}</code>
      </Card>
    </div>
  );
}
