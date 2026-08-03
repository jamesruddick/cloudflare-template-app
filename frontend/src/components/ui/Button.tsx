import type { ComponentProps } from 'react';
import { Link } from 'react-router';

const base =
  'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2 sm:text-sm';

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return <button className={`${base} ${className}`} {...props} />;
}

export function ButtonLink({ className = '', ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${base} ${className}`} {...props} />;
}
