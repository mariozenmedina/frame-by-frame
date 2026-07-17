# Loading and readiness

`mount()` establishes controller ownership and starts configured automatic loading. It does not wait for the network. `whenReady()` exposes the latest aggregate automatic-readiness cycle so an application can coordinate a loading screen.

## Loading-screen barrier

```ts
const loadingScreen = document.querySelector<HTMLElement>('#loading-screen');

try {
  loadingScreen?.setAttribute('aria-busy', 'true');

  await controller.mount();
  await controller.whenReady();

  loadingScreen?.setAttribute('hidden', '');
} catch (error) {
  // Keep a usable fallback and report the package error to the application.
  console.error(error);
} finally {
  loadingScreen?.removeAttribute('aria-busy');
}
```

`whenReady()` follows the latest committed responsive configuration. It waits only for automatically required work: untriggered on-demand bindings and `preload: 'none'` do not block it. Canvas readiness additionally waits for its first required successful draw.

## Full-file preload with progress

```ts
const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'hero',
          target: '#hero-video',
          clips: [
            {
              id: 'hero',
              preload: 'full',
              sources: [{ src: '/hero.mp4', type: 'video/mp4' }],
            },
          ],
          segments: [{ scroll: [0, 1], scrollUnit: 'progress', clip: 'hero', media: [0, 8] }],
        },
      ],
    },
  },
});

controller.on('loadprogress', ({ bindingId, ratio }) => {
  if (bindingId === 'hero' && ratio !== null) {
    updateProgressBar(ratio);
  }
});
```

Full preload fetches the complete selected asset into a shared, reference-counted `Blob`. It provides byte progress when the response exposes a total length, but costs memory and requires compatible CORS and fetch behavior.

## On-demand policies

Use viewport activation to prepare media shortly before its target is visible:

```ts
loading: {
  mode: 'on-demand',
  trigger: 'target-near-viewport',
  rootMargin: '500px 0px',
},
```

Use manual activation when application state decides when loading may begin:

```ts
loading: { mode: 'on-demand', trigger: 'manual' },
```

```ts
await controller.mount();
await controller.load('chapter'); // resolves when metadata is available
await controller.whenReady();
```

`first-use` activates when the binding first resolves to useful media work. `unload(id?)` cancels pending work, clears package-managed sources, and prevents implicit reload until `load()` is called. Always call `destroy()` when the integration ends.

See the [native video loading reference](../api/video.md#sources-and-loading) for the full readiness and cache contract.
