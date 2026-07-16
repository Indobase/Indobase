import { classNames } from '~/utils/classNames';

/**
 * Full-bleed sky atmosphere for the Emergent-style Builder home.
 * Pure CSS — no external image dependency.
 */
export function AtmosphereBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={classNames('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #5BA3E8 0%, #7EB8EE 28%, #A8D0F5 55%, #C5DFF8 75%, #E8F2FB 100%)',
        }}
      />
      {/* Soft cloud blobs */}
      <div
        className="absolute -left-[10%] top-[8%] h-[28%] w-[55%] rounded-[100%] opacity-70 blur-2xl"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, transparent 70%)' }}
      />
      <div
        className="absolute right-[-5%] top-[18%] h-[22%] w-[45%] rounded-[100%] opacity-60 blur-2xl"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.9) 0%, transparent 70%)' }}
      />
      <div
        className="absolute left-[20%] top-[42%] h-[18%] w-[60%] rounded-[100%] opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.85) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-[35%]"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(232,242,251,0.6) 40%, #F4F7FA 100%)',
        }}
      />
    </div>
  );
}
