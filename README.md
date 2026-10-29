# SK Transworld UI Kit

Reusable visual foundation extracted from the SK Transworld Logistics React application.

## Included

- `theme/global.css`: design tokens, pale blue-gray canvas, surface colors, typography defaults, focus states, and modern native select styling.
- `components/MainContentBackground.*`: responsive map-dot, route-line, wave, and gradient background.
- `components/ConfirmationModal.*`: accessible confirmation dialog with Escape handling, focus management, loading and error states.
- `components/ConfirmationProvider.tsx`, `useConfirmation.ts`, and `confirmationTypes.ts`: promise-based confirmation flow.
- `components/LogisticsAnimation.*`: optional Lottie animation wrapper.
- `assets/`: supporting decorative and logistics artwork.
- `AGENTS.md`: integration and design guidance for coding agents.

## Use in a React project

1. Copy `theme/global.css` into the application's global stylesheet and import it from the entry point.
2. Copy the desired components and their adjacent CSS files into `src/components`.
3. Wrap the application with `ConfirmationProvider` if using the confirmation hook.
4. Install only the optional animation dependencies when using `LogisticsAnimation`:

```bash
pnpm add @lottiefiles/dotlottie-react @lottiefiles/dotlottie-web
```

The kit contains styling and reusable primitives, not application-specific models, routes, API calls, or demo data.

