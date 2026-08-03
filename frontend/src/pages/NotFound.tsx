import { ButtonLink } from '@/components/ui';
import { useHead } from '@/lib/use-head';

export default function NotFound() {
  useHead({ title: 'Page Not Found' });
  return (
    <div className="py-10">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Page not found</h1>
      <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-400">
        The SPA fallback served this route, then the client-side router matched it here.
      </p>
      <ButtonLink to="/" className="mt-6">
        Back home
      </ButtonLink>
    </div>
  );
}
