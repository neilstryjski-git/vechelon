import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import PageHeader from './PageHeader';
import RideFormModal from './RideFormModal';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

type RideStatus = 'active' | 'alert' | 'idle' | 'created' | 'saved';

interface CalendarRide {
  id: string;
  name: string;
  scheduled_start: string;
  status: RideStatus;
  thumbnail_url?: string;
  riders: number; 
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useCalendarRides(year: number, month: number) {
  const startOfMonth = new Date(year, month, 1).toISOString();
  const endOfMonth   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  return useQuery<CalendarRide[]>({
    queryKey: ['calendar-rides', year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, status, thumbnail_url, ride_participants(count)')
        .gte('scheduled_start', startOfMonth)
        .lte('scheduled_start', endOfMonth)
        .order('scheduled_start', { ascending: true });

      if (error) throw error;
      
      return (data || []).map((r: any) => ({
        ...r,
        status: r.status as RideStatus,
        riders: (r.ride_participants as any)?.[0]?.count ?? 0
      }));
    },
  });
}

/* Geometric status indicator per DESIGN.md section 5:
 * Active/Positive  → tertiary solid circle
 * Alert/Priority   → error solid square
 * Idle/Passive     → outline-variant outlined triangle */
function StatusDot({ status }: { status: RideStatus }) {
  if (status === 'active') {
    return <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" aria-label="Active" />;
  }
  if (status === 'alert') {
    return <span className="w-2 h-2 rounded-none bg-error shrink-0" aria-label="Alert" />;
  }
  if (status === 'created') {
    return <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" aria-label="Scheduled" />;
  }
  return (
    <span
      className="shrink-0"
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        borderLeft:   '5px solid transparent',
        borderRight:  '5px solid transparent',
        borderBottom: '8px solid #acb3b8',
      }}
      aria-label="Idle"
    />
  );
}

function getCalendarCells(year: number, month: number) {
  const firstDay     = new Date(year, month, 1).getDay();      // 0=Sun
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const prevMonthEnd = new Date(year, month, 0).getDate();
  const padStart     = (firstDay + 6) % 7; // convert to Mon-start grid

  const cells: Array<{ day: number; currentMonth: boolean }> = [];

  for (let i = padStart; i > 0; i--) {
    cells.push({ day: prevMonthEnd - i + 1, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  const remaining = Math.ceil(cells.length / 7) * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false });
  }

  return cells;
}

const CalendarGrid: React.FC = () => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = getCalendarCells(year, month);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

  const setSelectedRideId = useAppStore((state) => state.setSelectedRideId);
  const { data: rides = [], isLoading } = useCalendarRides(year, month);

  const ridesForDay = (day: number) =>
    rides.filter((r) => {
      const d = new Date(r.scheduled_start);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className="space-y-8">

      <PageHeader 
        label="Central Dispatch"
        title="Ride Operations"
        description="Centralized logistics and fleet management. Coordinate routes, group assignments, and safety protocols from a unified tactical view."
      >
        {/* Month navigation */}
        <div className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-xl">
          <button
            onClick={prevMonth}
            className="p-1 rounded-full hover:bg-surface-container transition-colors active:scale-95"
            aria-label="Previous month"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_left</span>
          </button>
          <span className="font-label text-sm font-medium text-on-background min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded-full hover:bg-surface-container transition-colors active:scale-95"
            aria-label="Next month"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
          </button>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="signature-gradient text-on-primary px-6 py-3 rounded-md font-headline font-semibold flex items-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Create New Ride
        </button>
      </PageHeader>

      {/* Calendar Grid */}
      <div className="bg-surface-container-lowest rounded-xl shadow-ambient overflow-hidden">

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-surface-container-low border-b border-surface-container-highest">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className={`py-4 text-center font-label text-[10px] uppercase tracking-[0.2em] ${
                day === 'Sat' || day === 'Sun'
                  ? 'text-primary font-bold'
                  : 'text-on-surface-variant'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const ridesInCell = cell.currentMonth ? ridesForDay(cell.day) : [];
            const isToday     = cell.currentMonth
              && cell.day === today.getDate()
              && year  === today.getFullYear()
              && month === today.getMonth();

            return (
              <div
                key={idx}
                className={`p-4 border-r border-b border-surface-container-low transition-colors min-h-[140px] group
                  ${cell.currentMonth
                    ? 'bg-surface-container-lowest hover:bg-surface-container-low'
                    : 'bg-surface opacity-40'
                  }
                  ${idx % 7 === 6 ? 'border-r-0' : ''}
                `}
              >
                {/* Day number + status dots */}
                <div className="flex justify-between items-start mb-3">
                  <span
                    className={`font-label text-sm ${
                      isToday
                        ? 'bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold'
                        : 'font-bold text-on-surface'
                    }`}
                  >
                    {String(cell.day).padStart(2, '0')}
                  </span>
                  {ridesInCell.length > 0 && (
                    <div className="flex gap-1 items-center">
                      {ridesInCell.map((r, i) => (
                        <StatusDot key={i} status={r.status} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Ride cards */}
                <div className="space-y-1.5">
                  {isLoading && cell.currentMonth && (
                    <div className="h-4 w-full rounded bg-surface-container-high animate-pulse" />
                  )}
                  {ridesInCell.map((ride, i) => {
                    const time = new Date(ride.scheduled_start).toLocaleTimeString('en-GB', {
                      hour: '2-digit', minute: '2-digit'
                    });

                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedRideId(ride.id)}
                        className={`p-2.5 rounded shadow-ambient hover:-translate-y-0.5 transition-transform cursor-pointer border border-outline-variant/10 overflow-hidden ${
                          ride.status === 'alert'
                            ? 'bg-surface-container-high'
                            : 'bg-surface-container-lowest'
                        }`}
                      >
                        {ride.thumbnail_url && (
                          <div className="h-12 w-full mb-2 bg-surface-container-high -mt-2.5 -mx-2.5 w-[calc(100%+20px)]">
                            <img src={ride.thumbnail_url} className="w-full h-full object-cover" alt="" />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusDot status={ride.status} />
                          <span className="font-label text-[10px] text-on-surface-variant">
                            {time}
                          </span>
                        </div>
                        <h4 className="text-[11px] font-headline font-bold leading-tight text-on-background">
                          {ride.name}
                        </h4>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant opacity-70">
                            {ride.riders > 0 ? `${ride.riders} Riders` : 'No Riders'}
                          </span>
                          <span className="material-symbols-outlined text-[10px] text-on-surface-variant opacity-40">
                            arrow_forward_ios
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

      </div>
      <RideFormModal
        mode="create"
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(rideId) => navigate(`/builder/${rideId}`)}
      />
    </div>
  );
};

export default CalendarGrid;
