export type PlaceholderPageProps = {
  title: string;
  phase: string;
  summary: string;
  planned: string[];
};

export function PlaceholderPage({
  title,
  phase,
  summary,
  planned,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 text-xs font-medium uppercase tracking-widest text-brand">
        {phase}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-dim">{summary}</p>
      <ul className="mt-6 space-y-2">
        {planned.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 rounded-md border border-edge bg-panel/60 px-4 py-3 text-sm"
          >
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
            <span className="text-dim">{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-dim">
        This route is a structural placeholder. No mock data, usage numbers, or
        provider connections are fabricated anywhere in the app.
      </p>
    </div>
  );
}
