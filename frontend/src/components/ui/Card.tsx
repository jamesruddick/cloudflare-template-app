import type { ComponentProps } from 'react';

const base = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`${base} ${className}`} {...props} />;
}
