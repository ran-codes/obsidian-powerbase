import { App, TFile } from 'obsidian';
import type { TableRowData, RollupConfig, AggregationType } from '../types';
import { ParseService } from './ParseService';
import { NoteSearchService } from './NoteSearchService';

/**
 * Computes rollup values by resolving relation links, reading target
 * properties from linked notes' frontmatter, and aggregating results.
 *
 * Uses a per-call frontmatter cache to avoid redundant metadataCache reads.
 */
export class RollupService {
	/**
	 * Compute all rollup values for every row.
	 * Returns a Map<rowIndex, Map<rollupId, computedValue>>.
	 */
	static computeRollups(
		app: App,
		rows: TableRowData[],
		rollupConfigs: RollupConfig[]
	): Map<number, Map<string, any>> {
		const result = new Map<number, Map<string, any>>();
		const fmCache = new Map<string, Record<string, any>>();

		for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
			const rowRollups = new Map<string, any>();

			for (const config of rollupConfigs) {
				const rawLinks = rows[rowIdx][config.relationPropertyId];
				const linkedFiles = RollupService.resolveLinks(
					app,
					rawLinks,
					rows[rowIdx].file.path
				);

				// Read target property from each linked note
				const values: any[] = linkedFiles.map((file) =>
					RollupService.readProperty(
						app,
						file,
						config.targetProperty,
						fmCache
					)
				);

				// Apply aggregation
				rowRollups.set(
					config.id,
					RollupService.aggregate(values, config.aggregation, linkedFiles.length)
				);
			}

			result.set(rowIdx, rowRollups);
		}

		return result;
	}

	/**
	 * Resolve relation links for a single cell.
	 * Handles both formats:
	 * - Wikilink arrays: ["[[NoteA]]", "[[NoteB]]"] → TFile[]
	 * - Text reference strings: "My Project" → TFile[] (single element)
	 * - Text reference arrays: ["Project A", "Project B"] → TFile[]
	 */
	private static resolveLinks(
		app: App,
		rawLinks: unknown,
		sourcePath: string
	): TFile[] {
		// Single text reference (e.g. project: "My Project")
		if (typeof rawLinks === 'string' && rawLinks.trim()) {
			const parsed = ParseService.parseWikiLink(rawLinks);
			if (parsed) {
				const resolved = NoteSearchService.resolveWikiLink(
					app,
					parsed.path,
					sourcePath
				);
				return resolved ? [resolved] : [];
			}
			// Try as text reference
			const resolved = NoteSearchService.resolveTextReference(
				app,
				rawLinks
			);
			return resolved ? [resolved] : [];
		}

		if (!Array.isArray(rawLinks)) return [];

		const files: TFile[] = [];
		for (const raw of rawLinks) {
			if (typeof raw !== 'string') continue;

			// Try as wikilink first
			const parsed = ParseService.parseWikiLink(raw);
			if (parsed) {
				const resolved = NoteSearchService.resolveWikiLink(
					app,
					parsed.path,
					sourcePath
				);
				if (resolved) files.push(resolved);
				continue;
			}

			// Try as text reference
			const resolved = NoteSearchService.resolveTextReference(app, raw);
			if (resolved) files.push(resolved);
		}
		return files;
	}

	/**
	 * Read a property from a file's frontmatter via metadataCache.
	 * Uses a cache to avoid reading the same file twice in one render cycle.
	 */
	private static readProperty(
		app: App,
		file: TFile,
		propertyName: string,
		cache: Map<string, Record<string, any>>
	): any {
		if (!cache.has(file.path)) {
			const fileCache = app.metadataCache.getFileCache(file);
			cache.set(file.path, fileCache?.frontmatter ?? {});
		}
		return cache.get(file.path)![propertyName] ?? null;
	}

	/**
	 * Apply an aggregation function to an array of values.
	 *
	 * @param values - Raw values from linked notes' frontmatter
	 * @param aggregation - The aggregation function to apply
	 * @param totalLinks - Total number of linked notes (including those with null values)
	 */
	static aggregate(
		values: any[],
		aggregation: AggregationType,
		totalLinks?: number
	): any {
		const total = totalLinks ?? values.length;

		switch (aggregation) {
			case 'count':
				return total;

			case 'count_values':
				return RollupService.filterNonNull(values).length;

			case 'sum': {
				const nums = RollupService.toNumbers(values);
				return nums.reduce((acc, n) => acc + n, 0);
			}

			case 'average': {
				const nums = RollupService.toNumbers(values);
				if (nums.length === 0) return 0;
				return nums.reduce((acc, n) => acc + n, 0) / nums.length;
			}

			case 'min': {
				const nums = RollupService.toNumbers(values);
				if (nums.length === 0) return null;
				return Math.min(...nums);
			}

			case 'max': {
				const nums = RollupService.toNumbers(values);
				if (nums.length === 0) return null;
				return Math.max(...nums);
			}

			case 'list':
				return RollupService.flattenAndResolveLinks(values);

			case 'unique': {
				const items = RollupService.flattenAndResolveLinks(values);
				const seen = new Set<string>();
				return items.filter((item) => {
					const key = typeof item === 'string' ? item : item.path;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
			}

			case 'percent_true': {
				const bools = values.filter((v) => typeof v === 'boolean');
				if (bools.length === 0) return total === 0 ? '(0/0) 0%' : `(0/${total}) 0%`;
				const trueCount = bools.filter((v) => v === true).length;
				const pct = Math.round((trueCount / total) * 100);
				return `(${trueCount}/${total}) ${pct}%`;
			}

			case 'percent_not_empty': {
				const nonEmpty = values.filter(
					(v) => v !== null && v !== undefined && v !== ''
				).length;
				if (total === 0) return '(0/0) 0%';
				const pct = Math.round((nonEmpty / total) * 100);
				return `(${nonEmpty}/${total}) ${pct}%`;
			}

			default:
				return null;
		}
	}

	/**
	 * Flatten values (expanding nested arrays) and resolve wikilinks to link objects.
	 * Returns a mixed array: `{ path, display }` for wikilinks, plain strings for text.
	 */
	private static flattenAndResolveLinks(values: any[]): Array<{ path: string; display: string } | string> {
		const result: Array<{ path: string; display: string } | string> = [];
		for (const v of RollupService.filterNonNull(values)) {
			const items = Array.isArray(v) ? v : [v];
			for (const item of items) {
				if (item === null || item === undefined) continue;
				const str = String(item);
				const parsed = ParseService.parseWikiLink(str);
				if (parsed) {
					result.push({ path: parsed.path, display: parsed.display });
				} else {
					result.push(str);
				}
			}
		}
		return result;
	}

	/** Coerce mixed values to valid numbers, discarding NaN. */
	private static toNumbers(values: any[]): number[] {
		return values
			.map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
			.filter((n) => !isNaN(n));
	}

	/** Filter out null and undefined values. */
	private static filterNonNull(values: any[]): any[] {
		return values.filter((v) => v !== null && v !== undefined);
	}
}
