/**
 * Loading skeletons shaped like each page, so content slots into place instead of
 * jumping. Shown only for the first visit to a page; cached visits render instantly.
 */
import { cn } from "@/lib/utils";

function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-white/[0.045]", className)} style={style} />;
}

function Busy({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Busy label="Loading dashboard" className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Bone className="h-3.5 w-36" />
        <Bone className="h-7 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Bone className="h-[236px] rounded-2xl" />
        <Bone className="h-[236px] rounded-2xl" />
      </div>
      <Bone className="h-[76px] rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Bone className="h-[440px] rounded-2xl" />
        <div className="flex flex-col gap-4">
          <Bone className="h-[300px] rounded-2xl" />
          <Bone className="h-[124px] rounded-2xl" />
        </div>
      </div>
    </Busy>
  );
}

export function TopicsSkeleton() {
  return (
    <Busy label="Loading topics" className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <Bone className="h-7 w-28" />
        <Bone className="ml-auto h-8 w-44" />
      </div>
      <Bone className="h-8 w-24" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 9 }, (_, i) => (
          <Bone key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </Busy>
  );
}

export function TopicSkeleton() {
  return (
    <Busy label="Loading topic" className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Bone className="h-3 w-14" />
        <Bone className="h-7 w-56" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Bone className="h-[96px] rounded-xl" />
        <Bone className="h-[96px] rounded-xl" />
      </div>
      <Bone className="h-8 w-24" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </Busy>
  );
}

export function ProblemSkeleton() {
  return (
    <Busy label="Loading problem" className="flex flex-col gap-2 lg:-mx-10 lg:-my-8 lg:h-dvh lg:px-3 lg:pt-2.5 lg:pb-3">
      <Bone className="h-3 w-48" />
      <div className="flex items-center gap-4">
        <Bone className="h-7 w-52" />
        <Bone className="h-5 w-72" />
        <Bone className="ml-auto h-7 w-24" />
      </div>
      <div className="flex min-h-[420px] flex-1 gap-3">
        <div className="flex basis-[45%] flex-col overflow-hidden rounded-xl border border-line">
          <div className="h-10 border-b border-line bg-panel" />
          <div className="flex flex-col gap-3 p-6">
            {[60, 92, 80, 88, 45].map((w, i) => (
              <Bone key={i} className="h-3.5" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#0f1318]">
          <div className="h-10 border-b border-line bg-panel" />
          <div className="flex flex-col gap-2.5 p-5">
            {[40, 70, 55, 82, 64, 30].map((w, i) => (
              <Bone key={i} className="h-3" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    </Busy>
  );
}
