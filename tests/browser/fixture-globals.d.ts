type BrowserFixtureScenario =
  | 'document'
  | 'custom-x'
  | 'simultaneous'
  | 'multi-clip'
  | 'manual'
  | 'first-use'
  | 'viewport'
  | 'full'
  | 'full-abort'
  | 'responsive'
  | 'reduced-motion'
  | 'canvas'
  | 'lifecycle';

interface BrowserFixtureResolution {
  readonly phase: string;
  readonly clipId: string | null;
  readonly requestedTime: number;
  readonly targetTime: number;
}

interface BrowserFixtureBindingState {
  readonly id: string;
  readonly axis: 'x' | 'y';
  readonly renderer: 'video' | 'canvas';
  readonly loadState: string;
  readonly activeClipId: string | null;
  readonly selectedSource: string | null;
  readonly duration: number | null;
  readonly appliedTime: number | null;
  readonly presentedTime: number | null;
  readonly seeking: boolean;
  readonly errorCode: string | null;
  readonly resolution: BrowserFixtureResolution | null;
}

interface BrowserFixtureSnapshot {
  readonly status: string;
  readonly enabled: boolean;
  readonly sourceNodeType: number | null;
  readonly activeBreakpoints: readonly string[];
  readonly prefersReducedMotion: boolean;
  readonly axes: Readonly<
    Record<
      string,
      {
        readonly enabled: boolean;
        readonly offset: number;
        readonly max: number;
        readonly progress: number;
      }
    >
  >;
  readonly bindings: Readonly<Record<string, BrowserFixtureBindingState>>;
}

interface BrowserFixtureMetrics {
  readonly fetches: number;
  readonly abortSignals: number;
  readonly objectUrlsCreated: number;
  readonly objectUrlsRevoked: number;
  readonly scrollListenerAdds: number;
  readonly scrollListenerRemoves: number;
  readonly updates: readonly string[];
  readonly frames: number;
  readonly loadProgressEvents: number;
  readonly errors: readonly { readonly code: string; readonly message: string }[];
  readonly activeObjectUrls: number;
}

interface BrowserFixtureApi {
  setup(scenario: BrowserFixtureScenario): Promise<BrowserFixtureSnapshot>;
  ready(): Promise<BrowserFixtureSnapshot>;
  state(): BrowserFixtureSnapshot;
  load(): Promise<BrowserFixtureSnapshot>;
  unload(): BrowserFixtureSnapshot;
  enable(): BrowserFixtureSnapshot;
  disable(): BrowserFixtureSnapshot;
  refresh(): BrowserFixtureSnapshot;
  destroy(): BrowserFixtureSnapshot;
  scrollDocument(progress: number): Promise<void>;
  scrollSource(xProgress: number, yProgress: number): Promise<void>;
  revealViewportTarget(): Promise<void>;
  target(selector: string): {
    readonly currentTime: number;
    readonly duration: number | null;
    readonly readyState: number;
    readonly preload: string;
    readonly src: string;
    readonly hasSourceAttribute: boolean;
  };
  canvas(): {
    readonly width: number;
    readonly height: number;
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly nonTransparentPixels: number;
  };
  setCanvasCssWidth(width: number): void;
  metrics(): BrowserFixtureMetrics;
  settle(): Promise<void>;
}

declare global {
  interface Window {
    frameByFrameFixture: BrowserFixtureApi;
  }
}

export {};
