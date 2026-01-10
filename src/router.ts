import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
});

const connectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId',
});

// Storage route - more specific, has literal "container" segment
// Must be defined before database routes to take precedence
const storageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/container/$container/$',
});

// Database routes
const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database',
});

const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database/$table',
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  storageRoute,   // Most specific: has literal "container" segment
  tableRoute,     // 3 params
  databaseRoute,  // 2 params
  connectionRoute, // 1 param (least specific)
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
