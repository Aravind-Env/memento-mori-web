/**
 * Misty landscape that sits behind the week dots: a warm sun low on the right,
 * layered hill silhouettes, a lone hiker on the left ridge and a few birds.
 * Colours come from the design tokens so it follows light/dark themes.
 */
export function LandscapeScene() {
  return (
    <svg
      className="mm-scene"
      viewBox="0 0 1000 560"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="mm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--sky)" stopOpacity=".55" />
          <stop offset="100%" stopColor="var(--sky)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mm-fadeL" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".35" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="mm-mk">
          <rect width="1000" height="560" fill="url(#mm-fadeL)" />
        </mask>
      </defs>

      <circle cx="720" cy="420" r="230" fill="url(#mm-glow)" />
      <g mask="url(#mm-mk)">
        <circle cx="740" cy="420" r="58" fill="var(--sun)" />
        <path
          d="M330 560L430 480L520 505L640 430L760 500L860 445L1000 520V560Z"
          fill="var(--m1)"
          opacity=".5"
        />
        <path
          d="M540 560L690 485L790 395L870 470L1000 430V560Z"
          fill="var(--m2)"
          opacity=".6"
        />
        <path
          d="M300 560L400 520Q480 500 560 540L640 560Z"
          fill="var(--m3)"
          opacity=".45"
        />
      </g>

      {/* hill + hiker */}
      <path
        d="M0 560V470Q40 455 90 452L150 442L205 475L240 520L280 560Z"
        fill="var(--hill)"
        opacity=".92"
      />
      <g fill="#14161b">
        <circle cx="112" cy="418" r="6.5" />
        <path d="M103 426Q112 422 121 426L123 450H101Z" />
        <rect x="102" y="449" width="8" height="26" rx="2" />
        <rect x="112" y="449" width="8" height="26" rx="2" />
        <rect x="120" y="427" width="11" height="22" rx="4" />
      </g>

      <g fill="none" stroke="var(--m3)" strokeWidth="2" strokeLinecap="round">
        <path d="M650 255q6-7 12 0q6-7 12 0" />
        <path d="M560 325q5-6 10 0q5-6 10 0" />
        <path d="M800 345q6-7 12 0q6-7 12 0" />
      </g>
    </svg>
  )
}
