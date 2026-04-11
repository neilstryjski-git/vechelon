import React from 'react';

const StatCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient">
    <h3 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">
      {label}
    </h3>
    <p className="font-headline text-4xl font-extrabold text-on-background">{value}</p>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">

      {/* Editorial Header */}
      <header>
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 block">
          Operations Overview
        </span>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-background">
          Dashboard
        </h2>
      </header>

      {/* Stat Cards — Tonal Layering (No-Line) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Active Rides"        value={0} />
        <StatCard label="Upcoming Scheduled"  value={0} />
        <StatCard label="Total Members"       value={0} />
      </div>

      {/* Recent Activity — No borders, tonal separation */}
      <div className="bg-surface-container-lowest rounded-xl shadow-ambient overflow-hidden">
        <div className="px-6 py-5 bg-surface-container-low flex justify-between items-center">
          <h3 className="font-headline font-bold tracking-tight text-on-background">
            Recent Activity
          </h3>
          <button className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors">
            View All
          </button>
        </div>
        <div className="p-12 text-center">
          <p className="font-label text-sm text-on-surface-variant tracking-tight">
            — No recent activity to display —
          </p>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
