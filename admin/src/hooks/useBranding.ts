import { useEffect } from 'react';

interface TenantBrand {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
}

/**
 * Hook to inject tenant-specific branding into the document root.
 * Fulfills Section 11.1 requirements.
 */
export const useBranding = (brand: TenantBrand | null) => {
  useEffect(() => {
    if (!brand) return;

    const root = document.documentElement;
    root.style.setProperty('--brand-primary', brand.primaryColor);
    root.style.setProperty('--brand-accent', brand.accentColor);
    if (brand.logoUrl) {
      root.style.setProperty('--brand-logo', `url('${brand.logoUrl}')`);
    }

    // Cleanup (optional, depends on if we want to revert on unmount)
    return () => {
      root.style.removeProperty('--brand-primary');
      root.style.removeProperty('--brand-accent');
      root.style.removeProperty('--brand-logo');
    };
  }, [brand]);
};
