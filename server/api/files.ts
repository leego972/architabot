import { z } from 'zod';
import { router, publicProcedure } from '../_core/trpc';
import fs from 'fs/promises';
import path from 'path';

const BASE_DIR = path.resolve(process.cwd(), 'my_projects');

export const filesRouter = router({
  list: publicProcedure
    .input(z.object({ path: z.string().optional() }))
    .query(async ({ input }) => {
      const requestedPath = input.path ? path.normalize(input.path) : '';
      const fullPath = path.join(BASE_DIR, requestedPath);

      // Prevent directory traversal attacks
      if (!fullPath.startsWith(BASE_DIR)) {
        throw new Error('Invalid path');
      }

      const dirents = await fs.readdir(fullPath, { withFileTypes: true });
      return dirents.map((dirent) => ({
        name: dirent.name,
        path: path.join(requestedPath, dirent.name).replace(/\\/g, '/'),
        isDirectory: dirent.isDirectory(),
      }));
    }),
});
