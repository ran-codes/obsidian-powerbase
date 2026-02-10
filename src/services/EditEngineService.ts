import { App, TFile } from 'obsidian';
import type { EditArgs } from '../types';

/**
 * Debounced write queue for frontmatter edits.
 * Adopts the DB Folder pattern: accumulate edits, debounce 250ms,
 * then process batch sequentially with 25ms delays between ops.
 */
export class EditEngineService {
	private static instances = new WeakMap<App, EditEngineService>();

	private app: App;
	private queue: EditArgs[] = [];
	private timeout: ReturnType<typeof setTimeout> | null = null;
	private processing = false;

	private constructor(app: App) {
		this.app = app;
	}

	static getInstance(app: App): EditEngineService {
		let instance = EditEngineService.instances.get(app);
		if (!instance) {
			instance = new EditEngineService(app);
			EditEngineService.instances.set(app, instance);
		}
		return instance;
	}

	/**
	 * Queue a frontmatter edit. Debounces with 250ms delay.
	 */
	updateRowFile(args: EditArgs): void {
		// Dedupe: if same file+property is already queued, replace it
		const existing = this.queue.findIndex(
			(e) => e.file.path === args.file.path && e.propertyName === args.propertyName
		);
		if (existing >= 0) {
			this.queue[existing] = args;
		} else {
			this.queue.push(args);
		}

		// Reset debounce timer
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		this.timeout = setTimeout(() => this.processBatch(), 250);
	}

	private async processBatch(): Promise<void> {
		if (this.processing || this.queue.length === 0) return;
		this.processing = true;

		// Take current queue and clear it
		const batch = [...this.queue];
		this.queue = [];
		this.timeout = null;

		for (const edit of batch) {
			try {
				await this.persistFrontmatter(edit);
			} catch (err) {
				console.error(
					`[Powerbase] Failed to update ${edit.file.path}:${edit.propertyName}`,
					err
				);
			}
			// 25ms delay between operations to prevent Obsidian from choking
			if (batch.indexOf(edit) < batch.length - 1) {
				await this.sleep(25);
			}
		}

		this.processing = false;

		// If new edits arrived during processing, schedule another batch
		if (this.queue.length > 0) {
			this.timeout = setTimeout(() => this.processBatch(), 250);
		}
	}

	private async persistFrontmatter(edit: EditArgs): Promise<void> {
		await this.app.fileManager.processFrontMatter(edit.file, (fm: any) => {
			fm[edit.propertyName] = edit.value;
		});
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
