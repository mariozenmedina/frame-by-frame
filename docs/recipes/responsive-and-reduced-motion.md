# Responsive timelines and reduced motion

Responsive overrides are ordered CSS media-query layers. Matching declarations apply in array order, so later declarations win. Overrides target existing axes and binding IDs; they cannot replace source or target ownership.

```ts
const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'story',
          target: '#story-video',
          clips: [{ id: 'desktop', sources: [{ src: '/story-wide.mp4' }] }],
          segments: [{ scroll: [0, 1], scrollUnit: 'progress', clip: 'desktop', media: [0, 10] }],
        },
      ],
    },
  },
  reducedMotion: 'first-frame',
  breakpoints: [
    {
      id: 'compact',
      query: '(max-width: 640px)',
      override: {
        axes: {
          y: {
            bindings: [
              {
                id: 'story',
                clips: [{ id: 'mobile', sources: [{ src: '/story-compact.mp4' }] }],
                segments: [
                  {
                    scroll: [0, 1],
                    scrollUnit: 'progress',
                    clip: 'mobile',
                    media: [0, 6],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  ],
});
```

`clips` and `segments` replace their complete collections. Other option groups merge shallowly. The full candidate is validated before it is committed, so a mismatched clip ID does not partially reconfigure the mounted renderer.

Reduced-motion behavior follows `(prefers-reduced-motion: reduce)` after mount:

| Value         | Behavior                                                       |
| ------------- | -------------------------------------------------------------- |
| `first-frame` | Pins the first timeline endpoint; this is the default          |
| `last-frame`  | Pins the last timeline endpoint                                |
| `disable`     | Stops media work and releases package-managed media references |
| `ignore`      | Leaves media behavior unchanged                                |

Prefer `first-frame`, `last-frame`, or `disable` unless the surrounding experience offers an equivalent user-controlled alternative. A responsive asset is not automatically a smaller download: choose loading policy and encoded sources together.

Listen for `breakpointchange` when application UI must reflect the committed cascade. See the [controller responsive contract](../api/controller.md#responsive-overrides) and [accessibility guide](../guides/accessibility.md).
