import { DotLottieReact, setWasmUrl, type DotLottie } from '@lottiefiles/dotlottie-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import playerWasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import {
  animationFallbacks,
  logisticsAnimations,
  type LogisticsAnimationName,
  type LogisticsAnimationScene,
} from '../config/animations.js'
import './LogisticsAnimation.css'

setWasmUrl(playerWasmUrl)

interface LogisticsAnimationProps {
  name: LogisticsAnimationName
  width?: number | string
  height?: number | string
  autoplay?: boolean
  loop?: boolean
  speed?: number
  description?: string
  decorative?: boolean
  className?: string
  style?: CSSProperties
}

function AnimationScene({ scene }: { scene: LogisticsAnimationScene }) {
  if (scene === 'truck') {
    return (
      <>
        <path className="animation-cloud" d="M22 30h43m-31-8h28" />
        <path className="animation-road" d="M12 82h336" />
        <path className="animation-road-mark" d="M28 82h38m22 0h38m22 0h38m22 0h38m22 0h38m22 0h38" />
        <g className="animation-truck">
          <path d="M42 35h178v36H42z" fill="#fff" stroke="#9eb2cc" strokeWidth="2" />
          <path d="M48 40h166" stroke="#3783ff" strokeWidth="3" strokeLinecap="round" />
          <path d="M220 48h47l20 18v5h-67z" fill="#3783ff" />
          <path d="M254 51h11l15 13h-26z" fill="#d9ecff" />
          <rect x="231" y="58" width="12" height="9" rx="1" fill="#a9d2ff" />
          <circle cx="82" cy="73" r="10" fill="#34445a" />
          <circle cx="82" cy="73" r="4" fill="#eaf0f8" />
          <circle cx="206" cy="73" r="10" fill="#34445a" />
          <circle cx="206" cy="73" r="4" fill="#eaf0f8" />
          <circle cx="266" cy="73" r="10" fill="#34445a" />
          <circle cx="266" cy="73" r="4" fill="#eaf0f8" />
          <path d="M293 72h13" stroke="#efb54a" strokeWidth="4" strokeLinecap="round" />
        </g>
      </>
    )
  }

  if (scene === 'ship') {
    return (
      <>
        <path className="animation-water" d="M21 74c11-7 22 7 33 0s22 7 33 0 22 7 33 0 22 7 33 0 22 7 33 0 22 7 33 0" />
        <path d="M27 64h156l-16 20H48z" fill="#3783ff" />
        <g className="animation-container-stack">
          <rect x="54" y="43" width="37" height="21" rx="2" fill="#efb54a" />
          <rect x="95" y="43" width="37" height="21" rx="2" fill="#3783ff" />
          <rect x="136" y="43" width="31" height="21" rx="2" fill="#84a9d9" />
          <path d="M63 47v13m8-13v13m33-13v13m8-13v13m33-13v13m8-13v13" stroke="#fff" strokeOpacity=".4" />
        </g>
        <path d="M83 36V29h35v14" fill="#eaf2fc" stroke="#9eb2cc" strokeWidth="2" />
        <path d="M99 29v-7h4v7" fill="#efb54a" />
      </>
    )
  }

  if (scene === 'cargo-loading' || scene === 'cargo-unloading' || scene === 'warehouse' || scene === 'cargo') {
    const loading = scene === 'cargo-loading' || scene === 'warehouse'
    const cargoClass = scene === 'cargo-unloading' ? 'animation-cargo animation-cargo--out' : 'animation-cargo'
    return (
      <>
        <path d="M17 81h186" stroke="#bac8da" strokeWidth="2" />
        <path d="M129 37h67v42h-67z" fill="#f3f6fb" stroke="#9eb2cc" strokeWidth="2" />
        <path d="M136 43h53" stroke="#3783ff" strokeWidth="3" strokeLinecap="round" />
        <g className={cargoClass}>
          <rect x="144" y="53" width="25" height="20" rx="2" fill="#efb54a" />
          <path d="M150 58v10m6-10v10m6-10v10" stroke="#fff" strokeOpacity=".5" />
          <path d="M140 74h34" stroke="#765c2c" strokeWidth="3" />
        </g>
        <g className="animation-forklift">
          <path d="M34 59h35l11 16v5H31z" fill="#3783ff" />
          <path d="M41 59V44h20l8 15" fill="#d9ecff" stroke="#3783ff" strokeWidth="3" />
          <path d="M29 79h61" stroke="#34445a" strokeWidth="4" />
          <circle cx="43" cy="80" r="7" fill="#34445a" />
          <circle cx="76" cy="80" r="7" fill="#34445a" />
          <path d={loading ? 'M83 53v25m0-4h19' : 'M92 53v25m0-4h19'} stroke="#64758c" strokeWidth="3" />
        </g>
        {scene === 'warehouse' && <path d="M118 36V20l17-10 17 10v16" fill="none" stroke="#b8c6d9" strokeWidth="2" />}
      </>
    )
  }

  if (scene === 'document') {
    return (
      <>
        <rect x="39" y="12" width="60" height="73" rx="6" fill="#fff" stroke="#9eb2cc" strokeWidth="2" />
        <path d="M52 32h33M52 44h33M52 56h24M52 68h29" stroke="#b5c3d6" strokeWidth="3" strokeLinecap="round" />
        <path d="M29 72h88" stroke="#3783ff" strokeWidth="3" strokeLinecap="round" />
        <path className="animation-scan" d="M34 70v-8h78v8" fill="none" stroke="#efb54a" strokeWidth="3" />
        <circle cx="107" cy="22" r="10" fill="#eaf3ff" />
        <path d="m103 22 3 3 6-7" fill="none" stroke="#3783ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  }

  if (scene === 'success') {
    return (
      <>
        <path d="m19 39 36-19 37 19-37 20z" fill="#d8e8ff" stroke="#8eb8f0" strokeWidth="2" />
        <path d="M19 39v37l36 18V58z" fill="#fff" stroke="#8eb8f0" strokeWidth="2" />
        <path d="M92 39v37L55 94V58z" fill="#eef4fd" stroke="#8eb8f0" strokeWidth="2" />
        <circle className="animation-success-badge" cx="91" cy="29" r="17" fill="#3783ff" />
        <path d="m83 29 6 6 11-13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  }

  if (scene === 'loading') {
    return (
      <>
        <circle cx="24" cy="24" r="18" fill="none" stroke="#dbe6f5" strokeWidth="4" />
        <path className="animation-loader-arc" d="M24 6a18 18 0 0 1 18 18" fill="none" stroke="#3783ff" strokeWidth="4" strokeLinecap="round" />
      </>
    )
  }

  return (
    <>
      <path d="M17 78h102" stroke="#dbe4f0" strokeWidth="2" />
      <path d="M34 47h38v29H34zM79 37h31v39H79z" fill="#f5f8fc" stroke="#c3cfde" strokeWidth="2" />
      <path d="M42 55h22m-22 8h17m28-16h15m-15 8h15" stroke="#d4deeb" strokeWidth="2" strokeLinecap="round" />
    </>
  )
}

export function LogisticsAnimation({
  name,
  width,
  height,
  autoplay,
  loop,
  speed,
  description,
  decorative = true,
  className = '',
  style,
}: LogisticsAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [player, setPlayer] = useState<DotLottie | null>(null)
  const [loadedAsset, setLoadedAsset] = useState<string | null>(null)
  const [failedAsset, setFailedAsset] = useState<string | null>(null)
  const definition = logisticsAnimations[name] ?? logisticsAnimations[animationFallbacks.error]
  const fallbackDefinition = logisticsAnimations[definition.fallback]
  const isPlaying = autoplay ?? definition.autoplay
  const repeats = loop ?? definition.loop
  const playbackSpeed = speed ?? definition.speed
  const accessibleDescription = description ?? definition.description
  const usesPlayer = definition.animationType === 'dotlottie' && Boolean(definition.assetUrl)
  const isLoaded = !usesPlayer || loadedAsset === definition.assetUrl
  const hasFailed = Boolean(definition.assetUrl && failedAsset === definition.assetUrl)

  const setPlayerRef = useCallback((nextPlayer: DotLottie | null) => {
    setPlayer(nextPlayer)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!('IntersectionObserver' in window)) {
      const frame = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    }, { rootMargin: '120px' })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateMotionPreference)
    return () => mediaQuery.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    if (!player || !definition.assetUrl) return
    const assetUrl = definition.assetUrl
    const markLoaded = () => setLoadedAsset(assetUrl)
    const markFailed = () => setFailedAsset(assetUrl)
    player.addEventListener('load', markLoaded)
    player.addEventListener('loadError', markFailed)
    player.addEventListener('renderError', markFailed)
    if (player.isLoaded) {
      const frame = requestAnimationFrame(markLoaded)
      return () => {
        cancelAnimationFrame(frame)
        player.removeEventListener('load', markLoaded)
        player.removeEventListener('loadError', markFailed)
        player.removeEventListener('renderError', markFailed)
      }
    }
    return () => {
      player.removeEventListener('load', markLoaded)
      player.removeEventListener('loadError', markFailed)
      player.removeEventListener('renderError', markFailed)
    }
  }, [definition.assetUrl, player])

  useEffect(() => {
    if (!player || !usesPlayer || !isLoaded || hasFailed) return
    if (isPlaying && isVisible && pageVisible && !reducedMotion) {
      player.play()
    } else {
      player.pause()
    }
  }, [hasFailed, isLoaded, isPlaying, isVisible, pageVisible, player, reducedMotion, usesPlayer])

  const styleVars = {
    ...style,
    '--animation-duration': `${Math.max(0.1, 4 / Math.max(0.1, playbackSpeed))}s`,
    '--animation-play-state': isPlaying && isVisible && pageVisible && !reducedMotion ? 'running' : 'paused',
    '--animation-iteration-count': repeats ? 'infinite' : '1',
    width: width ?? definition.width,
    height: height ?? definition.height,
  } as CSSProperties

  return (
    <div
      className={`logistics-animation${isVisible ? ' logistics-animation--ready' : ''}${className ? ` ${className}` : ''}`}
      ref={containerRef}
      style={styleVars}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : accessibleDescription}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {isVisible && !hasFailed ? (
        usesPlayer && definition.assetUrl ? (
          <>
            {!isLoaded && <span className="logistics-animation-placeholder logistics-animation-placeholder--static" aria-hidden="true" />}
            <DotLottieReact
              aria-hidden="true"
              autoplay={false}
              className={`logistics-animation-player${isLoaded ? ' logistics-animation-player--loaded' : ''}`}
              dotLottieRefCallback={setPlayerRef}
              loop={repeats}
              renderConfig={{ autoResize: true, freezeOnOffscreen: true }}
              speed={playbackSpeed}
              src={definition.assetUrl}
              style={{ width: '100%', height: '100%' }}
            />
          </>
        ) : (
          <svg
            className={`logistics-animation-scene logistics-animation-scene--${definition.scene}`}
            role={decorative ? undefined : 'presentation'}
            aria-hidden={decorative ? 'true' : undefined}
            viewBox={definition.scene === 'loading' ? '0 0 48 48' : '0 0 360 100'}
            preserveAspectRatio="xMidYMid meet"
          >
            <AnimationScene scene={definition.scene} />
          </svg>
        )
      ) : (
        hasFailed ? (
          <svg
            className={`logistics-animation-scene logistics-animation-scene--${fallbackDefinition.scene}`}
            role={decorative ? undefined : 'presentation'}
            aria-hidden={decorative ? 'true' : undefined}
            viewBox={fallbackDefinition.scene === 'loading' ? '0 0 48 48' : '0 0 360 100'}
            preserveAspectRatio="xMidYMid meet"
          >
            <AnimationScene scene={fallbackDefinition.scene} />
          </svg>
        ) : <span className={`logistics-animation-placeholder logistics-animation-placeholder--${animationFallbacks.loading}`} aria-hidden="true" />
      )}
    </div>
  )
}
