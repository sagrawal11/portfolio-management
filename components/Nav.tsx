import Link from 'next/link';

const LINKS: [string, string][] = [
  ['Dashboard', '/dashboard'],
  ['Swap', '/swap'],
  ['Journal', '/journal'],
  ['Research', '/research'],
];

export default function Nav() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Portfolio Tracker
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {label}
            </Link>
          ))}
          <a
            href="/api/export"
            className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Export CSV
          </a>
          <form action="/api/logout" method="post">
            <button className="rounded-md px-3 py-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
