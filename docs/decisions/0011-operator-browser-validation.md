# ADR 0011: Keep real-browser validation operator-only

- Status: Accepted
- Date: 2026-07-17

## Context

Node-based structural fakes prove deterministic mapping, scheduling, loading state, ownership, and error behavior, but they cannot prove codec selection, media metadata, native seeking, intersection, canvas pixel access, or composed frames. Version 1 requires evidence from real browser engines without making large browser downloads and platform-dependent media behavior part of every contributor gate.

## Decision

The repository includes Playwright Test pinned to `1.61.1` and defines Chromium, Firefox, and WebKit projects. A dependency-free local server exposes only the built package and fixture directory, supports media byte ranges, and introduces no external network dependency during a run. Short WebM and MP4 files are generated specifically for this repository by a documented Docker command whose FFmpeg image is pinned by digest.

`pnpm test:browser` is the single complete operator command. It builds first and then executes portable scenarios across all projects with one worker. Browser binaries, results, traces, screenshots, and HTML reports remain operator-owned.

The browser command is excluded from `pnpm check`, GitHub Actions, and required checks. Agents may author and statically validate the suite but must never install browser binaries, launch Playwright browsers, or infer results. The public result record starts as `Not run` and changes only from operator evidence.

Hidden-document behavior and production hosting/encoding remain manual supplements because the repository suite cannot portably force every engine's real background lifecycle or represent every consumer asset.

## Consequences

- The release boundary distinguishes deterministic Node evidence from observed browser evidence.
- Contributors can reproduce browser scenarios locally without relying on an external application or media host.
- Pull requests remain fast and do not silently expand required CI infrastructure.
- Browser compatibility stays visibly unconfirmed until the operator records all three projects and manual supplements.
- A future support matrix may use these results, but one fixture set cannot guarantee arbitrary codecs, devices, CORS policies, or media servers.
