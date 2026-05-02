import { Injectable } from '@nestjs/common';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { v4 as uuid } from 'uuid';

const UPLOAD_SEGMENT = 'verification';
const GALLERY_SEGMENT = 'gallery';
const DISH_SEGMENT = 'dishes';

@Injectable()
export class StorageService {
  private readonly uploadRoot = join(process.cwd(), 'uploads');

  getPublicUrl(storedRelativePath: string): string {
    const p = storedRelativePath.replace(/^\/+/, '');
    return `/api/v1/uploads/${p}`;
  }

  /**
   * Persists a file under uploads/verification/{cookId}/ and returns the stored relative path (no leading slash).
   */
  async saveVerificationFile(
    cookId: string,
    kind: 'kitchen' | 'healthCert' | 'certificate',
    index: number | undefined,
    buffer: Buffer,
    ext: string,
  ): Promise<string> {
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name =
      kind === 'kitchen'
        ? `kitchen-${index}-${uuid()}${safeExt}`
        : `${kind}-${uuid()}${safeExt}`;
    const relative = join(UPLOAD_SEGMENT, cookId, name).replace(/\\/g, '/');
    const full = join(this.uploadRoot, relative);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return relative;
  }

  /**
   * Persists a file under uploads/gallery/ and returns the stored relative path (no leading slash).
   */
  /**
   * Persists a dish image under uploads/dishes/{cookId}/ and returns the stored relative path.
   */
  async saveDishImage(cookId: string, buffer: Buffer, ext: string): Promise<string> {
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name = `dish-${uuid()}${safeExt}`;
    const relative = join(DISH_SEGMENT, cookId, name).replace(/\\/g, '/');
    const full = join(this.uploadRoot, relative);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return relative;
  }

  async saveGalleryFile(buffer: Buffer, ext: string): Promise<string> {
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name = `${uuid()}${safeExt}`;
    const relative = join(GALLERY_SEGMENT, name).replace(/\\/g, '/');
    const full = join(this.uploadRoot, relative);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return relative;
  }

  /**
   * Lists image files in uploads/gallery (JPEG, PNG, WebP), newest first by mtime.
   */
  async listGalleryImages(): Promise<{ path: string; url: string }[]> {
    const dir = join(this.uploadRoot, GALLERY_SEGMENT);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw e;
    }
    const imageName = /\.(jpe?g|png|webp)$/i;
    const entries: { path: string; url: string; mtimeMs: number }[] = [];
    for (const name of names) {
      if (!imageName.test(name)) continue;
      const full = join(dir, name);
      const st = await stat(full);
      if (!st.isFile()) continue;
      const relative = join(GALLERY_SEGMENT, name).replace(/\\/g, '/');
      entries.push({
        path: relative,
        url: this.getPublicUrl(relative),
        mtimeMs: st.mtimeMs,
      });
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries.map(({ path, url }) => ({ path, url }));
  }

  async removeStoredFiles(storedRelativePaths: string[]): Promise<void> {
    await Promise.all(
      storedRelativePaths.map(async (rel) => {
        if (!rel) return;
        const full = join(this.uploadRoot, rel.replace(/^\/+/, ''));
        try {
          await unlink(full);
        } catch {
          // ignore missing files
        }
      }),
    );
  }
}
