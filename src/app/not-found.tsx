import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] px-6">
      <p className="text-6xl font-bold text-[var(--text-primary)] mb-4">404</p>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Page not found</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6 text-center max-w-sm">The page you are looking for does not exist or has been removed.</p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Go Home
      </Link>
    </div>
  );
}
