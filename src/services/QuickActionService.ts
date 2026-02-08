import type { App, TFile } from 'obsidian';
import type { QuickActionConfig, QuickActionUpdate } from '../types';

/**
 * Service for parsing quick action DSL and executing frontmatter updates.
 *
 * DSL Format: "label:prop=value,prop=value;label:prop=value"
 * Example: "Done:status=done,completed=TODAY;Archive:archived=TRUE"
 *
 * Special values resolved at execution time:
 * - TODAY: YYYY-MM-DD date
 * - NOW: ISO 8601 datetime
 * - TRUE: boolean true
 * - FALSE: boolean false
 */
export class QuickActionService {
	/**
	 * Parse the full DSL string into QuickActionConfig array.
	 * @param dsl - e.g. "Done:status=done,completed=TODAY;Archive:archived=TRUE"
	 */
	static parseDSL(dsl: string): QuickActionConfig[] {
		if (!dsl?.trim()) return [];

		const configs: QuickActionConfig[] = [];
		const actions = dsl.split(';');

		for (let i = 0; i < actions.length; i++) {
			const action = actions[i].trim();
			if (!action) continue;

			// Split by first colon only (label may not contain colons)
			const colonIdx = action.indexOf(':');
			if (colonIdx === -1) continue;

			const label = action.substring(0, colonIdx).trim();
			const updatesStr = action.substring(colonIdx + 1).trim();

			if (!label || !updatesStr) continue;

			const updates = this.parseUpdates(updatesStr);
			if (updates.length === 0) continue;

			configs.push({
				id: `quickAction_${i}`,
				label,
				updates,
			});
		}

		return configs;
	}

	/**
	 * Parse the updates portion of a single action.
	 * @param str - e.g. "status=done,completed=TODAY"
	 */
	static parseUpdates(str: string): QuickActionUpdate[] {
		if (!str?.trim()) return [];

		const updates: QuickActionUpdate[] = [];
		const pairs = str.split(',');

		for (const pair of pairs) {
			const trimmed = pair.trim();
			if (!trimmed) continue;

			const eqIdx = trimmed.indexOf('=');
			if (eqIdx === -1) continue;

			const property = trimmed.substring(0, eqIdx).trim();
			const value = trimmed.substring(eqIdx + 1).trim();

			if (!property) continue;

			updates.push({ property, value });
		}

		return updates;
	}

	/**
	 * Resolve special value tokens to their actual values.
	 * Called at execution time (click), not at parse time.
	 *
	 * @param value - raw value from DSL
	 * @returns resolved value (string, boolean, or number)
	 */
	static resolveValue(value: string): string | boolean | number {
		const upper = value.toUpperCase();

		switch (upper) {
			case 'TODAY': {
				const now = new Date();
				const year = now.getFullYear();
				const month = String(now.getMonth() + 1).padStart(2, '0');
				const day = String(now.getDate()).padStart(2, '0');
				return `${year}-${month}-${day}`;
			}
			case 'NOW': {
				return new Date().toISOString();
			}
			case 'TRUE':
				return true;
			case 'FALSE':
				return false;
			default:
				// Check if it's a number
				if (/^-?\d+(\.\d+)?$/.test(value)) {
					return parseFloat(value);
				}
				return value;
		}
	}

	/**
	 * Execute a quick action by updating frontmatter properties.
	 * Uses processFrontMatter for atomic read+write.
	 *
	 * @param app - Obsidian App instance
	 * @param file - Target file to update
	 * @param updates - Property updates to apply
	 */
	static async execute(
		app: App,
		file: TFile,
		updates: QuickActionUpdate[]
	): Promise<void> {
		await app.fileManager.processFrontMatter(file, (fm) => {
			for (const update of updates) {
				const resolvedValue = this.resolveValue(update.value);
				fm[update.property] = resolvedValue;
			}
		});
	}
}
