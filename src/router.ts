import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';

// Root route
const rootRoute = createRootRoute();

// Index route (home)
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
});

// Catch-all routes with params
const connectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId',
});

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database',
});

const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database/$table',
});

// Route tree
const routeTree = rootRoute.addChildren([indexRoute, connectionRoute, databaseRoute, tableRoute]);

// Create router
export const router = createRouter({ routeTree });

// Type declarations
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
