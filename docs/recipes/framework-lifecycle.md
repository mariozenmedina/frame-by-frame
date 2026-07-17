# SSR and framework lifecycle

Package imports and controller creation do not access browser globals. DOM references are resolved by `mount()`, so an integration should create and mount a controller only in its framework's client-side mounted phase, then destroy it synchronously during unmount.

Keep the framework adapter thin:

```ts
import { createFrameByFrame } from '@frame-by-frame/core';
import type { FrameByFrameController, FrameByFrameOptions } from '@frame-by-frame/core/types';

export function mountFrameByFrame(options: FrameByFrameOptions): {
  controller: FrameByFrameController;
  ready: Promise<void>;
  destroy: () => void;
} {
  const controller = createFrameByFrame(options);

  return {
    controller,
    ready: controller
      .mount()
      .then(() => controller.whenReady())
      .then(() => undefined),
    destroy: () => controller.destroy(),
  };
}
```

Use it from the framework lifecycle:

1. Render the target and scroll container.
2. In the client mount hook, create the controller with selectors, elements, or resolvers.
3. Await `ready` only when application UI needs an aggregate loading barrier.
4. Forward state or events into framework state only when the UI consumes them.
5. Call `destroy()` in the synchronous cleanup returned by the lifecycle hook.

Do not store the controller in serializable server state. Do not mount twice to work around rerenders; keep a stable instance and call `refresh()` after application-owned layout changes. If configuration must change, destroy the old controller before creating its replacement.

Vue will become the first maintained framework example after the core's first release. Until its adapter contract is established, this generic pattern is the supported integration boundary. See the [controller lifecycle reference](../api/controller.md#lifecycle) and [loading recipe](loading-and-readiness.md).
