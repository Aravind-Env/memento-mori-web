import { useMemo, useState } from 'react'

import { MiniGrid } from '../grid/MiniGrid'
import { parseISODate, toISODate } from '../../domain/dates'
import {
  DEFAULT_LIFE_YEARS,
  MAX_LIFE_YEARS,
  MIN_LIFE_YEARS,
  getLifeStats,
} from '../../domain/lifeMath'
import { useStore } from '../../state/store'

export function Onboarding() {
  const createProfile = useStore((s) => s.createProfile)

  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [lifeYears, setLifeYears] = useState(DEFAULT_LIFE_YEARS)

  const today = useMemo(() => new Date(), [])
  const maxDob = toISODate(today)
  const parsed = dob ? parseISODate(dob) : null

  const error = (() => {
    if (!dob) return ''
    if (!parsed || Number.isNaN(parsed.getTime())) return 'Please enter a valid date.'
    if (parsed > today) return 'Your date of birth cannot be in the future.'
    if (today.getFullYear() - parsed.getFullYear() > 130) return 'That date looks too far back.'
    return ''
  })()

  const canContinue = !!parsed && !error
  const preview = parsed && !error ? getLifeStats(parsed, lifeYears, today) : null

  return (
    <main className="onboarding">
      <OnboardingBackdrop />
      <section className="onboarding__intro">
        <div className="onboarding__art" aria-hidden="true">
          <HourglassArt />
        </div>
        <p className="brand">Memento Mori</p>
        <h1 className="onboarding__title">See your life in weeks.</h1>
        <p className="onboarding__lead">
          One date of birth paints a grid of every week you may live — filled for lived weeks,
          outlined for the road ahead. Then keep a note for any week that matters.
        </p>
        <ul className="onboarding__points">
          <li>Everything is calculated from today&apos;s date, automatically.</li>
          <li>Your data stays on this device. No account, no tracking.</li>
          <li>You can change any of this later in Settings.</li>
        </ul>
      </section>

      <section className="onboarding__form" aria-label="Create your profile">
        <label className="field">
          <span className="field__label">Name (optional)</span>
          <input
            type="text"
            className="field__input"
            value={name}
            placeholder="What should we call you?"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Date of birth</span>
          <input
            type="date"
            className="field__input"
            value={dob}
            max={maxDob}
            onChange={(e) => setDob(e.target.value)}
          />
          {error ? (
            <span className="field__error" role="alert">
              {error}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field__label">
            Expected lifespan: <strong>{lifeYears} years</strong>
          </span>
          <input
            type="range"
            className="field__range"
            min={MIN_LIFE_YEARS}
            max={MAX_LIFE_YEARS}
            value={lifeYears}
            onChange={(e) => setLifeYears(Number(e.target.value))}
          />
          <span className="field__hint">
            A statistical estimate, not a prediction — change it any time.
          </span>
        </label>

        <div className="onboarding__preview">
          <MiniGrid dob={canContinue ? parsed : null} lifeYears={lifeYears} />
          {preview ? (
            <p className="onboarding__preview-stat">
              <strong>{preview.weeksLived.toLocaleString()}</strong> weeks lived ·{' '}
              <strong>{preview.weeksLeft.toLocaleString()}</strong> weeks ahead
            </p>
          ) : (
            <p className="onboarding__preview-stat">Add your date of birth to see a preview.</p>
          )}
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!canContinue}
          onClick={() => createProfile(dob, lifeYears, name.trim())}
        >
          Begin
        </button>
        <p className="privacy-note">
          🔒 Nothing leaves your device. Take a backup from Settings whenever you like.
        </p>
      </section>
    </main>
  )
}

/** Calm "between life and death" backdrop: a breathing glow, drifting embers and stars. */
function OnboardingBackdrop() {
  return (
    <div className="onboarding__backdrop" aria-hidden="true">
      <span className="onboarding__glow" />
      <span className="onboarding__stars" />
      <span className="onboarding__horizon" />
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`ember ember--${i + 1}`} />
      ))}
    </div>
  )
}

/** SVG hourglass whose sand falls in a loop, echoing time running between life and death. */
function HourglassArt() {
  return (
    <svg className="hourglass" viewBox="0 0 64 96" role="presentation">
      <defs>
        <clipPath id="mm-top-bulb">
          <path d="M14 10 L50 10 L34 48 L30 48 Z" />
        </clipPath>
        <clipPath id="mm-bottom-bulb">
          <path d="M30 48 L34 48 L50 86 L14 86 Z" />
        </clipPath>
      </defs>

      {/* Sand — top bulb drains while the bottom fills. */}
      <g clipPath="url(#mm-top-bulb)">
        <rect className="hourglass__sand hourglass__sand--top" x="12" y="10" width="40" height="40" />
      </g>
      <g clipPath="url(#mm-bottom-bulb)">
        <rect className="hourglass__sand hourglass__sand--bottom" x="12" y="46" width="40" height="42" />
      </g>

      {/* Falling grain. */}
      <rect className="hourglass__grain" x="31.2" y="48" width="1.6" height="10" />

      {/* Glass and frame. */}
      <path
        className="hourglass__glass"
        d="M12 8 L52 8 L36 48 L52 88 L12 88 L28 48 Z"
        fill="none"
      />
      <rect className="hourglass__frame" x="8" y="4" width="48" height="5" rx="2.5" />
      <rect className="hourglass__frame" x="8" y="87" width="48" height="5" rx="2.5" />
    </svg>
  )
}
