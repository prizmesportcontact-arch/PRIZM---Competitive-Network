import { useCallback, useEffect, useRef, useState } from 'react'
import StratBoard from '../../components/StratBoard/StratBoard'
import './StratPresenter.css'

/**
 * Mode présentation : la strat en plein écran, une étape à la fois, sans les outils.
 * ← / → (ou espace) pour changer d'étape, N pour les noms, Échap pour quitter.
 */
export default function StratPresenter({ strat, mapName, minimap, rotation, view, agentByUuid, scale, startIndex = 0, initialNames = true, onClose, onStep }) {
  const [index, setIndex] = useState(startIndex)
  const [names, setNames] = useState(initialNames)
  const rootRef = useRef(null)
  const steps = strat.steps
  const step = steps[Math.min(index, steps.length - 1)]

  const go = useCallback((i) => {
    const next = Math.max(0, Math.min(steps.length - 1, i))
    setIndex(next)
    onStep?.(steps[next].id)
  }, [steps, onStep])

  // Plein écran du navigateur (si possible) ; quitter le plein écran ferme la présentation
  useEffect(() => {
    const el = rootRef.current
    el?.requestFullscreen?.().catch(() => {})
    const onFs = () => { if (!document.fullscreenElement) onClose() }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [onClose])

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); e.stopImmediatePropagation(); go(index + 1) }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); e.stopImmediatePropagation(); go(index - 1) }
      else if (k === 'Home') { e.preventDefault(); e.stopImmediatePropagation(); go(0) }
      else if (k === 'End') { e.preventDefault(); e.stopImmediatePropagation(); go(steps.length - 1) }
      else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() }
      else if (k.toLowerCase() === 'n') { e.stopImmediatePropagation(); setNames((v) => !v) }
      else e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, index, steps.length, onClose])

  return (
    <div className="sp" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Présentation : ${strat.name}`}>
      <header className="sp-top">
        <div className="sp-title">
          <span className={`sp-side ${strat.side}`}>{strat.side === 'defense' ? 'Défense' : 'Attaque'}</span>
          <b>{strat.name}</b>
          {mapName && <small>{mapName}</small>}
        </div>
        <div className="sp-step" aria-live="polite">
          <span>Étape {index + 1}/{steps.length}</span>
          <b>{step.name}</b>
        </div>
        <div className="sp-top__actions">
          <button type="button" className={`sp-btn${names ? ' on' : ''}`} onClick={() => setNames((v) => !v)} aria-pressed={names} title="N">
            {names ? 'Masquer les noms' : 'Afficher les noms'}
          </button>
          <button type="button" className="sp-btn sp-btn--close" onClick={onClose} title="Échap">Quitter</button>
        </div>
      </header>

      <div className="sp-board">
        <StratBoard
          minimap={minimap}
          rotation={rotation}
          view={view}
          side={strat.side}
          items={step.items}
          stepKey={step.id}
          agentByUuid={agentByUuid}
          editable={false}
          showNames={names}
          scale={scale}
        />
        {step.items.length === 0 && <div className="sp-empty">Rien sur cette étape.</div>}
        <button type="button" className="sp-nav sp-nav--prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Étape précédente">‹</button>
        <button type="button" className="sp-nav sp-nav--next" onClick={() => go(index + 1)} disabled={index === steps.length - 1} aria-label="Étape suivante">›</button>
      </div>

      <footer className="sp-foot">
        <div className="sp-dots" role="tablist" aria-label="Étapes">
          {steps.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={i === index} className={`sp-dot${i === index ? ' on' : ''}${i < index ? ' done' : ''}`} onClick={() => go(i)}>
              <i>{i + 1}</i><span>{s.name}</span>
            </button>
          ))}
        </div>
        <p className="sp-hint">← → pour changer d’étape · N pour les noms · Échap pour quitter</p>
      </footer>
    </div>
  )
}
