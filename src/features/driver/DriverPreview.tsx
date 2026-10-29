import { useEffect, useState, type ReactNode } from 'react'

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
}

export function DriverPreview({ children }: { children: ReactNode }) {
  const [phonePreview, setPhonePreview] = useState(() => !isMobileViewport())
  const [mobileViewport, setMobileViewport] = useState(isMobileViewport)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const updateViewport = () => {
      setMobileViewport(media.matches)
      if (media.matches) setPhonePreview(false)
    }

    updateViewport()
    media.addEventListener('change', updateViewport)
    return () => media.removeEventListener('change', updateViewport)
  }, [])

  const showPreview = phonePreview && !mobileViewport

  return (
    <div className={showPreview ? 'driver-preview-stage' : 'driver-fullscreen-stage'}>
      {!mobileViewport && (
        <div className="driver-preview-toolbar" role="group" aria-label="Driver app preview mode">
          <div>
            <strong>Driver App preview</strong>
            <span>Presentation mode · simulated device</span>
          </div>
          <button
            type="button"
            className="driver-preview-toggle"
            aria-pressed={showPreview}
            onClick={() => setPhonePreview((current) => !current)}
          >
            <span aria-hidden="true">{showPreview ? '▣' : '↗'}</span>
            {showPreview ? 'Open full screen' : 'Preview on iPhone'}
          </button>
        </div>
      )}

      {showPreview ? (
        <div className="driver-device" aria-label="iPhone simulator preview">
          <div className="driver-device-screen">
            <div className="driver-device-status" aria-label="Simulated iPhone status bar">
              <span className="driver-device-time">9:41</span>
              <span className="driver-dynamic-island" aria-hidden="true" />
              <span className="driver-device-indicators" aria-label="Cellular signal, Wi-Fi, battery">
                <i aria-hidden="true">▮▮▮</i>
                <i aria-hidden="true">◔</i>
                <i className="driver-device-battery" aria-hidden="true" />
              </span>
            </div>
            <div className="driver-device-app">{children}</div>
            <div className="driver-device-home" aria-hidden="true"><span /></div>
          </div>
        </div>
      ) : children}
    </div>
  )
}
