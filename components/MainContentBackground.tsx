import './MainContentBackground.css'

export function MainContentBackground() {
  return (
    <div aria-hidden="true" className="main-content-background">
      <svg
        className="main-content-background-map"
        preserveAspectRatio="xMidYMin meet"
        viewBox="0 0 1440 500"
      >
        <defs>
          <pattern height="11" id="background-map-dots" patternUnits="userSpaceOnUse" width="11">
            <circle cx="2" cy="2" r="1.45" />
          </pattern>
          <clipPath id="background-world-map">
            <path d="M412 112 438 86l43-10 30 10 23 25-8 20 24 12-10 23-26 7-7 21-24 8-7 27-22 8-10 31-20-4-10-25-24-9-6-24-24-15-6-23-23-14 3-27-15-20 19-17Zm64 109 22 14 15 26-10 24-19-2-9-22-17-13 3-19Zm157-174 25-17 26 6 13 20-10 16-28 1-15-10Zm20 71 27-14 33 4 9 15 28-2 12 17 26 5 13 20-17 11-27-8-20 13-27-4-7 20-19 7-12-19-29-1-12-18-20 1-9-15 17-16Zm77 54 28-3 16 15-7 21-15 5-11 20-16 17-15-6 7-22-13-17 5-19Zm47 112 31-8 34 8 18 19-16 14-31-5-26 8-20-15Zm153-179 26-14 29 7 11 15-18 12-28-3Zm73 32 20-12 26 8 15 21-18 10-25-7Zm-184-68 17-13 14 6-7 18-17 5Z" />
          </clipPath>
        </defs>
        <rect
          clipPath="url(#background-world-map)"
          fill="url(#background-map-dots)"
          height="500"
          width="1440"
        />
        <g className="background-route-lines" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M80 314c158-148 271 112 437-25s253-190 409-66 264 77 434-93" strokeDasharray="5 10" />
          <path d="M286 70c79 59 115 106 164 161s135 75 225 48" strokeDasharray="3 9" />
        </g>
        <g className="background-route-pins">
          <g transform="translate(82 309)">
            <path d="M0-12c-7 0-12 5-12 12 0 9 12 22 12 22S12 9 12 0C12-7 7-12 0-12Z" />
            <circle cy="0" r="3.5" />
          </g>
          <g transform="translate(519 289)">
            <path d="M0-10c-6 0-10 4-10 10 0 8 10 19 10 19S10 8 10 0C10-6 6-10 0-10Z" />
            <circle cy="0" r="3" />
          </g>
          <g transform="translate(925 222)">
            <path d="M0-10c-6 0-10 4-10 10 0 8 10 19 10 19S10 8 10 0C10-6 6-10 0-10Z" />
            <circle cy="0" r="3" />
          </g>
          <g transform="translate(1357 128)">
            <path d="M0-12c-7 0-12 5-12 12 0 9 12 22 12 22S12 9 12 0C12-7 7-12 0-12Z" />
            <circle cy="0" r="3.5" />
          </g>
        </g>
      </svg>
      <svg
        className="main-content-background-waves"
        preserveAspectRatio="none"
        viewBox="0 0 1440 180"
      >
        <path d="M0 64c220 52 375 49 586 8s392-52 577-13 187 38 277 2" />
        <path d="M0 104c220 38 382 35 591 2s390-37 572-5 191 32 277 6" />
      </svg>
    </div>
  )
}
