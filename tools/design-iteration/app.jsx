const { useState, useEffect, useRef } = React;
const { TweaksPanel, useTweaks, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakButton } = window;
const IOSFrame = window.IOSDevice;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "world": "moon",
  "timeOfDay": 0.75,
  "autoCycle": false,
  "cycleSpeed": 0.05,
  "scrollSpeed": 1.0,
  "particleMul": 1.0,
  "dotTreatment": "glow",
  "dotPalette": "warmCool",
  "showDots": true,
  "showPipes": true,
  "showSky": true,
  "showCelestials": true,
  "showFarRidge": true,
  "showMidRidge": true,
  "showForeground": true,
  "showParticles": true,
  "skyTopHueShift": 0,
  "skyBotHueShift": 0
}/*EDITMODE-END*/;

// Logical phone canvas size — matches what production renders into
const W = 390;
const GAME_H = 720; // matches roughly the visible game area on a 390×844 frame

function MoonTweaks({ tweaks, setTweak }) {
  function exportTheme() {
    const out = JSON.stringify(window.CURRENT_THEME || window.MoonTheme, null, 2);
    navigator.clipboard?.writeText(out);
  }
  const themeLabel = (window.CURRENT_THEME || window.MoonTheme).label;
  return (
    <TweaksPanel title={`Tweaks · ${themeLabel}`}>
      <TweakSection title="Time of day">
        <TweakSlider
          label="Cycle position"
          value={tweaks.timeOfDay}
          onChange={(v) => setTweak('timeOfDay', v)}
          min={0} max={1} step={0.01}
          format={(v) => {
            const profile = (window.CURRENT_THEME || window.MoonTheme).cycleProfile || 'atmospheric';
            const n = window.ThemeSchema.cyclePhaseLabel(v, profile);
            return `${n} · ${(v * 100).toFixed(0)}%`;
          }}
        />
        <TweakToggle label="Auto cycle" value={tweaks.autoCycle} onChange={(v) => setTweak('autoCycle', v)} />
        <TweakSlider label="Cycle speed" value={tweaks.cycleSpeed} onChange={(v) => setTweak('cycleSpeed', v)} min={0.01} max={1} step={0.01} disabled={!tweaks.autoCycle} />
      </TweakSection>

      <TweakSection title="Motion">
        <TweakSlider label="Scroll speed" value={tweaks.scrollSpeed} onChange={(v) => setTweak('scrollSpeed', v)} min={0} max={3} step={0.05} />
        <TweakSlider label="Particle density" value={tweaks.particleMul} onChange={(v) => setTweak('particleMul', v)} min={0} max={2} step={0.05} />
      </TweakSection>

      <TweakSection title="Dots">
        <TweakRadio
          label="Treatment"
          value={tweaks.dotTreatment}
          onChange={(v) => setTweak('dotTreatment', v)}
          options={[
            { label: 'Plain', value: 'plain' },
            { label: 'Glow', value: 'glow' },
            { label: 'Ring', value: 'ring' },
            { label: 'Trail', value: 'trail' },
          ]}
        />
        <TweakRadio
          label="Palette"
          value={tweaks.dotPalette}
          onChange={(v) => setTweak('dotPalette', v)}
          options={[
            { label: 'Canon', value: 'canon' },
            { label: 'Softened', value: 'softened' },
            { label: 'Warm/cool', value: 'warmCool' },
            { label: 'World-tinted', value: 'worldTinted' },
          ]}
        />
        <TweakToggle label="Show dots" value={tweaks.showDots} onChange={(v) => setTweak('showDots', v)} />
        <TweakToggle label="Show demo pipe" value={tweaks.showPipes} onChange={(v) => setTweak('showPipes', v)} />
      </TweakSection>

      <TweakSection title="Layers (isolate)">
        <TweakToggle label="Sky" value={tweaks.showSky} onChange={(v) => setTweak('showSky', v)} />
        <TweakToggle label="Celestials (sun/moon)" value={tweaks.showCelestials} onChange={(v) => setTweak('showCelestials', v)} />
        <TweakToggle label="Far mountains" value={tweaks.showFarRidge} onChange={(v) => setTweak('showFarRidge', v)} />
        <TweakToggle label="Mid mountains" value={tweaks.showMidRidge} onChange={(v) => setTweak('showMidRidge', v)} />
        <TweakToggle label="Foreground hill" value={tweaks.showForeground} onChange={(v) => setTweak('showForeground', v)} />
        <TweakToggle label="Particles (clouds/birds/stars)" value={tweaks.showParticles} onChange={(v) => setTweak('showParticles', v)} />
      </TweakSection>

      <TweakSection title="Export">
        <TweakButton label="Copy theme JSON" onClick={exportTheme} />
      </TweakSection>
    </TweaksPanel>
  );
}

// Mount: app + (separately) tweaks panel that listens to host
function Root() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [nowMs, setNowMs] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  // URL-param override for ToD (used by reference-screenshot capture).
  // e.g. Moon.html?tod=0.5 — forces autoCycle off and sets the slider value.
  useEffect(() => {
    const m = window.location.search.match(/[?&]tod=([0-9.]+)/);
    if (m) {
      const v = Math.max(0, Math.min(1, parseFloat(m[1])));
      setTweak('autoCycle', false);
      setTweak('timeOfDay', v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rafRef = useRef(0);
  const lastT = useRef(performance.now());

  useEffect(() => {
    function tick(t) {
      const dt = Math.min(50, t - lastT.current);
      lastT.current = t;
      setNowMs(t);
      setScrollX((s) => s + dt * 0.06 * tweaks.scrollSpeed);
      if (tweaks.autoCycle) {
        setTweak('timeOfDay', (tweaks.timeOfDay + (dt / 1000) * tweaks.cycleSpeed * 0.05) % 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweaks.scrollSpeed, tweaks.autoCycle, tweaks.cycleSpeed, tweaks.timeOfDay]);

  const theme = window.CURRENT_THEME || window.MoonTheme;
  const themeIndex = window.CURRENT_THEME_INDEX || '01';

  // Apply cycle profile: convert raw slider g∈[0,1] to curve-sample t.
  // This is the renderer-side fix that makes day/night dominate and dawn/dusk
  // be brief transitions — instead of all four phases occupying equal 25% slabs.
  const profile = theme.cycleProfile || 'atmospheric';
  const { applyCycleProfile, cyclePhaseLabel } = window.ThemeSchema;
  const sampledT = applyCycleProfile(tweaks.timeOfDay, profile);

  const layerVisible = {
    sky: tweaks.showSky,
    celestials: tweaks.showCelestials,
    farRidge: tweaks.showFarRidge,
    midRidge: tweaks.showMidRidge,
    farMountains: tweaks.showFarRidge,
    midMountains: tweaks.showMidRidge,
    nearPlain: tweaks.showNearPlain,
    rollingHills: tweaks.showNearPlain,
    foreground: tweaks.showForeground,
    nearHill: tweaks.showForeground,
    particles: tweaks.showParticles,
  };

  const phaseLabel = cyclePhaseLabel(tweaks.timeOfDay, profile);

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: '#0a0a12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      color: '#e5e7eb',
      padding: 40,
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ position: 'relative' }} data-screen-label={`${themeIndex} ${theme.label}`}>
          <IOSFrame width={W} height={844} dark={true}>
            <div style={{ width: W, height: 844, background: '#000', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: GAME_H }}>
                <window.WorldRenderer
                  theme={theme}
                  t={sampledT}
                  rawT={tweaks.timeOfDay}
                  w={W}
                  gameH={GAME_H}
                  scrollX={scrollX}
                  nowMs={nowMs}
                  layerVisible={layerVisible}
                  scrollSpeed={tweaks.scrollSpeed}
                  particleMul={tweaks.particleMul}
                />
                <window.GameOverlay
                  w={W}
                  gameH={GAME_H}
                  dotTreatment={tweaks.dotTreatment}
                  dotPalette={tweaks.dotPalette}
                  theme={theme}
                  showPipes={tweaks.showPipes}
                  showDivider={tweaks.showDivider}
                  showDots={tweaks.showDots}
                  dotYOffset={0}
                  t={sampledT}
                />
              </div>
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                height: 844 - GAME_H,
                background: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3a3f55', fontSize: 11, letterSpacing: 2,
                fontFamily: 'ui-monospace, "SF Mono", monospace',
              }}>
                {theme.label.toUpperCase()} · {phaseLabel.toUpperCase()} · ×{theme.scoreMul}
              </div>
            </div>
          </IOSFrame>
        </div>

        <div style={{ maxWidth: 340, lineHeight: 1.55 }}>
          <div style={{ fontSize: 11, letterSpacing: 2.5, color: '#6b7080', marginBottom: 14 }}>
            WORLD {themeIndex} OF 03
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 600, margin: 0, marginBottom: 8, letterSpacing: -0.5, color: '#f3f4f7' }}>
            {theme.label}
          </h1>
          <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 22, fontStyle: 'italic' }}>
            {theme.tagline}
          </div>
          <div style={{ fontSize: 13, color: '#a8aebf' }}>
            ×{theme.scoreMul} score · {window.CURRENT_THEME_GRAVITY_LABEL || 'low gravity'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7080', marginTop: 28, paddingTop: 22, borderTop: '1px solid #1f2230' }}>
            <div style={{ marginBottom: 10 }}>{theme.bands.length} parallax bands</div>
            <div style={{ marginBottom: 10 }}>4 time-of-day keyframes</div>
            <div style={{ marginBottom: 10 }}>{theme.particles.length} particle systems · {theme.celestials.length} celestial</div>
            <div style={{ marginBottom: 10, marginTop: 18, color: '#9ba1b3' }}>
              Toggle <span style={{ color: '#e5e7eb', borderBottom: '1px dotted #6b7080' }}>Tweaks</span> in the toolbar to explore time-of-day, parallax, layers, and dot treatments.
            </div>
          </div>
        </div>
      </div>

      <MoonTweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
