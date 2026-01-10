import { z } from 'zod';

// Database form schema
export const databaseFormSchema = z.object({
  category: z.literal('database'),
  name: z.string().min(1, 'Connection name is required'),
  driver: z.enum(['postgres', 'mysql', 'sqlite', 'sqlserver', 'oracle']),
  dsn: z.string().min(1, 'Connection string is required'),
});

// S3 storage form schema
export const s3FormSchema = z.object({
  storageProvider: z.literal('s3'),
  name: z.string().min(1, 'Connection name is required'),
  s3Region: z.string(),
  s3AccessKeyId: z.string().min(1, 'Access Key ID is required'),
  s3SecretAccessKey: z.string().min(1, 'Secret Access Key is required'),
  s3Endpoint: z.string().optional(),
});

// Azure storage form schema
export const azureFormSchema = z.object({
  storageProvider: z.literal('azure-blob'),
  name: z.string().min(1, 'Connection name is required'),
  azureAccountName: z.string().min(1, 'Account Name is required'),
  azureAccountKey: z.string().optional(),
  azureConnectionString: z.string().optional(),
}).refine(
  (data) => !!data.azureAccountKey || !!data.azureConnectionString,
  { message: 'Either Account Key or Connection String is required', path: ['azureAccountKey'] }
);

// Storage form schema (discriminated by storageProvider)
export const storageFormSchema = z.object({
  category: z.literal('storage'),
}).and(z.discriminatedUnion('storageProvider', [s3FormSchema, azureFormSchema]));

// Combined schema - validates based on category
export const connectionFormSchema = z.union([
  databaseFormSchema,
  storageFormSchema,
]);

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;
