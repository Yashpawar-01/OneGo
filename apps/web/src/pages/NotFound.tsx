import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="text-xs font-medium uppercase tracking-widest text-brand">
        404
      </div>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-dim">
        That route does not exist in the OneGo workspace.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md border border-edge px-4 py-2 text-sm text-ink hover:bg-white/5"
      >
        Back to Overview
      </Link>
    </div>
  );
}
