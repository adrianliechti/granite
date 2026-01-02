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

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database',
});

const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$connectionId/$database/$table',
});

const routeTree = rootRoute.addChildren([indexRoute, connectionRoute, databaseRoute, tableRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
