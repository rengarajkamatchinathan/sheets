export default function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 rounded-lg bg-panel" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-panel" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-line bg-panel" />
    </div>
  );
}
