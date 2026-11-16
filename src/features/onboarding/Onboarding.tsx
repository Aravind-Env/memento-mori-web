import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Icon } from '../../shared/Icon'

import { MiniGrid } from '../grid/MiniGrid'
import { parseISODate, toISODate } from '../../domain/dates'
import {
  DEFAULT_LIFE_YEARS,
  MAX_LIFE_YEARS,
  MIN_LIFE_YEARS,
  getLifeStats,
} from '../../domain/lifeMath'
import { useStore } from '../../state/store'

export interface LifePreview {
  weeksLived: number
  totalWeeks: number
}

const HEADLINE = ['See', 'your', 'life']

/**
 * Cinematic welcome: headline + profile form on the left, and on the right an
 * empty stage the WebGPU constellation (rendered by the app backdrop) docks
 * into via [data-sphere-anchor]. Floating labels orbit the stage, and the
 * sphere previews the visitor's own life live as they type.
 */
export function Onboarding({ onPreview }: { onPreview?: (p: LifePreview | null) => void }) {
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

  // Feed the backdrop constellation so the sphere becomes *their* life.
  const previewLived = preview?.weeksLived ?? null
  useEffect(() => {
    onPreview?.(
      previewLived === null ? null : { weeksLived: previewLived, totalWeeks: lifeYears * 52 },
    )
  }, [previewLived, lifeYears, onPreview])
  useEffect(() => () => onPreview?.(null), [onPreview])

  const totalWeeks = lifeYears * 52
  const fill = `${((lifeYears - MIN_LIFE_YEARS) / (MAX_LIFE_YEARS - MIN_LIFE_YEARS)) * 100}%`

  return (
    <main className="onboarding">
      <section className="onboarding__intro">
        <p className="onboarding__badge">
          <span className="onboarding__badge-dot">
            <Icon name="sparkles" size={12} />
          </span>
          <span className="brand">Memento Mori</span>
          <span className="onboarding__badge-sep" aria-hidden="true" />
          <span>A private life-in-weeks</span>
        </p>

        <h1 className="onboarding__title">
          {HEADLINE.map((w, i) => (
            <span key={w} className="reveal-word" style={{ '--i': i } as CSSProperties}>
              {w}&nbsp;
            </span>
          ))}
          <em className="reveal-word" style={{ '--i': HEADLINE.length } as CSSProperties}>
            in weeks.
          </em>
        </h1>
        <p className="onboarding__lead">
          Every point of light is one week of a human life. Enter your birthday and watch your
          own constellation take shape — lived weeks glowing, the road ahead still dark.
        </p>

        <section className="onboarding__form" aria-label="Create your profile">
          <div className="field-row">
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
            </label>
          </div>
          {error ? (
            <span className="field__error" role="alert">
              {error}
            </span>
          ) : null}

          <label className="field">
            <span className="field__label field__label--row">
              <span>Expected lifespan</span>
              <strong>{lifeYears} years</strong>
            </span>
            <input
              type="range"
              className="field__range"
              min={MIN_LIFE_YEARS}
              max={MAX_LIFE_YEARS}
              value={lifeYears}
              style={{ '--fill': fill } as CSSProperties}
              onChange={(e) => setLifeYears(Number(e.target.value))}
            />
            <span className="field__hint">
              A statistical estimate, not a prediction — change it any time.
            </span>
          </label>

          <div className="onboarding__preview">
            <MiniGrid dob={canContinue ? parsed : null} lifeYears={lifeYears} height={96} />
            <div className="onboarding__preview-stats">
              {preview ? (
                <>
                  <p>
                    <strong>{preview.weeksLived.toLocaleString()}</strong>
                    <span>weeks lived</span>
                  </p>
                  <p>
                    <strong>{preview.weeksLeft.toLocaleString()}</strong>
                    <span>weeks ahead</span>
                  </p>
                </>
              ) : (
                <p className="onboarding__preview-empty">
                  Add your date of birth to see your weeks.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            disabled={!canContinue}
            onClick={() => createProfile(dob, lifeYears, name.trim())}
          >
            Begin
            <Icon name="arrowRight" size={16} />
          </button>
          <p className="privacy-note">
            <Icon name="lock" size={13} /> Nothing leaves your device. No account, no tracking.
          </p>
        </section>
      </section>

      {/* The constellation docks here; the labels orbit it. */}
      <section className="onboarding__stage" data-sphere-anchor aria-hidden="true">
        <div className="stage-chip stage-chip--a">
          <i className="stage-chip__dot" />
          <span>
            <strong>1 point</strong> = 1 week
          </span>
        </div>
        <div className="stage-chip stage-chip--b">
          <Icon name="infinity" size={14} />
          <span>
            <strong>{totalWeeks.toLocaleString()}</strong> weeks in {lifeYears} years
          </span>
        </div>
        <div className="stage-chip stage-chip--c">
          <i className="stage-chip__dot stage-chip__dot--now" />
          <span>
            {preview ? (
              <>
                You are here · <strong>{Math.round(preview.percent)}%</strong>
              </>
            ) : (
              <>You are here</>
            )}
          </span>
        </div>
        <p className="onboarding__stage-caption">
          <span>Memento mori</span> — remember that you will die. Then live like it.
        </p>
      </section>
    </main>
  )
}
