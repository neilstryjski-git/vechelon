export default function NotAuthorised() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6 bg-surface"
    >
      <span className="material-symbols-outlined text-5xl text-error/30">
        security
      </span>
      <h1 className="font-headline font-black text-2xl tracking-tighter text-on-background uppercase">
        Access Restricted
      </h1>
      <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
        Platform Admin clearance required
      </p>
      <p className="font-body text-sm text-on-surface-variant/70 max-w-sm">
        This surface is restricted to authorized platform administrators.
        Contact support if you believe this is an error.
      </p>
    </div>
  );
}
