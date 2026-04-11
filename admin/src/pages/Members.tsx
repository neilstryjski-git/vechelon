import React, { useState } from 'react';

type MemberStatus = 'validated' | 'pending' | 'guest';
type ActiveTab = 'all' | 'validated' | 'pending' | 'guests';

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  status: MemberStatus;
  appliedAgo?: string;
  initials: string;
}

const MEMBERS: Member[] = [
  { id: '1', name: 'David Kjellberg',  email: 'd.kjellberg@velomail.com',       phone: '+46 8 123 45 67',  tier: 'Pro Member',    status: 'validated', initials: 'DK' },
  { id: '2', name: 'Amara Diallo',     email: 'a.diallo@domain.sn',             phone: '+221 77 123 45 67', tier: 'Club Member',   status: 'validated', initials: 'AD' },
  { id: '3', name: 'Sofia Lindqvist',  email: 'sofia.l@velocycling.se',          phone: '+46 70 234 56 78', tier: 'Pro Member',    status: 'validated', initials: 'SL' },
  { id: '4', name: 'James O\'Reilly',  email: 'james.oreilly@clubmail.ie',       phone: '+353 87 345 67 89', tier: 'Club Member',  status: 'validated', initials: 'JO' },
  { id: '5', name: 'Marcus Thorne',    email: 'm.thorne@velomail.com',           phone: '+44 7700 900 124', tier: 'Applicant',     status: 'pending', appliedAgo: '2h ago',        initials: 'MT' },
  { id: '6', name: 'Elena Rossi',      email: 'rossi.performance@domain.it',    phone: '+39 345 678 9012', tier: 'Applicant',     status: 'pending', appliedAgo: 'Yesterday',     initials: 'ER' },
  { id: '7', name: 'Tomás Vargha',     email: 't.vargha@rideclub.hu',           phone: '+36 20 987 65 43', tier: 'Guest',         status: 'guest',   appliedAgo: '3 days ago',    initials: 'TV' },
];

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'all',       label: 'All'                },
  { key: 'validated', label: 'Validated'          },
  { key: 'pending',   label: 'Pending Validation' },
  { key: 'guests',    label: 'Guests'             },
];

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="h-10 w-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
      <span className="font-label text-xs font-bold text-on-surface-variant">{initials}</span>
    </div>
  );
}


const Members: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');

  const handleTabClick = (key: ActiveTab) => {
    // Clicking the active filter deselects it → back to All
    setActiveTab(activeTab === key && key !== 'all' ? 'all' : key);
  };

  const validated = MEMBERS.filter((m) => m.status === 'validated');
  const pending   = MEMBERS.filter((m) => m.status === 'pending');
  const guests    = MEMBERS.filter((m) => m.status === 'guest');

  return (
    <div className="space-y-12">

      {/* Editorial Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-4">
        <div className="max-w-2xl">
          <span className="font-label text-xs uppercase tracking-widest text-primary mb-4 block">
            Central Command
          </span>
          <h1 className="font-headline text-5xl font-extrabold tracking-tight text-on-background mb-4">
            Member Directory
          </h1>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            Manage the collective strength of Vechelon. Control access levels, validate new
            entrants, and maintain the integrity of the rider network.
          </p>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
              System Policy
            </span>
            <span className="font-headline font-bold text-sm text-on-background">Strict Mode</span>
          </div>
          <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary-dim">
            <span className="sr-only">Toggle Strict Mode</span>
            <span className="inline-block h-4 w-4 transform rounded-full bg-on-primary transition translate-x-6" />
          </button>
        </div>
      </section>

      {/* Tab Navigation — No-Line underline style */}
      <div className="flex flex-wrap gap-8 border-b border-outline-variant/15">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            className={`pb-4 border-b-2 font-headline font-medium text-sm tracking-tight transition-all ${
              activeTab === key
                ? 'border-primary text-on-background font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-background'
            }`}
          >
            {label}
            {key === 'all' && (
              <span className="ml-2 font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">
                {MEMBERS.length}
              </span>
            )}
            {key === 'pending' && pending.length > 0 && (
              <span className="ml-2 font-label text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* All Tab */}
      {activeTab === 'all' && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-high/50 font-label text-[10px] uppercase tracking-widest text-outline">
            <div className="col-span-4">Member Identity</div>
            <div className="col-span-3">Contact Primary</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          {MEMBERS.map((m) => {
            const statusConfig = {
              validated: { dot: 'bg-tertiary rounded-full', label: 'Validated' },
              pending:   { dot: 'bg-error rounded-none',   label: 'Pending'   },
              guest:     { dot: 'bg-outline-variant rounded-full', label: 'Guest' },
            }[m.status];
            return (
              <div
                key={m.id}
                className="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-highest transition-colors"
              >
                <div className="col-span-4 flex items-center gap-4">
                  <Avatar initials={m.initials} />
                  <h5 className="font-headline font-bold text-sm text-on-background">{m.name}</h5>
                </div>
                <div className="col-span-3">
                  <p className="font-label text-xs text-on-surface-variant tracking-wider">{m.phone}</p>
                </div>
                <div className="col-span-2">
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">{m.tier}</span>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 shrink-0 ${statusConfig.dot}`} />
                    <span className="font-headline text-xs font-medium text-on-background">{statusConfig.label}</span>
                  </div>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button className="p-2 rounded-md hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant text-base">more_horiz</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Validated Tab */}
      {activeTab === 'validated' && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-high/50 font-label text-[10px] uppercase tracking-widest text-outline">
            <div className="col-span-5">Member Identity</div>
            <div className="col-span-3">Contact Primary</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
          {/* Rows — No Dividers (24px vertical space via py-6) */}
          {validated.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-highest transition-colors"
            >
              <div className="col-span-5 flex items-center gap-4">
                <Avatar initials={m.initials} />
                <div>
                  <h5 className="font-headline font-bold text-sm text-on-background">{m.name}</h5>
                  <span className="font-label text-[10px] text-tertiary uppercase tracking-widest">
                    {m.tier}
                  </span>
                </div>
              </div>
              <div className="col-span-3">
                <p className="font-label text-xs text-on-surface-variant tracking-wider">
                  {m.phone}
                </p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-tertiary" />
                  <span className="font-headline text-xs font-medium text-on-background">
                    Validated
                  </span>
                </div>
              </div>
              <div className="col-span-2 flex justify-end">
                <button className="p-2 rounded-md hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant text-base">
                    more_horiz
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-high/50 font-label text-[10px] uppercase tracking-widest text-outline">
            <div className="col-span-4">Member Identity</div>
            <div className="col-span-3">Contact Primary</div>
            <div className="col-span-2">Applied</div>
            <div className="col-span-3 text-right">Action</div>
          </div>
          {pending.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-highest transition-colors"
            >
              <div className="col-span-4 flex items-center gap-4">
                <Avatar initials={m.initials} />
                <div>
                  <h5 className="font-headline font-bold text-sm text-on-background">{m.name}</h5>
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                    {m.email}
                  </span>
                </div>
              </div>
              <div className="col-span-3">
                <p className="font-label text-xs text-on-surface-variant tracking-wider">{m.phone}</p>
              </div>
              <div className="col-span-2">
                <span className="font-label text-xs text-on-surface-variant">{m.appliedAgo}</span>
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                <button className="signature-gradient text-on-primary px-4 py-2 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95">
                  Validate
                </button>
                <button className="p-2 rounded-md hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant text-base">more_horiz</span>
                </button>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <p className="font-label text-sm text-on-surface-variant text-center py-12">
              — No pending applications —
            </p>
          )}
        </div>
      )}

      {/* Guests Tab */}
      {activeTab === 'guests' && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-high/50 font-label text-[10px] uppercase tracking-widest text-outline">
            <div className="col-span-5">Identity</div>
            <div className="col-span-4">Contact</div>
            <div className="col-span-3 text-right">Action</div>
          </div>
          {guests.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-highest transition-colors"
            >
              <div className="col-span-5 flex items-center gap-4">
                <Avatar initials={m.initials} />
                <div>
                  <h5 className="font-headline font-bold text-sm text-on-background">{m.name}</h5>
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Guest — {m.appliedAgo}
                  </span>
                </div>
              </div>
              <div className="col-span-4">
                <p className="font-label text-xs text-on-surface-variant tracking-wider">{m.phone}</p>
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                <button className="signature-gradient text-on-primary px-4 py-2 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95">
                  Invite
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default Members;
