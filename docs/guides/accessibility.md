# Accessibility

Scroll-driven video is presentation, not a substitute for accessible content. The application remains responsible for semantics, controls, focus, contrast, and an equivalent way to understand the information.

## Reduced motion

The default `reducedMotion: 'first-frame'` follows the user's `(prefers-reduced-motion: reduce)` preference and pins a stable endpoint. `last-frame` or `disable` may better preserve the meaning of a particular experience. Use `ignore` only when the application provides an equivalent, user-controlled motion alternative.

Do not hijack scrolling or require unusually precise pointer movement. Content and navigation should remain usable when the controller is disabled or media fails.

## Equivalent content

- Provide meaningful text, captions, a transcript, or a static illustration for information conveyed by the video.
- Keep native controls enabled when users need conventional playback control.
- Give canvas output an accessible alternative; pixels alone expose no narrative structure.
- Avoid placing focusable controls inside layers that become hidden or inert as scrolling changes.
- Announce failures only when a user action requires a response; decorative media errors need not interrupt assistive technology.

## Loading screens

A loading screen should not trap focus or permanently hide the underlying content. Mark the relevant region busy with `aria-busy`, expose concise status text when waiting is material, and provide a usable fallback if `mount()` or `whenReady()` rejects. Untriggered on-demand media should not delay access to the page.

## Validation checklist

Test the experience with reduced motion enabled, keyboard-only navigation, screen-reader reading order, zoom and text resizing, high contrast, media failure, slow loading, and controller-disabled fallback. Confirm that page content is understandable without seeing frame transitions and that cleanup does not remove application-owned elements.
