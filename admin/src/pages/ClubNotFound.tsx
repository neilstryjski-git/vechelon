export default function ClubNotFound() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6 bg-surface"
    >
      <span className="material-symbols-outlined text-5xl text-primary/30">
        location_off
      </span>
      <h1 className="font-headline font-black text-2xl tracking-tighter text-on-background uppercase">
        Club Not Found
      </h1>
      <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
        No club is configured at this address
      </p>
      <p className="font-body text-sm text-on-surface-variant/70 max-w-sm">
        Contact your club admin for the correct link, or visit the Vechelon
        platform to learn more.
      </p>
      <a
        href="https://vechelon.ca"
        className="mt-4 signature-gradient text-on-primary px-8 py-3 rounded-md font-headline font-bold shadow-lg uppercase tracking-widest text-xs"
      >
        Visit Vechelon.ca
      </a>
    </div>
  );
}
