import Nav from '@/components/Nav';
import { CATEGORIES, RESEARCH_SOURCES } from '@/lib/research-sources';

export const dynamic = 'force-static';

export default function ResearchPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Research</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Quick links for your weekly &quot;what happened &amp; why&quot; notes and reallocation
          decisions. Opens in a new tab.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const sources = RESEARCH_SOURCES.filter((s) => s.categories.includes(cat));
            return (
              <section key={cat} className="rounded-lg border border-zinc-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-medium text-zinc-700">{cat}</h2>
                <ul className="space-y-1">
                  {sources.map((s) => (
                    <li key={s.name}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {s.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
