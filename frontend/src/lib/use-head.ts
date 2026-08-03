import { useEffect } from 'react';

const SITE_NAME = 'Cloudflare Template App';

interface HeadOptions {
  title?: string;
  description?: string;
  canonical?: string;
}

export function useHead({ title, description, canonical }: HeadOptions) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = prev;
    };
  }, [title]);

  useEffect(() => {
    const tag = document.querySelector('meta[name="description"]');
    if (!tag || !description) return;
    const prev = tag.getAttribute('content') ?? '';
    tag.setAttribute('content', description);
    return () => {
      tag.setAttribute('content', prev);
    };
  }, [description]);

  useEffect(() => {
    if (!canonical) return;
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    const prev = link.href;
    link.href = canonical;
    return () => {
      if (created) {
        link?.remove();
      } else if (link) {
        link.href = prev;
      }
    };
  }, [canonical]);
}
