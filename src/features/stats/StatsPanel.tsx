import { formatDate } from '../../domain/dates'
import type { LifeStats } from '../../domain/lifeMath'

export interface StatsPanelProps {
  stats: LifeStats
  gentleMode: boolean
  onWriteThisWeek: () => void
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </div>
  )
}

export function StatsPanel({ stats, gentleMode, onWriteThisWeek }: StatsPanelProps) {
  const percentText = `${stats.percent.toFixed(1)}%`
  const birthdayText =
    stats.daysToBirthday === 0 ? 'Today!' : `${stats.daysToBirthday} day${stats.daysToBirthday === 1 ? '' : 's'}`

  return (
    <aside className="stats" aria-label="Life statistics">
      {!gentleMode && (
        <div className="stats__progress" role="img" aria-label={`${percentText} of expected life lived`}>
          <div className="stats__bar">
            <div className="stats__bar-fill" style={{ width: `${stats.percent}%` }} />
          </div>
          <span className="stats__progress-label">{percentText} of expected life lived</span>
        </div>
      )}

      <div className="stats__grid">
        <Stat label="Years lived" value={stats.ageYears.toLocaleString()} />
        <Stat label="Months lived" value={stats.monthsLived.toLocaleString()} />
        <Stat label="Weeks lived" value={stats.weeksLived.toLocaleString()} />
        <Stat label="Days lived" value={stats.daysLived.toLocaleString()} />
        {!gentleMode && (
          <Stat label="Weeks left" value={stats.weeksLeft.toLocaleString()} hint="estimated" />
        )}
        <Stat
          label="Next birthday"
          value={formatDate(stats.nextBirthday)}
          hint={birthdayText}
        />
      </div>

      {stats.isBonus && (
        <div className="stats__bonus" role="note">
          <strong>Bonus time.</strong> You have {stats.bonusWeeks.toLocaleString()} weeks beyond the
          expected lifespan. Every one is a gift — make it count.
        </div>
      )}

      <button type="button" className="btn btn--primary btn--block" onClick={onWriteThisWeek}>
        {stats.isBonus ? 'Write this week\u2019s note' : 'Make this week count \u2014 write a note'}
      </button>
    </aside>
  )
}
