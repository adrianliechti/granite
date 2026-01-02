import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';
import { z } from 'zod';

// Search params schema for query state
const querySearchSchema = z.object({
  connectionId: z.string().optional(),
  database: z.string().optional(),
  table: z.string().optional(),
});

export type QuerySearch = z.infer<typeof querySearchSchema>;

// Root route
const rootRoute = createRootRoute();

// Index route with search params for state
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: querySearchSchema,
});

// Route tree
const routeTree = rootRoute.addChildren([indexRoute]);

// Create router
export const router = createRouter({ routeTree });

// Type declarations
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { indexRoute };
